const asyncHandler = require('express-async-handler');
const CustomerReturn = require('../models/CustomerReturn');
const SalesOrder = require('../models/SalesOrder');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');
const { createMovement, statusFor } = require('../services/stockService');

exports.list = asyncHandler(async (req, res) => {
  const { search = '', status, decision, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ returnNo: new RegExp(search, 'i') }, { orderNo: new RegExp(search, 'i') }, { sku: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (decision && decision !== 'All Decisions') filter.decision = decision;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    CustomerReturn.find(filter).populate('order').sort('-createdAt').skip(skip).limit(Number(limit)),
    CustomerReturn.countDocuments(filter)
  ]);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

exports.create = asyncHandler(async (req, res) => {
  const order = req.body.order ? await SalesOrder.findById(req.body.order) : null;
  const item = await CustomerReturn.create({ ...req.body, orderNo: req.body.orderNo || order?.orderNo });
  created(res, item);
});

exports.process = asyncHandler(async (req, res) => {
  const item = await CustomerReturn.findById(req.params.id);
  if (!item) throw new Error('Return not found');
  const decision = req.body.decision || item.decision;
  const stock = await FinishedGoodsStock.findOne({ sku: item.sku }).sort('-updatedAt');
  if (!stock) throw new Error(`Stock not found for ${item.sku}`);

  if (decision === 'Restock') {
    stock.availableQuantity += item.quantity;
    stock.returnedQuantity += item.quantity;
  } else if (decision === 'Damage' || decision === 'Scrap') {
    stock.damagedQuantity += item.quantity;
    stock.totalQuantity += item.quantity;
  }

  stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
  await stock.save();

  await createMovement({
    movementType: decision === 'Restock' ? 'SALES_RETURN' : 'DAMAGE',
    itemType: 'FINISHED_GOOD',
    referenceType: 'CustomerReturn',
    referenceId: String(item._id),
    sku: item.sku,
    warehouseId: stock.warehouse,
    locationId: stock.location,
    quantityIn: decision === 'Restock' ? item.quantity : 0,
    quantityOut: decision === 'Damage' || decision === 'Scrap' ? item.quantity : 0,
    balanceAfter: stock.availableQuantity,
    remarks: item.reason
  });

  item.decision = decision;
  item.status = 'Processed';
  await item.save();
  await Activity.create({ module: 'returns', title: `${item.returnNo} processed`, description: `${item.sku} - ${decision}`, dateText: new Date().toLocaleString(), type: decision === 'Restock' ? 'success' : 'danger' });
  ok(res, item);
});

exports.stats = asyncHandler(async (req, res) => {
  const rows = await CustomerReturn.find();
  ok(res, {
    totalReturns: rows.length,
    pending: rows.filter((row) => row.status === 'Pending QC').length,
    processed: rows.filter((row) => row.status === 'Processed').length,
    restock: rows.filter((row) => row.decision === 'Restock').length,
    damage: rows.filter((row) => ['Damage', 'Scrap'].includes(row.decision)).length
  });
});
