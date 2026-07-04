const asyncHandler = require('express-async-handler');
const Warehouse = require('../models/Warehouse');
const Activity = require('../models/Activity');
const StockMovement = require('../models/StockMovement');
const RawMaterialStock = require('../models/RawMaterialStock');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const { ok, created } = require('../utils/apiResponse');

const pct = (used, total) => total ? Math.round((used / total) * 1000) / 10 : 0;
const colorPalette = ['#2f80ed', '#16c784', '#ff9800', '#9c27ff', '#22b8c7', '#ef4444', '#8b5cf6', '#0f766e'];

async function nextWarehouseColor() {
  const rows = await Warehouse.find().select('color');
  const used = new Set(rows.map((row) => row.color).filter(Boolean));
  return colorPalette.find((color) => !used.has(color)) || colorPalette[rows.length % colorPalette.length];
}

exports.getWarehouseOverview = asyncHandler(async (req, res) => {
  const [rows, activities, movements, rawStock, finishedStock] = await Promise.all([
    Warehouse.find().sort({ code: 1 }),
    Activity.find({ module: 'warehouse-overview' }).sort({ createdAt: -1 }).limit(5),
    StockMovement.find().sort({ createdAt: -1 }).limit(200),
    RawMaterialStock.find(),
    FinishedGoodsStock.find()
  ]);
  const stockByWarehouse = [...rawStock, ...finishedStock].reduce((map, stock) => {
    const key = String(stock.warehouse || '');
    if (!key) return map;
    if (!map[key]) map[key] = { units: 0, value: 0 };
    const availableQuantity = Number(stock.availableQuantity || 0);
    map[key].units += availableQuantity;
    map[key].value += Number(stock.totalValue ?? (availableQuantity * Number(stock.unitCost || 0)));
    return map;
  }, {});
  const movementByWarehouse = movements.reduce((map, movement) => {
    const key = String(movement.warehouseId || '');
    if (!key) return map;
    if (!map[key]) map[key] = { stockIn: 0, stockOut: 0 };
    map[key].stockIn += Number(movement.quantityIn || 0);
    map[key].stockOut += Number(movement.quantityOut || 0);
    return map;
  }, {});
  const overviewRows = rows.map((row) => {
    const id = String(row._id);
    const stock = stockByWarehouse[id] || { units: 0, value: 0 };
    const movement = movementByWarehouse[id] || { stockIn: 0, stockOut: 0 };
    return {
      ...row.toObject(),
      usedCapacity: stock.units,
      stockUnits: stock.units,
      stockValue: stock.value,
      stockInUnits: movement.stockIn,
      stockOutUnits: movement.stockOut,
      utilization: pct(stock.units, row.totalCapacity)
    };
  });
  const totalStock = overviewRows.reduce((sum, row) => sum + row.stockUnits, 0);
  const movementByDay = movements.reduce((map, movement) => {
    const label = new Date(movement.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    if (!map[label]) map[label] = { day: label, stockIn: 0, stockOut: 0 };
    map[label].stockIn += Number(movement.quantityIn || 0);
    map[label].stockOut += Number(movement.quantityOut || 0);
    return map;
  }, {});

  ok(res, {
    stats: {
      totalWarehouses: rows.length,
      totalStock,
      stockValue: overviewRows.reduce((sum, row) => sum + row.stockValue, 0),
      stockIn: overviewRows.reduce((sum, row) => sum + row.stockInUnits, 0),
      stockOut: overviewRows.reduce((sum, row) => sum + row.stockOutUnits, 0)
    },
    rows: overviewRows,
    distribution: overviewRows.map((row) => ({
      label: row.name,
      value: row.stockUnits,
      percent: totalStock ? Math.round((row.stockUnits / totalStock) * 1000) / 10 : 0
    })),
    stockMovement: Object.values(movementByDay).reverse().slice(-7),
    utilization: overviewRows.map((row) => ({ code: row.code, value: row.utilization, color: row.color })),
    alerts: overviewRows
      .filter((row) => row.totalCapacity && row.usedCapacity / row.totalCapacity > 0.9)
      .map((row) => ({ product: row.name, warehouse: row.code, quantity: row.usedCapacity })),
    activities
  });
});

exports.getWarehouses = asyncHandler(async (req, res) => {
  const { search = '', status, location, page = 1, limit = 10 } = req.query;
  const filter = {};

  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { code: new RegExp(search, 'i') }, { location: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (location && location !== 'All Locations') filter.location = location;

  const perPage = Number(limit);
  const items = await Warehouse.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage);
  const total = await Warehouse.countDocuments(filter);

  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / perPage) });
});

exports.createWarehouse = asyncHandler(async (req, res) => created(res, await Warehouse.create({ ...req.body, color: await nextWarehouseColor() })));

exports.getWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) throw new Error('Warehouse not found');
  ok(res, warehouse);
});

exports.updateWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  if (!warehouse) throw new Error('Warehouse not found');

  await Activity.create({
    module: 'warehouse-overview',
    title: `${warehouse.code} updated`,
    description: `${warehouse.name} warehouse details updated`,
    dateText: new Date().toLocaleString(),
    type: 'purple'
  });

  ok(res, warehouse, 'Warehouse updated');
});
