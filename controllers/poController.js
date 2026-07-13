const asyncHandler = require('express-async-handler');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

async function nextPurchaseOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const latest = await PurchaseOrder.findOne({ poNumber: new RegExp(`^${prefix}`) }).sort({ poNumber: -1 }).select('poNumber');
  const next = Number(String(latest?.poNumber || '').split('-').pop() || 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

function normalizeItems(items = []) {
  return items.map((item, index) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const receivedQuantity = Number(item.receivedQuantity || 0);
    const rejectedQuantity = Number(item.rejectedQuantity || 0);
    const balanceQuantity = Math.max(quantity - receivedQuantity - rejectedQuantity, 0);
    const amount = quantity * unitPrice;
    return {
      ...item,
      lineNo: item.lineNo || index + 1,
      materialName: item.materialName || item.category,
      category: item.category || item.materialName,
      quantity,
      unitPrice,
      receivedQuantity,
      rejectedQuantity,
      balanceQuantity,
      amount,
      status: receivedQuantity >= quantity ? 'Completed' : receivedQuantity > 0 || rejectedQuantity > 0 ? 'Partially Received' : item.status || 'Open'
    };
  });
}

function applyPoTotals(po) {
  po.items = normalizeItems(po.items || []);
  const itemQuantity = po.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const itemReceivedQuantity = po.items.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0);
  po.orderedQuantity = itemQuantity || Number(po.orderedQuantity || 0);
  po.receivedQuantity = itemReceivedQuantity || Number(po.receivedQuantity || 0);
  if (po.items.length) {
    po.category = po.items[0].category || po.items[0].materialName || po.category;
    po.unit = po.items[0].unit || po.unit;
    po.totalAmount = po.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }
}

exports.getPurchaseOrders = asyncHandler(async (req, res) => {
  const { search = '', status, supplier, category, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ poNumber: new RegExp(search, 'i') }, { supplierName: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (supplier && supplier !== 'All Suppliers') filter.supplierName = supplier;
  if (category && category !== 'All Categories') filter.category = category;
  const items = await PurchaseOrder.find(filter).populate('supplier').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit));
  const total = await PurchaseOrder.countDocuments(filter);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});
exports.createPurchaseOrder = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.body.supplier);
    if (!supplier) {
      res.status(400);
      throw new Error('Select a valid supplier before creating the purchase order');
    }
    const payload = { ...req.body, supplierName: req.body.supplierName || supplier.name };
    const requestedPoNumber = String(payload.poNumber || '').trim();
    payload.poNumber = requestedPoNumber && requestedPoNumber !== 'Auto Generate' ? requestedPoNumber : await nextPurchaseOrderNumber();
    payload.creditDays = payload.paymentMode === 'Cash' ? 0 : Number(payload.creditDays || 30);
    if (req.body.orderedQuantity != null && payload.items?.length === 1) {
      payload.items[0].quantity = Number(req.body.orderedQuantity || 0);
    }
    if (req.body.receivedQuantity != null && payload.items?.length === 1) {
      payload.items[0].receivedQuantity = Number(req.body.receivedQuantity || 0);
    }
    payload.items = normalizeItems(payload.items || []).filter((item) => item.materialName || item.category || item.quantity > 0);
    if (!payload.items.length) {
      res.status(400);
      throw new Error('Add at least one product or raw material item before creating the purchase order');
    }
    payload.orderedQuantity = payload.orderedQuantity || payload.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (payload.items.length) {
      payload.category = payload.items[0].category || payload.items[0].materialName || payload.category;
      payload.unit = payload.items[0].unit || payload.unit;
      payload.receivedQuantity = payload.items.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0);
      payload.totalAmount = payload.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    }
    const po = await PurchaseOrder.create(payload);
    await Activity.create({ module: 'purchase-orders', title: `${po.poNumber} created`, description: new Date().toLocaleString(), type: 'success' });
    created(res, po);
  } catch (error) {
    const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : error.code === 11000 ? 409 : error.name === 'ValidationError' ? 400 : 500;
    res.status(statusCode).json({ success: false, message: error.message || 'Unable to create purchase order' });
  }
};
exports.getPurchaseOrder = asyncHandler(async (req, res) => ok(res, await PurchaseOrder.findById(req.params.id).populate('supplier')));
exports.updatePurchaseOrder = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findById(req.params.id);
  if (!po) throw new Error('Purchase order not found');
  Object.assign(po, req.body);
  po.creditDays = po.paymentMode === 'Cash' ? 0 : Number(po.creditDays || 30);
  if (req.body.orderedQuantity != null && po.items?.length === 1) {
    po.items[0].quantity = Number(req.body.orderedQuantity || 0);
  }
  if (req.body.receivedQuantity != null && po.items?.length === 1) {
    po.items[0].receivedQuantity = Number(req.body.receivedQuantity || 0);
  }
  applyPoTotals(po);
  await po.save();
  ok(res, po);
});
exports.deletePurchaseOrder = asyncHandler(async (req, res) => { await PurchaseOrder.findByIdAndDelete(req.params.id); ok(res, null, 'Deleted'); });
exports.getPurchaseOrderStats = asyncHandler(async (req, res) => {
  const rows = await PurchaseOrder.find();
  const count = s => rows.filter(x => x.status === s).length;
  ok(res, {
    total: rows.length, open: count('Open'), partial: count('Partially Received'), completed: count('Completed'), cancelled: count('Cancelled'),
    amount: rows.reduce((s, x) => s + x.totalAmount, 0),
    overview: ['Open','Partially Received','Completed','Cancelled'].map(x => ({ label: x, value: count(x) }))
  });
});
exports.getPurchaseOrderActivities = asyncHandler(async (req, res) => ok(res, await Activity.find({ module: 'purchase-orders' }).sort({ createdAt: -1 }).limit(5)));
