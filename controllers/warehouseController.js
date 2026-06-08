const asyncHandler = require('express-async-handler');
const Warehouse = require('../models/Warehouse');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

const pct = (used, total) => total ? Math.round((used / total) * 1000) / 10 : 0;

exports.getWarehouseOverview = asyncHandler(async (req, res) => {
  const rows = await Warehouse.find().sort({ code: 1 });
  const activities = await Activity.find({ module: 'warehouse-overview' }).sort({ createdAt: -1 }).limit(5);
  const totalStock = rows.reduce((sum, row) => sum + row.stockUnits, 0);

  ok(res, {
    stats: {
      totalWarehouses: rows.length,
      totalStock,
      stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
      stockIn: rows.reduce((sum, row) => sum + row.stockInUnits, 0),
      stockOut: rows.reduce((sum, row) => sum + row.stockOutUnits, 0)
    },
    rows: rows.map((row) => ({ ...row.toObject(), utilization: pct(row.usedCapacity, row.totalCapacity) })),
    distribution: rows.map((row) => ({
      label: row.name,
      value: row.stockUnits,
      percent: totalStock ? Math.round((row.stockUnits / totalStock) * 1000) / 10 : 0
    })),
    stockMovement: [
      { day: '16 May', stockIn: 1650, stockOut: 820 },
      { day: '17 May', stockIn: 3420, stockOut: 1340 },
      { day: '18 May', stockIn: 5580, stockOut: 2860 },
      { day: '19 May', stockIn: 3540, stockOut: 1580 },
      { day: '20 May', stockIn: 3280, stockOut: 1440 },
      { day: '21 May', stockIn: 4250, stockOut: 2620 },
      { day: '22 May', stockIn: 4380, stockOut: 1680 }
    ],
    utilization: rows.map((row) => ({ code: row.code, value: pct(row.usedCapacity, row.totalCapacity), color: row.color })),
    alerts: [
      { product: "Men's Polo - Size XL", warehouse: 'WH-003', quantity: 45 },
      { product: "Women's Top - Size S", warehouse: 'WH-001', quantity: 32 },
      { product: 'Kids T-Shirt - Size M', warehouse: 'WH-004', quantity: 28 }
    ],
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
  const items = await Warehouse.find(filter).sort({ code: 1 }).skip((page - 1) * perPage).limit(perPage);
  const total = await Warehouse.countDocuments(filter);

  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / perPage) });
});

exports.createWarehouse = asyncHandler(async (req, res) => created(res, await Warehouse.create(req.body)));
