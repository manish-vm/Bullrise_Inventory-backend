const asyncHandler = require('express-async-handler');
const StockReturn = require('../models/StockReturn');
const Supplier = require('../models/Supplier');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

exports.getStockReturns = asyncHandler(async (req, res) => {
  const { search = '', status, supplier, category, page = 1, limit = 10 } = req.query;
  const filter = {};

  if (search) {
    filter.$or = [
      { returnNumber: new RegExp(search, 'i') },
      { poNumber: new RegExp(search, 'i') },
      { grnNumber: new RegExp(search, 'i') },
      { supplierName: new RegExp(search, 'i') }
    ];
  }

  if (status && status !== 'All Status') filter.status = status;
  if (supplier && supplier !== 'All Suppliers') filter.supplierName = supplier;
  if (category && category !== 'All Categories') filter.category = category;

  const perPage = Number(limit);
  const items = await StockReturn.find(filter)
    .populate('supplier')
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage);
  const total = await StockReturn.countDocuments(filter);

  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / perPage) });
});

exports.createStockReturn = asyncHandler(async (req, res) => {
  const supplier = req.body.supplier ? await Supplier.findById(req.body.supplier) : null;
  const stockReturn = await StockReturn.create({ ...req.body, supplierName: req.body.supplierName || supplier?.name });

  await Activity.create({
    module: 'stock-returns',
    title: `${stockReturn.returnNumber} submitted`,
    description: `${stockReturn.supplierName || 'Supplier'} - ${stockReturn.reason}`,
    dateText: new Date().toLocaleString(),
    type: stockReturn.status === 'Rejected' ? 'danger' : stockReturn.status === 'Pending' ? 'warning' : 'success'
  });

  created(res, stockReturn);
});

exports.getStockReturn = asyncHandler(async (req, res) => ok(res, await StockReturn.findById(req.params.id).populate('supplier')));
exports.updateStockReturn = asyncHandler(async (req, res) => ok(res, await StockReturn.findByIdAndUpdate(req.params.id, req.body, { new: true })));
exports.deleteStockReturn = asyncHandler(async (req, res) => { await StockReturn.findByIdAndDelete(req.params.id); ok(res, null, 'Deleted'); });

exports.getStockReturnStats = asyncHandler(async (req, res) => {
  const rows = await StockReturn.find();
  const latestReturnDate = rows.reduce((latest, item) => {
    const d = new Date(item.returnDate);
    return !latest || d > latest ? d : latest;
  }, null);
  const count = (status) => rows.filter((x) => x.status === status).length;
  const reasonCounts = rows.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  ok(res, {
    total: rows.length,
    thisMonth: rows.filter((x) => {
      const d = new Date(x.returnDate);
      const reference = latestReturnDate || new Date();
      return d.getMonth() === reference.getMonth() && d.getFullYear() === reference.getFullYear();
    }).length,
    quantity: rows.reduce((sum, x) => sum + x.quantity, 0),
    value: rows.reduce((sum, x) => sum + x.returnValue, 0),
    pending: count('Pending'),
    overview: ['Approved', 'Pending', 'Rejected', 'Draft'].map((label) => ({ label, value: count(label) })),
    reasons: Object.entries(reasonCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  });
});

exports.getStockReturnActivities = asyncHandler(async (req, res) => ok(res, await Activity.find({ module: 'stock-returns' }).sort({ createdAt: -1 }).limit(5)));
