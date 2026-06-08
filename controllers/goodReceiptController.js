const asyncHandler = require('express-async-handler');
const GoodReceipt = require('../models/GoodReceipt');
const Supplier = require('../models/Supplier');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

exports.getGoodReceipts = asyncHandler(async (req, res) => {
  const { search = '', status, supplier, category, page = 1, limit = 8 } = req.query;
  const filter = {};

  if (search) {
    filter.$or = [
      { grnNumber: new RegExp(search, 'i') },
      { poNumber: new RegExp(search, 'i') },
      { supplierName: new RegExp(search, 'i') },
      { receivedBy: new RegExp(search, 'i') }
    ];
  }

  if (status && status !== 'All Status') filter.status = status;
  if (supplier && supplier !== 'All Suppliers') filter.supplierName = supplier;
  if (category && category !== 'All Categories') filter.category = category;

  const perPage = Number(limit);
  const items = await GoodReceipt.find(filter)
    .populate('supplier')
    .sort({ receiptDate: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage);
  const total = await GoodReceipt.countDocuments(filter);

  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / perPage) });
});

exports.createGoodReceipt = asyncHandler(async (req, res) => {
  const supplier = req.body.supplier ? await Supplier.findById(req.body.supplier) : null;
  const receipt = await GoodReceipt.create({ ...req.body, supplierName: req.body.supplierName || supplier?.name });

  await Activity.create({
    module: 'good-receipts',
    title: `${receipt.grnNumber} ${receipt.status.toLowerCase()}`,
    description: `${receipt.supplierName || 'Supplier'} - ${receipt.poNumber || 'Manual receipt'}`,
    dateText: new Date().toLocaleString(),
    type: receipt.status === 'Rejected' ? 'danger' : receipt.status === 'Under QC' ? 'warning' : 'success'
  });

  created(res, receipt);
});

exports.getGoodReceipt = asyncHandler(async (req, res) => ok(res, await GoodReceipt.findById(req.params.id).populate('supplier')));
exports.updateGoodReceipt = asyncHandler(async (req, res) => ok(res, await GoodReceipt.findByIdAndUpdate(req.params.id, req.body, { new: true })));
exports.deleteGoodReceipt = asyncHandler(async (req, res) => { await GoodReceipt.findByIdAndDelete(req.params.id); ok(res, null, 'Deleted'); });

exports.getGoodReceiptStats = asyncHandler(async (req, res) => {
  const rows = await GoodReceipt.find();
  const latestReceiptDate = rows.reduce((latest, item) => {
    const d = new Date(item.receiptDate);
    return !latest || d > latest ? d : latest;
  }, null);
  const count = (status) => rows.filter((x) => x.status === status).length;

  ok(res, {
    total: rows.length,
    thisMonth: rows.filter((x) => {
      const d = new Date(x.receiptDate);
      const reference = latestReceiptDate || new Date();
      return d.getMonth() === reference.getMonth() && d.getFullYear() === reference.getFullYear();
    }).length,
    quantity: rows.reduce((sum, x) => sum + x.quantity, 0),
    value: rows.reduce((sum, x) => sum + x.receiptValue, 0),
    pendingQc: count('Under QC') + count('Pending'),
    overview: ['Completed', 'Under QC', 'Pending', 'Rejected'].map((label) => ({ label, value: count(label) }))
  });
});

exports.getGoodReceiptActivities = asyncHandler(async (req, res) => ok(res, await Activity.find({ module: 'good-receipts' }).sort({ createdAt: -1 }).limit(5)));
