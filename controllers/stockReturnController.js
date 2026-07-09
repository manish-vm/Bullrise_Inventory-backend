const asyncHandler = require('express-async-handler');
const StockReturn = require('../models/StockReturn');
const Supplier = require('../models/Supplier');
const RawMaterialStock = require('../models/RawMaterialStock');
const MaterialCategory = require('../models/MaterialCategory');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');
const { createMovement, statusFor } = require('../services/stockService');

const stockAffectingStatuses = new Set(['Pending', 'Approved']);

function stockQuantityFor(row) {
  return stockAffectingStatuses.has(row?.status) ? Number(row.quantity || 0) : 0;
}

function stockFilterFor(row) {
  const material = row.category;
  const conditions = [];
  if (material && row.supplier) conditions.push({ $or: [{ category: material }, { materialName: material }], supplier: row.supplier });
  if (material && row.supplierName) conditions.push({ $or: [{ category: material }, { materialName: material }], supplierName: row.supplierName });
  if (material) conditions.push({ $or: [{ category: material }, { materialName: material }] });
  return conditions.length ? { $or: conditions } : {};
}

async function syncCategoryQuantity(stock, category) {
  const names = [category, stock?.category, stock?.materialName].filter(Boolean);
  if (!names.length) return;
  const total = await RawMaterialStock.aggregate([
    { $match: { $or: [{ category: { $in: names } }, { materialName: { $in: names } }] } },
    { $group: { _id: null, availableQuantity: { $sum: '$availableQuantity' } } }
  ]);
  await MaterialCategory.updateOne(
    { name: { $in: names } },
    { $set: { totalMaterials: Number(total[0]?.availableQuantity || 0), unit: stock?.unit || 'm' } }
  );
}

async function adjustStockForReturn(row, quantityDelta) {
  const delta = Number(quantityDelta || 0);
  if (!delta || !row?.category) return null;

  const stock = await RawMaterialStock.findOne(stockFilterFor(row)).sort({ availableQuantity: -1 });
  if (!stock) throw new Error(`Raw material stock not found for ${row.category}`);
  if (delta > 0 && Number(stock.availableQuantity || 0) < delta) {
    throw new Error(`Insufficient available stock for ${row.category}. Return quantity ${delta}, available ${stock.availableQuantity || 0}.`);
  }

  stock.availableQuantity = Number(stock.availableQuantity || 0) - delta;
  stock.totalValue = Math.max(Number(stock.totalValue || 0) - (delta * Number(stock.unitCost || 0)), 0);
  stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
  await stock.save();
  await syncCategoryQuantity(stock, row.category);

  await createMovement({
    movementType: delta > 0 ? 'SUPPLIER_RETURN' : 'ADJUSTMENT',
    itemType: 'RAW_MATERIAL',
    referenceType: 'StockReturn',
    referenceId: String(row._id),
    materialId: row.category,
    warehouseId: stock.warehouse,
    quantityIn: delta < 0 ? Math.abs(delta) : 0,
    quantityOut: delta > 0 ? delta : 0,
    balanceAfter: stock.availableQuantity,
    unitCost: stock.unitCost,
    totalValue: Math.abs(delta) * Number(stock.unitCost || 0),
    remarks: delta > 0 ? `${row.returnNumber} returned to supplier` : `${row.returnNumber} return stock adjustment reversed`
  });

  return stock;
}

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
  await adjustStockForReturn(stockReturn, stockQuantityFor(stockReturn));

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
exports.updateStockReturn = asyncHandler(async (req, res) => {
  const existing = await StockReturn.findById(req.params.id);
  if (!existing) throw new Error('Stock return not found');
  const previous = existing.toObject();
  const previousStockQuantity = stockQuantityFor(previous);
  Object.assign(existing, req.body);
  const supplier = existing.supplier ? await Supplier.findById(existing.supplier) : null;
  existing.supplierName = existing.supplierName || supplier?.name;
  const nextStockQuantity = stockQuantityFor(existing);

  if (
    previousStockQuantity &&
    (String(existing.category || '') !== String(previous.category || '') ||
      String(existing.supplier || '') !== String(previous.supplier || '') ||
      String(existing.supplierName || '') !== String(previous.supplierName || ''))
  ) {
    await adjustStockForReturn(previous, -previousStockQuantity);
    await adjustStockForReturn(existing, nextStockQuantity);
  } else {
    await adjustStockForReturn(existing, nextStockQuantity - previousStockQuantity);
  }

  await existing.save();
  ok(res, existing);
});
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
