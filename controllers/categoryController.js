const asyncHandler = require('express-async-handler');
const MaterialCategory = require('../models/MaterialCategory');
const { ok, created } = require('../utils/apiResponse');

exports.getCategories = asyncHandler(async (req, res) => {
  const { search = '', status, sort = 'name', page = 1, limit = 12 } = req.query;
  const filter = {};
  if (search) filter.name = new RegExp(search, 'i');
  if (status && status !== 'All Status') filter.status = status;
  const items = await MaterialCategory.find(filter).sort(sort).skip((page - 1) * limit).limit(Number(limit));
  const total = await MaterialCategory.countDocuments(filter);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});
exports.createCategory = asyncHandler(async (req, res) => created(res, await MaterialCategory.create(req.body)));
exports.getCategory = asyncHandler(async (req, res) => ok(res, await MaterialCategory.findById(req.params.id)));
exports.updateCategory = asyncHandler(async (req, res) => ok(res, await MaterialCategory.findByIdAndUpdate(req.params.id, req.body, { new: true })));
exports.deleteCategory = asyncHandler(async (req, res) => { await MaterialCategory.findByIdAndDelete(req.params.id); ok(res, null, 'Deleted'); });
exports.getCategoryStats = asyncHandler(async (req, res) => {
  const rows = await MaterialCategory.find();
  ok(res, {
    total: rows.length,
    active: rows.filter(x => x.status === 'Active').length,
    inactive: rows.filter(x => x.status === 'Inactive').length,
    totalItems: rows.reduce((s, x) => s + x.totalMaterials, 0),
    lowStock: rows.reduce((s, x) => s + x.lowStockItems, 0),
    overview: rows.slice(0, 6).map(x => ({ label: x.name, value: x.totalMaterials })),
    top: rows.sort((a, b) => b.totalMaterials - a.totalMaterials).slice(0, 3).map(x => ({ name: x.name, value: x.totalMaterials }))
  });
});
