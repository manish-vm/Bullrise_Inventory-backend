const asyncHandler = require('express-async-handler');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

exports.getPurchaseOrders = asyncHandler(async (req, res) => {
  const { search = '', status, supplier, category, page = 1, limit = 8 } = req.query;
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
  const po = await PurchaseOrder.create({ ...req.body, supplierName: supplier?.name });
  await Activity.create({ module: 'purchase-orders', title: `${po.poNumber} created`, description: new Date().toLocaleString(), type: 'success' });
  created(res, po);
});
exports.getPurchaseOrder = asyncHandler(async (req, res) => ok(res, await PurchaseOrder.findById(req.params.id).populate('supplier')));
exports.updatePurchaseOrder = asyncHandler(async (req, res) => ok(res, await PurchaseOrder.findByIdAndUpdate(req.params.id, req.body, { new: true })));
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
