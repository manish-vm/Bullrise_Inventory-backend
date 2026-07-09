const asyncHandler = require('express-async-handler');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodReceipt = require('../models/GoodReceipt');
const RawMaterialStock = require('../models/RawMaterialStock');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const MaterialBatch = require('../models/MaterialBatch');
const StockMovement = require('../models/StockMovement');
const Warehouse = require('../models/Warehouse');
const MaterialRequest = require('../models/MaterialRequest');
const WarehouseTransfer = require('../models/WarehouseTransfer');
const SerialInventory = require('../models/SerialInventory');
const { ok, created } = require('../utils/apiResponse');
const { createMovement, statusFor } = require('../services/stockService');

const pageParams = (query) => {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  return { page, limit, skip: (page - 1) * limit };
};

const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const ageDays = (date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
const healthLabel = (score) => (score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Average' : 'Critical');
const turnoverStatus = (ratio) => (ratio >= 6 ? 'Fast Moving' : ratio >= 3 ? 'Healthy' : ratio >= 1 ? 'Slow' : 'Dead Stock');

async function nextNumber(prefix, Model, field) {
  const last = await Model.findOne({ [field]: new RegExp(`^${prefix}-`) }).sort({ createdAt: -1 });
  const seq = String((Number(String(last?.[field] || '').split('-').pop()) || 0) + 1).padStart(5, '0');
  return `${prefix}-${seq}`;
}

function normalizeRequestQuantities(payload) {
  const items = (payload.items || []).map((item) => {
    const requiredQuantity = Number(item.requiredQuantity || 0);
    const issuedQuantity = Number(item.issuedQuantity || 0);
    return {
      ...item,
      requiredQuantity,
      issuedQuantity,
      remainingQuantity: Math.max(requiredQuantity - issuedQuantity, 0)
    };
  });
  return {
    ...payload,
    items,
    requestedQuantity: items.reduce((total, item) => total + item.requiredQuantity, 0),
    issuedQuantity: items.reduce((total, item) => total + item.issuedQuantity, 0),
    remainingQuantity: items.reduce((total, item) => total + item.remainingQuantity, 0)
  };
}

async function consumeFifo({ materialName, category, quantity, warehouse, referenceId, remarks, user }) {
  let remaining = Number(quantity || 0);
  const batches = await MaterialBatch.find({
    availableQuantity: { $gt: 0 },
    ...(materialName ? { materialName } : {}),
    ...(category ? { category } : {}),
    ...(warehouse ? { warehouse } : {})
  }).sort({ createdAt: 1, _id: 1 });

  const available = batches.reduce((total, batch) => total + Number(batch.availableQuantity || 0), 0);
  if (available < remaining) throw new Error(`Insufficient FIFO stock for ${materialName || category}. Required ${remaining}, available ${available}.`);

  const consumed = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(Number(batch.availableQuantity || 0), remaining);
    batch.availableQuantity -= take;
    batch.consumedQuantity += take;
    batch.totalValue = batch.availableQuantity * Number(batch.unitCost || 0);
    batch.status = batch.availableQuantity > 0 ? 'Available' : 'Consumed';
    await batch.save();
    remaining -= take;
    consumed.push({ batchNo: batch.batchNo, quantity: take, unitCost: batch.unitCost });

    await createMovement({
      movementType: 'MATERIAL_CONSUMED',
      itemType: 'RAW_MATERIAL',
      referenceType: 'MaterialIssueNote',
      referenceId,
      materialId: materialName || batch.materialName,
      warehouseId: batch.warehouse,
      batchNo: batch.batchNo,
      quantityOut: take,
      balanceAfter: batch.availableQuantity,
      unitCost: batch.unitCost,
      totalValue: take * Number(batch.unitCost || 0),
      remarks,
      createdBy: user || 'System'
    });
  }

  const stock = await RawMaterialStock.findOne({
    ...(materialName ? { materialName } : {}),
    ...(category ? { category } : {}),
    ...(warehouse ? { warehouse } : {})
  }).sort({ availableQuantity: -1 });
  if (stock) {
    stock.availableQuantity = Math.max(Number(stock.availableQuantity || 0) - Number(quantity || 0), 0);
    stock.consumedQuantity = Number(stock.consumedQuantity || 0) + Number(quantity || 0);
    stock.totalValue = Math.max(Number(stock.totalValue || 0) - consumed.reduce((total, row) => total + (row.quantity * Number(row.unitCost || 0)), 0), 0);
    stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
    await stock.save();
  }

  return consumed;
}

exports.vendorPerformance = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find().sort('name');
  const receipts = await GoodReceipt.find();
  const orders = await PurchaseOrder.find();
  ok(res, suppliers.map((supplier) => {
    const supplierOrders = orders.filter((po) => String(po.supplier || '') === String(supplier._id));
    const supplierReceipts = receipts.filter((grn) => String(grn.supplier || '') === String(supplier._id));
    const rejected = supplierReceipts.reduce((total, grn) => total + grn.items.reduce((lineTotal, item) => lineTotal + Number(item.rejectedQuantity || 0), 0), 0);
    const accepted = supplierReceipts.reduce((total, grn) => total + grn.items.reduce((lineTotal, item) => lineTotal + Number(item.acceptedQuantity || 0), 0), 0);
    return {
      _id: supplier._id,
      vendorCode: supplier.supplierCode,
      vendorName: supplier.name,
      gstNumber: supplier.gstNumber,
      pan: supplier.pan,
      contactPerson: supplier.contactPerson,
      paymentTerms: supplier.paymentTerms,
      currency: supplier.currency,
      leadTimeDays: supplier.leadTimeDays,
      vendorRating: supplier.vendorRating,
      productsSupplied: supplier.productsSupplied,
      purchaseOrders: supplierOrders.length,
      pendingDeliveries: supplierOrders.filter((po) => ['Open', 'Partially Received', 'Draft', 'Sent'].includes(po.status)).length,
      completedDeliveries: supplierReceipts.filter((grn) => grn.status === 'Completed').length,
      rejectedDeliveries: supplierReceipts.filter((grn) => grn.status === 'Rejected').length,
      averageDeliveryTimeDays: supplier.averageDeliveryTimeDays,
      averageQualityScore: accepted + rejected > 0 ? Math.round((accepted / (accepted + rejected)) * 100) : supplier.averageQualityScore
    };
  }));
});

