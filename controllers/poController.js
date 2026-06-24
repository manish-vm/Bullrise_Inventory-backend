const asyncHandler = require('express-async-handler');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

function normalizeItems(items = []) {
  return items.map((item, index) => {
    const quantity = Number(item.quantity || 0);
    const receivedQuantity = Number(item.receivedQuantity || 0);
    const rejectedQuantity = Number(item.rejectedQuantity || 0);
    const balanceQuantity = Math.max(quantity - receivedQuantity - rejectedQuantity, 0);
    const amount = item.amount != null ? Number(item.amount || 0) : quantity * Number(item.unitPrice || 0);
    return {
      ...item,
      lineNo: item.lineNo || index + 1,
      quantity,
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
  po.orderedQuantity = po.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  po.receivedQuantity = po.items.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0);
  po.totalAmount = po.totalAmount || po.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (po.receivedQuantity <= 0) po.status = po.status === 'Cancelled' ? 'Cancelled' : 'Open';
  else if (po.receivedQuantity >= po.orderedQuantity) po.status = 'Completed';
  else po.status = 'Partially Received';
}

exports.getPurchaseOrders = asyncHandler(async (req, res) => {
  const { search = '', status, supplier, category, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ poNumber: new RegExp(search, 'i') }, { supplierName: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (supplier && supplier !== 'All Suppliers') filter.supplierName = supplier;
  if (category && category !== 'All Categories') filter.category = category;
  const items = await PurchaseOrder.find(filter).populate('supplier').sort({ orderDate: -1 }).skip((page - 1) * limit).limit(Number(limit));
  const total = await PurchaseOrder.countDocuments(filter);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});
exports.createPurchaseOrder = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.body.supplier);
  const payload = { ...req.body, supplierName: req.body.supplierName || supplier?.name };
  payload.items = normalizeItems(payload.items || []);
  payload.orderedQuantity = payload.orderedQuantity || payload.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  payload.totalAmount = payload.totalAmount || payload.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const po = await PurchaseOrder.create(payload);
  await Activity.create({ module: 'purchase-orders', title: `${po.poNumber} created`, description: new Date().toLocaleString(), type: 'success' });
  created(res, po);
});
exports.getPurchaseOrder = asyncHandler(async (req, res) => ok(res, await PurchaseOrder.findById(req.params.id).populate('supplier')));
exports.updatePurchaseOrder = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findById(req.params.id);
  if (!po) throw new Error('Purchase order not found');
  Object.assign(po, req.body);
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
