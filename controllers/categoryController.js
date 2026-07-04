const asyncHandler = require('express-async-handler');
const MaterialCategory = require('../models/MaterialCategory');
const RawMaterialStock = require('../models/RawMaterialStock');
const { ok, created } = require('../utils/apiResponse');
const classPalette = ['orange', 'pink', 'blue', 'yellow', 'purple', 'green', 'brown', 'teal', 'rose', 'grey'];

async function nextCategoryColor() {
  const rows = await MaterialCategory.find().select('color');
  const used = new Set(rows.map((row) => row.color).filter(Boolean));
  return classPalette.find((color) => !used.has(color)) || classPalette[rows.length % classPalette.length];
}

async function syncRawMaterialItemStock(item) {
  if (!item?.name) return null;
  return RawMaterialStock.updateMany(
    { $or: [{ materialName: item.name }, { category: item.name }] },
    {
      $set: {
        unit: item.unit || 'm',
        reorderLevel: Number(item.lowStockItems || 0)
      }
    }
  );
}

function stripStockQuantity(payload = {}) {
  const { totalMaterials, ...rest } = payload;
  return rest;
}

async function stockQuantityByItemName() {
  const totals = await RawMaterialStock.aggregate([
    {
      $group: {
        _id: { $ifNull: ['$materialName', '$category'] },
        availableQuantity: { $sum: '$availableQuantity' }
      }
    }
  ]);
  return totals.reduce((map, row) => {
    if (row._id) map[row._id] = Number(row.availableQuantity || 0);
    return map;
  }, {});
}

function withStockQuantity(item, stockTotals) {
  const data = item.toObject?.() || item;
  return {
    ...data,
    totalMaterials: Number(stockTotals[data.name] || 0)
  };
}

exports.getCategories = asyncHandler(async (req, res) => {
  const { search = '', status, sort = '-createdAt', page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.name = new RegExp(search, 'i');
  if (status && status !== 'All Status') filter.status = status;
  const [rows, total, stockTotals] = await Promise.all([
    MaterialCategory.find(filter).sort(sort).skip((page - 1) * limit).limit(Number(limit)),
    MaterialCategory.countDocuments(filter),
    stockQuantityByItemName()
  ]);
  const items = rows.map((item) => withStockQuantity(item, stockTotals));
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});
exports.createCategory = asyncHandler(async (req, res) => {
  const item = await MaterialCategory.create({ ...stripStockQuantity(req.body), color: await nextCategoryColor() });
  const stockTotals = await stockQuantityByItemName();
  created(res, withStockQuantity(item, stockTotals));
});
exports.getCategory = asyncHandler(async (req, res) => {
  const [item, stockTotals] = await Promise.all([
    MaterialCategory.findById(req.params.id),
    stockQuantityByItemName()
  ]);
  ok(res, item ? withStockQuantity(item, stockTotals) : item);
});
exports.updateCategory = asyncHandler(async (req, res) => {
  const item = await MaterialCategory.findByIdAndUpdate(req.params.id, stripStockQuantity(req.body), { new: true });
  await syncRawMaterialItemStock(item);
  const stockTotals = await stockQuantityByItemName();
  ok(res, withStockQuantity(item, stockTotals));
});
exports.deleteCategory = asyncHandler(async (req, res) => { await MaterialCategory.findByIdAndDelete(req.params.id); ok(res, null, 'Deleted'); });
exports.getCategoryStats = asyncHandler(async (req, res) => {
  const [rows, stockTotals] = await Promise.all([
    MaterialCategory.find(),
    stockQuantityByItemName()
  ]);
  const items = rows.map((item) => withStockQuantity(item, stockTotals));
  ok(res, {
    total: items.length,
    active: items.filter(x => x.status === 'Active').length,
    inactive: items.filter(x => x.status === 'Inactive').length,
    totalItems: items.reduce((s, x) => s + x.totalMaterials, 0),
    lowStock: items.reduce((s, x) => s + x.lowStockItems, 0),
    overview: items.slice(0, 6).map(x => ({ label: x.name, value: x.totalMaterials })),
    top: items.sort((a, b) => b.totalMaterials - a.totalMaterials).slice(0, 3).map(x => ({ name: x.name, value: x.totalMaterials }))
  });
});