exports.listMaterialRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = req.query.status ? { status: req.query.status } : {};
  const [items, total] = await Promise.all([
    MaterialRequest.find(filter).populate('warehouse').sort('-createdAt').skip(skip).limit(limit),
    MaterialRequest.countDocuments(filter)
  ]);
  ok(res, { items, total, page, pages: Math.ceil(total / limit) });
});

exports.createMaterialRequest = asyncHandler(async (req, res) => {
  const mrnNumber = req.body.mrnNumber || await nextNumber('MRN', MaterialRequest, 'mrnNumber');
  const payload = normalizeRequestQuantities({ ...req.body, mrnNumber });
  payload.audit = [{ action: 'Created', by: req.user?.name || req.body.requestedBy || 'System', remarks: payload.purpose }];
  created(res, await MaterialRequest.create(payload));
});

exports.approveMaterialRequest = asyncHandler(async (req, res) => {
  const item = await MaterialRequest.findById(req.params.id);
  if (!item) throw new Error('Material request not found');
  item.status = 'Approved';
  item.approvedBy = req.user?.name || req.body.approvedBy || 'System';
  item.approvedAt = new Date();
  item.audit.push({ action: 'Approved', by: item.approvedBy, remarks: req.body.remarks });
  ok(res, await item.save(), 'Material request approved');
});

