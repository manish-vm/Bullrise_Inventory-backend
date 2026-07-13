const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const SalesOrder = require('../models/SalesOrder');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');
const { createMovement, statusFor, updateWarehouseCapacity } = require('../services/stockService');

const totals = (items = []) => items.reduce((sum, item) => sum + ((item.quantity * item.price) - (item.discount || 0) + (item.tax || 0)), 0);

exports.list = asyncHandler(async (req, res) => {
  const { search = '', status, source, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ orderNo: new RegExp(search, 'i') }, { customerName: new RegExp(search, 'i') }, { customerPhone: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (source && source !== 'All Sources') filter.source = source;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    SalesOrder.find(filter).sort('-createdAt').skip(skip).limit(Number(limit)),
    SalesOrder.countDocuments(filter)
  ]);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

exports.create = asyncHandler(async (req, res) => {
  const orderItems = (req.body.items || []).map((item) => ({ ...item, total: (item.quantity * item.price) - (item.discount || 0) + (item.tax || 0) }));
  const total = totals(orderItems);
  const order = await SalesOrder.create({ ...req.body, items: orderItems, subtotal: total, total });
  await Activity.create({ module: 'sales', title: `${order.orderNo} created`, description: `${order.customerName} - ${order.total}`, dateText: new Date().toLocaleString(), type: 'success' });
  created(res, order);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let updatedOrder;
  try {
    await session.withTransaction(async () => {
      const order = await SalesOrder.findById(req.params.id).session(session);
    if (!order) throw new Error('Sales order not found');
    const nextStatus = req.body.status;
    const validTransitions = {
      Pending: ['Confirmed', 'Cancelled'],
      Confirmed: ['Packed', 'Shipped', 'Cancelled'],
      Packed: ['Shipped', 'Cancelled'],
      Shipped: ['Delivered', 'Returned'],
      Delivered: ['Returned'],
      Cancelled: [],
      Returned: []
    };
    if (!validTransitions[order.status]?.includes(nextStatus)) {
      throw new Error(`Cannot change sales order from ${order.status} to ${nextStatus}`);
    }

    if (nextStatus === 'Confirmed' && order.status === 'Pending') {
      for (const item of order.items) {
        const stock = await FinishedGoodsStock.findOne({ sku: item.sku }).sort('-availableQuantity').session(session);
        if (!stock || stock.availableQuantity < item.quantity) throw new Error(`Insufficient stock for ${item.sku}`);
        stock.availableQuantity -= item.quantity;
        stock.reservedQuantity += item.quantity;
        stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
        await stock.save({ session });
      }
    }

    if (nextStatus === 'Packed' && order.status === 'Confirmed') {
      await Activity.create([{ module: 'sales', title: `${order.orderNo} packed`, description: 'Reserved stock moved to packing', dateText: new Date().toLocaleString(), type: 'purple' }], { session });
    }

    if (['Shipped', 'Delivered'].includes(nextStatus) && ['Confirmed', 'Packed'].includes(order.status)) {
      for (const item of order.items) {
        const stock = await FinishedGoodsStock.findOne({ sku: item.sku }).sort('-reservedQuantity').session(session);
        if (!stock || stock.reservedQuantity < item.quantity) throw new Error(`Reserved stock missing for ${item.sku}`);
        stock.reservedQuantity -= item.quantity;
        stock.totalQuantity -= item.quantity;
        await stock.save({ session });
        await updateWarehouseCapacity(stock.warehouse, {
          stockOut: item.quantity,
          valueOut: item.quantity * Number(stock.unitCost || 0)
        }, { session });
        await createMovement({
          movementType: 'SALE',
          itemType: 'FINISHED_GOOD',
          referenceType: 'SalesOrder',
          referenceId: String(order._id),
          sku: item.sku,
          warehouseId: stock.warehouse,
          locationId: stock.location,
          quantityOut: item.quantity,
          balanceAfter: stock.availableQuantity,
          totalValue: item.total,
          remarks: `${order.orderNo} shipped`
        }, { session });
      }
    }

    if (nextStatus === 'Cancelled' && ['Confirmed', 'Packed'].includes(order.status)) {
      for (const item of order.items) {
        const stock = await FinishedGoodsStock.findOne({ sku: item.sku }).sort('-reservedQuantity').session(session);
        if (stock) {
          const releaseQty = Math.min(stock.reservedQuantity, item.quantity);
          stock.reservedQuantity -= releaseQty;
          stock.availableQuantity += releaseQty;
          stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
          await stock.save({ session });
        }
      }
    }

    order.status = nextStatus;
    updatedOrder = await order.save({ session });
      await Activity.create([{ module: 'sales', title: `${order.orderNo} ${nextStatus.toLowerCase()}`, description: `Sales order status changed to ${nextStatus}`, dateText: new Date().toLocaleString(), type: nextStatus === 'Cancelled' ? 'danger' : 'success' }], { session });
    });
  } finally {
    session.endSession();
  }
  ok(res, updatedOrder);
});

exports.stats = asyncHandler(async (req, res) => {
  const rows = await SalesOrder.find();
  const count = (status) => rows.filter((row) => row.status === status).length;
  ok(res, {
    totalOrders: rows.length,
    confirmed: count('Confirmed'),
    shipped: count('Shipped') + count('Delivered'),
    cancelled: count('Cancelled'),
    returned: count('Returned'),
    salesValue: rows.reduce((sum, row) => sum + row.total, 0)
  });
});
