const asyncHandler = require('express-async-handler');
const RawMaterialStock = require('../models/RawMaterialStock');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodReceipt = require('../models/GoodReceipt');
const StockReturn = require('../models/StockReturn');
const Production = require('../models/Production');
const QCInspection = require('../models/QCInspection');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const SalesOrder = require('../models/SalesOrder');
const CustomerReturn = require('../models/CustomerReturn');
const StockMovement = require('../models/StockMovement');
const Warehouse = require('../models/Warehouse');
const { ok } = require('../utils/apiResponse');

const sum = (rows, key) => rows.reduce((total, row) => total + Number(typeof key === 'function' ? key(row) : row[key] || 0), 0);
const groupCount = (rows, key) => rows.reduce((acc, row) => {
  const label = typeof key === 'function' ? key(row) : row[key];
  acc[label || 'Unassigned'] = (acc[label || 'Unassigned'] || 0) + 1;
  return acc;
}, {});
const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);

exports.summary = asyncHandler(async (req, res) => {
  const [raw, pos, grns, supplierReturns, production, qc, finished, sales, returns, movements, warehouses] = await Promise.all([
    RawMaterialStock.find(),
    PurchaseOrder.find(),
    GoodReceipt.find(),
    StockReturn.find(),
    Production.find(),
    QCInspection.find(),
    FinishedGoodsStock.find(),
    SalesOrder.find(),
    CustomerReturn.find(),
    StockMovement.find().sort('-createdAt').limit(500),
    Warehouse.find()
  ]);

  const rejected = sum(qc, 'defects');
  const inspected = sum(qc, 'inspectedQty');
  const movementIn = sum(movements, 'quantityIn');
  const movementOut = sum(movements, 'quantityOut');
  const byMovementType = groupCount(movements, 'movementType');
  const salesItems = sales.flatMap((order) => order.items.map((item) => ({ ...plain(item), orderNo: order.orderNo, status: order.status, source: order.source })));
  const topSalesSkus = Object.entries(salesItems.reduce((acc, item) => {
    acc[item.sku] = (acc[item.sku] || 0) + Number(item.quantity || 0);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([sku, quantity]) => ({ sku, quantity }));

  ok(res, {
    reports: {
      rawMaterialStock: { rows: raw.length, quantity: sum(raw, 'availableQuantity'), reserved: sum(raw, 'reservedQuantity') },
      purchase: { rows: pos.length, value: sum(pos, 'totalAmount'), open: pos.filter((row) => row.status === 'Open').length },
      grn: { rows: grns.length, quantity: sum(grns, 'quantity'), receivedValue: sum(grns, (row) => Number(row.quantity || 0) * Number(row.unitCost || 0)) },
      supplierReturn: { rows: supplierReturns.length, quantity: sum(supplierReturns, 'quantity'), value: sum(supplierReturns, 'returnValue') },
      production: { rows: production.length, produced: sum(production, 'producedQty'), damaged: sum(production, 'damagedQty') },
      qcDefect: { rows: qc.length, rejectionRate: inspected ? Number(((rejected / inspected) * 100).toFixed(1)) : 0 },
      finishedGoodsStock: { rows: finished.length, quantity: sum(finished, 'availableQuantity'), reserved: sum(finished, 'reservedQuantity'), damaged: sum(finished, 'damagedQuantity') },
      sales: { rows: sales.length, value: sum(sales, 'total'), units: sum(salesItems, 'quantity'), topSkus: topSalesSkus },
      returns: { rows: returns.length, quantity: sum(returns, 'quantity'), pending: returns.filter((row) => row.status === 'Pending QC').length },
      stockMovementLedger: { rows: movements.length, quantityIn: movementIn, quantityOut: movementOut, netQuantity: movementIn - movementOut, byMovementType, latest: movements.slice(0, 10) }
    },
    alerts: {
      lowRawMaterialStock: raw.filter((row) => row.availableQuantity <= row.reorderLevel),
      lowFinishedGoodsStock: finished.filter((row) => row.availableQuantity <= row.reorderLevel),
      pendingPOApproval: pos.filter((row) => row.status === 'Open'),
      pendingGRN: grns.filter((row) => row.status === 'Pending' || row.status === 'Under QC'),
      delayedProduction: production.filter((row) => row.status === 'Pending' || row.status === 'In Progress'),
      highRejectionRate: inspected && rejected / inspected > 0.05,
      warehouseOverCapacity: warehouses.filter((row) => row.totalCapacity && row.usedCapacity / row.totalCapacity > 0.9)
    }
  });
});

exports.transactions = asyncHandler(async (req, res) => {
  const { type = 'movements', limit = 1000 } = req.query;
  const max = Math.min(Number(limit) || 1000, 5000);
  const map = {
    movements: () => StockMovement.find().sort('-createdAt').limit(max),
    sales: () => SalesOrder.find().sort('-createdAt').limit(max),
    customerReturns: () => CustomerReturn.find().sort('-createdAt').limit(max),
    qc: () => QCInspection.find().sort('-createdAt').limit(max),
    grn: () => GoodReceipt.find().sort('-createdAt').limit(max),
    supplierReturns: () => StockReturn.find().sort('-createdAt').limit(max),
  };
  const loader = map[type] || map.movements;
  ok(res, { type, items: await loader() });
});