exports.issueMaterialRequest = asyncHandler(async (req, res) => {
  const item = await MaterialRequest.findById(req.params.id);
  if (!item) throw new Error('Material request not found');
  if (!['Approved', 'Partially Issued'].includes(item.status)) throw new Error('Material request must be approved before issue');

  const minNumber = req.body.minNumber || await nextNumber('MIN', MaterialRequest, 'issues.minNumber');
  const issueLines = [];
  let totalValue = 0;
  for (const line of item.items) {
    const pending = Math.max(Number(line.requiredQuantity || 0) - Number(line.issuedQuantity || 0), 0);
    const requestedIssue = Number((req.body.items || []).find((row) => row.materialName === line.materialName)?.issuedQuantity ?? pending);
    const issueQty = Math.min(pending, requestedIssue);
    if (issueQty <= 0) continue;
    const batches = await consumeFifo({
      materialName: line.materialName,
      category: line.category,
      quantity: issueQty,
      warehouse: req.body.warehouse || item.warehouse,
      referenceId: minNumber,
      remarks: item.purpose,
      user: req.user?.name
    });
    const lineValue = batches.reduce((total, batch) => total + (batch.quantity * Number(batch.unitCost || 0)), 0);
    totalValue += lineValue;
    line.issuedQuantity = Number(line.issuedQuantity || 0) + issueQty;
    line.remainingQuantity = Math.max(Number(line.requiredQuantity || 0) - line.issuedQuantity, 0);
    line.issueStatus = line.remainingQuantity === 0 ? 'Issued' : 'Partially Issued';
    issueLines.push({ materialName: line.materialName, requestedQuantity: line.requiredQuantity, issuedQuantity: issueQty, unit: line.unit, batches });
  }

  item.issuedQuantity = item.items.reduce((total, line) => total + Number(line.issuedQuantity || 0), 0);
  item.remainingQuantity = item.items.reduce((total, line) => total + Number(line.remainingQuantity || 0), 0);
  item.totalIssuedValue = Number(item.totalIssuedValue || 0) + totalValue;
  item.status = item.remainingQuantity === 0 ? 'Issued' : 'Partially Issued';
  item.issues.push({ minNumber, issuedBy: req.user?.name || 'System', issuedAt: new Date(), warehouse: req.body.warehouse || item.warehouse, items: issueLines, totalValue, remarks: req.body.remarks });
  item.audit.push({ action: 'Issued', by: req.user?.name || 'System', remarks: minNumber });
  ok(res, await item.save(), 'Material issue note generated');
});

exports.materialRequestStats = asyncHandler(async (req, res) => {
  const rows = await MaterialRequest.find();
  ok(res, {
    totalRequested: sum(rows, 'requestedQuantity'),
    totalIssued: sum(rows, 'issuedQuantity'),
    pendingIssue: rows.filter((row) => ['Pending', 'Approved'].includes(row.status)).length,
    partiallyIssued: rows.filter((row) => row.status === 'Partially Issued').length,
    rejectedRequests: rows.filter((row) => row.status === 'Rejected').length,
    totalMaterialValueIssued: sum(rows, 'totalIssuedValue')
  });
});

exports.listTransfers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const [items, total] = await Promise.all([
    WarehouseTransfer.find(req.query.status ? { status: req.query.status } : {}).populate('fromWarehouse toWarehouse').sort('-createdAt').skip(skip).limit(limit),
    WarehouseTransfer.countDocuments(req.query.status ? { status: req.query.status } : {})
  ]);
  ok(res, { items, total, page, pages: Math.ceil(total / limit) });
});

exports.createTransfer = asyncHandler(async (req, res) => {
  const transferNumber = req.body.transferNumber || await nextNumber('TRF', WarehouseTransfer, 'transferNumber');
  created(res, await WarehouseTransfer.create({ ...req.body, transferNumber, audit: [{ action: 'Created', by: req.user?.name || req.body.requestedBy || 'System' }] }));
});

exports.updateTransferStatus = asyncHandler(async (req, res) => {
  const transfer = await WarehouseTransfer.findById(req.params.id);
  if (!transfer) throw new Error('Transfer not found');
  transfer.status = req.body.status;
  if (req.body.status === 'Transit') transfer.sentAt = new Date();
  if (req.body.status === 'Received') transfer.receivedAt = new Date();
  transfer.audit.push({ action: req.body.status, by: req.user?.name || req.body.by || 'System', remarks: req.body.remarks });
  ok(res, await transfer.save(), 'Transfer updated');
});

exports.serials = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const [items, total] = await Promise.all([
    SerialInventory.find(req.query.status ? { status: req.query.status } : {}).populate('warehouse').sort('-createdAt').skip(skip).limit(limit),
    SerialInventory.countDocuments(req.query.status ? { status: req.query.status } : {})
  ]);
  ok(res, { items, total, page, pages: Math.ceil(total / limit) });
});

exports.createSerial = asyncHandler(async (req, res) => {
  created(res, await SerialInventory.create(req.body));
});

exports.analytics = asyncHandler(async (req, res) => {
  const [raw, finished, batches, movements, warehouses, pos, grns, mrs, transfers] = await Promise.all([
    RawMaterialStock.find().populate('warehouse'),
    FinishedGoodsStock.find().populate('warehouse'),
    MaterialBatch.find().populate('warehouse supplier'),
    StockMovement.find().sort('-createdAt').limit(5000),
    Warehouse.find(),
    PurchaseOrder.find(),
    GoodReceipt.find(),
    MaterialRequest.find(),
    WarehouseTransfer.find()
  ]);

  const totalStockValue = sum(raw, 'totalValue') + finished.reduce((total, row) => total + Number(row.availableQuantity || 0) * Number(row.unitCost || 0), 0);
  const stockIn = movements.reduce((total, row) => total + Number(row.quantityIn || 0), 0);
  const stockOut = movements.reduce((total, row) => total + Number(row.quantityOut || 0), 0);
  const deadBatches = batches.filter((batch) => Number(batch.availableQuantity || 0) > 0 && ageDays(batch.createdAt) >= 180);
  const slowBatches = batches.filter((batch) => Number(batch.availableQuantity || 0) > 0 && ageDays(batch.createdAt) >= 60 && ageDays(batch.createdAt) < 180);
  const turnover = totalStockValue > 0 ? stockOut / ((totalStockValue + Math.max(totalStockValue - stockOut, 0)) / 2 || 1) : 0;
  const inventoryAccuracy = raw.some((row) => Number(row.availableQuantity || 0) < 0) ? 90 : 99;
  const healthScore = Math.max(0, Math.min(100, 85 + Math.min(turnover, 8) - deadBatches.length * 3 - slowBatches.length - (100 - inventoryAccuracy)));

  const warehouseAnalytics = warehouses.map((warehouse) => {
    const whRaw = raw.filter((row) => String(row.warehouse?._id || row.warehouse || '') === String(warehouse._id));
    const whFinished = finished.filter((row) => String(row.warehouse?._id || row.warehouse || '') === String(warehouse._id));
    const whMovements = movements.filter((row) => String(row.warehouseId || '') === String(warehouse._id));
    const cogs = whMovements.reduce((total, row) => total + Number(row.totalValue || 0) * (Number(row.quantityOut || 0) > 0 ? 1 : 0), 0);
    const value = sum(whRaw, 'totalValue') + whFinished.reduce((total, row) => total + Number(row.availableQuantity || 0) * Number(row.unitCost || 0), 0);
    const ratio = value > 0 ? cogs / ((value + Math.max(value - cogs, 0)) / 2 || 1) : 0;
    return {
      warehouse: warehouse.name,
      currentStock: sum(whRaw, 'availableQuantity') + sum(whFinished, 'availableQuantity'),
      reservedStock: sum(whRaw, 'reservedQuantity') + sum(whFinished, 'reservedQuantity'),
      availableStock: sum(whRaw, 'availableQuantity') + sum(whFinished, 'availableQuantity'),
      incomingStock: whMovements.reduce((total, row) => total + Number(row.quantityIn || 0), 0),
      outgoingStock: whMovements.reduce((total, row) => total + Number(row.quantityOut || 0), 0),
      inventoryValue: value,
      capacity: warehouse.totalCapacity,
      cogs,
      averageInventory: (value + Math.max(value - cogs, 0)) / 2,
      turnoverRatio: Number(ratio.toFixed(2)),
      status: turnoverStatus(ratio)
    };
  });

  const ageingBuckets = ['0-30 Days', '31-60 Days', '61-90 Days', '90-180 Days', '180+ Days'].map((label) => ({ label, quantity: 0, value: 0 }));
  batches.forEach((batch) => {
    const age = ageDays(batch.createdAt);
    const index = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : age <= 180 ? 3 : 4;
    ageingBuckets[index].quantity += Number(batch.availableQuantity || 0);
    ageingBuckets[index].value += Number(batch.availableQuantity || 0) * Number(batch.unitCost || 0);
  });

  const monthly = Array.from({ length: 12 }, (_, index) => ({ month: new Date(2026, index, 1).toLocaleString('en', { month: 'short' }), stockIn: 0, stockOut: 0, value: 0 }));
  movements.forEach((row) => {
    const month = new Date(row.createdAt).getMonth();
    if (!monthly[month]) return;
    monthly[month].stockIn += Number(row.quantityIn || 0);
    monthly[month].stockOut += Number(row.quantityOut || 0);
    monthly[month].value += Number(row.totalValue || 0);
  });

  ok(res, {
    kpis: {
      totalItems: raw.length + finished.length,
      totalQuantity: sum(raw, 'availableQuantity') + sum(finished, 'availableQuantity'),
      openingStock: Math.max(stockIn - stockOut, 0),
      closingStock: sum(raw, 'availableQuantity') + sum(finished, 'availableQuantity'),
      totalStockValue,
      inventoryValue: totalStockValue,
      stockIn,
      stockOut,
      goodsReceived: grns.length,
      goodsIssued: movements.filter((row) => row.movementType === 'MATERIAL_CONSUMED').length,
      pendingPurchase: pos.filter((po) => ['Open', 'Draft', 'Sent'].includes(po.status)).length,
      pendingDelivery: pos.filter((po) => po.status === 'Partially Received').length,
      pendingMaterialRequests: mrs.filter((row) => ['Pending', 'Approved'].includes(row.status)).length,
      pendingWarehouseTransfers: transfers.filter((row) => ['Pending', 'Transit'].includes(row.status)).length,
      materialReturned: movements.filter((row) => row.movementType === 'SUPPLIER_RETURN').length,
      wastageValue: movements.filter((row) => row.movementType === 'DAMAGE').reduce((total, row) => total + Number(row.totalValue || 0), 0),
      scrapValue: movements.filter((row) => row.movementType === 'DAMAGE').reduce((total, row) => total + Number(row.totalValue || 0), 0),
      inventoryTurnover: Number(turnover.toFixed(2)),
      averageStockAge: batches.length ? Math.round(batches.reduce((total, batch) => total + ageDays(batch.createdAt), 0) / batches.length) : 0,
      inventoryAccuracy,
      inventoryHealthScore: Math.round(healthScore),
      inventoryHealth: healthLabel(healthScore)
    },
    warehouseAnalytics,
    ageingBuckets,
    fifoQueue: batches.filter((batch) => Number(batch.availableQuantity || 0) > 0).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 25),
    slowMoving: slowBatches.map((batch) => ({ batchNo: batch.batchNo, materialName: batch.materialName, daysIdle: ageDays(batch.updatedAt), currentQty: batch.availableQuantity, currentValue: batch.availableQuantity * Number(batch.unitCost || 0), warehouse: batch.warehouse?.name, suggestedAction: 'Use in Production' })),
    deadStock: deadBatches.map((batch) => ({ batchNo: batch.batchNo, materialName: batch.materialName, daysIdle: ageDays(batch.updatedAt), valueLocked: batch.availableQuantity * Number(batch.unitCost || 0), warehouse: batch.warehouse?.name, reason: 'No movement for 180+ days', recommendation: 'Liquidate or transfer' })),
    monthly,
    topMovingProducts: movements.reduce((map, row) => {
      const key = row.sku || row.materialId || 'Unknown';
      map[key] = (map[key] || 0) + Number(row.quantityOut || 0);
      return map;
    }, {}),
    alerts: [
      ...raw.filter((row) => row.availableQuantity <= row.reorderLevel).map((row) => ({ type: 'Low Stock', message: `${row.materialName} is below reorder level`, severity: 'warning' })),
      ...raw.filter((row) => row.availableQuantity < 0).map((row) => ({ type: 'Negative Stock', message: `${row.materialName} is negative`, severity: 'critical' })),
      ...deadBatches.slice(0, 10).map((row) => ({ type: 'Dead Stock', message: `${row.batchNo} has no movement for 180+ days`, severity: 'critical' })),
      ...batches.filter((row) => row.expiryDate && new Date(row.expiryDate) <= new Date(Date.now() + 30 * 86400000)).map((row) => ({ type: 'Batch Expiry', message: `${row.batchNo} expires soon`, severity: 'warning' }))
    ]
  });
});
