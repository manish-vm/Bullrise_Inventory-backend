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
const BillOfMaterial = require('../models/BillOfMaterial');
const ManufacturingWorkOrder = require('../models/ManufacturingWorkOrder');
const JobCard = require('../models/JobCard');
const ProductionDamage = require('../models/ProductionDamage');
const { ok } = require('../utils/apiResponse');

const sum = (rows, key) => rows.reduce((total, row) => total + Number(typeof key === 'function' ? key(row) : row[key] || 0), 0);
const groupCount = (rows, key) => rows.reduce((acc, row) => {
  const label = typeof key === 'function' ? key(row) : row[key];
  acc[label || 'Unassigned'] = (acc[label || 'Unassigned'] || 0) + 1;
  return acc;
}, {});
const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);
const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const marginPercent = (profit, revenue) => revenue ? Number(((profit / revenue) * 100).toFixed(2)) : 0;
const daysBetween = (from, to = new Date()) => Math.max(Math.floor((to - from) / 86400000), 0);

async function buildCostTracking() {
  const [pos, grns, raw, boms, workOrders, jobCards, damages, finished, sales] = await Promise.all([
    PurchaseOrder.find(),
    GoodReceipt.find(),
    RawMaterialStock.find(),
    BillOfMaterial.find(),
    ManufacturingWorkOrder.find(),
    JobCard.find(),
    ProductionDamage.find(),
    FinishedGoodsStock.find(),
    SalesOrder.find()
  ]);

  const purchaseCost = roundMoney(sum(pos, 'totalAmount'));
  const grnPurchaseCost = roundMoney(sum(grns, (grn) => grn.receiptValue || sum(grn.items || [], (item) => Number(item.acceptedQuantity || item.receivedQuantity || 0) * Number(item.unitCost || 0))));
  const rawMaterialInventoryCost = roundMoney(sum(raw, (row) => Number(row.availableQuantity || 0) * Number(row.unitCost || 0)));
  const reservedRawMaterialCost = roundMoney(sum(raw, (row) => Number(row.reservedQuantity || 0) * Number(row.unitCost || 0)));
  const consumedRawMaterialCost = roundMoney(sum(raw, (row) => Number(row.consumedQuantity || 0) * Number(row.unitCost || 0)));
  const rejectedRawMaterialCost = roundMoney(sum(raw, (row) => Number(row.rejectedQuantity || 0) * Number(row.unitCost || 0)));

  const bomByProduct = new Map();
  boms.forEach((bom) => {
    [bom.productName, bom.productSku, bom.variantSku].filter(Boolean).forEach((key) => bomByProduct.set(String(key).toLowerCase(), bom));
  });
  const findBom = (row) => bomByProduct.get(String(row.productStyle || row.productName || row.sku || '').toLowerCase()) || bomByProduct.get(String(row.sku || '').toLowerCase());
  const unitBomCost = (bom) => {
    const baseQty = Number(bom?.baseQuantity || 1);
    return baseQty ? Number(bom?.totalCost || 0) / baseQty : 0;
  };

  const rawMaterialInvestment = roundMoney(sum(workOrders, (wo) => {
    const bom = findBom(wo);
    const unitCost = unitBomCost(bom);
    return Number(wo.plannedQty || 0) * unitCost;
  }));

  const stageMap = new Map();
  jobCards.forEach((card) => {
    const bom = findBom(card);
    const unitCost = unitBomCost(bom);
    const stageName = card.stageName || card.department || 'Unassigned';
    const recordedStageCost = Number(card.stageCost || 0);
    const recordedUnitStageCost = Number(card.unitStageCost || 0);
    const current = stageMap.get(stageName) || {
      stageName,
      inputQuantity: 0,
      completedQuantity: 0,
      rejectedQuantity: 0,
      reworkQuantity: 0,
      manufacturingCost: 0,
      completedCost: 0,
      wastageCost: 0,
      reworkCost: 0
    };
    const input = Number(card.inputQuantity || 0);
    const completed = Number(card.completedQuantity || 0);
    const rejected = Number(card.rejectedQuantity || 0);
    const rework = Number(card.reworkQuantity || 0);
    current.inputQuantity += input;
    current.completedQuantity += completed;
    current.rejectedQuantity += rejected;
    current.reworkQuantity += rework;
    current.manufacturingCost += recordedStageCost || (completed * recordedUnitStageCost);
    current.completedCost += recordedStageCost || (completed * recordedUnitStageCost);
    current.wastageCost += rejected * (recordedUnitStageCost || unitCost);
    current.reworkCost += rework * (recordedUnitStageCost || unitCost);
    stageMap.set(stageName, current);
  });
  const stageCosts = Array.from(stageMap.values()).map((stage) => ({
    ...stage,
    manufacturingCost: roundMoney(stage.manufacturingCost),
    completedCost: roundMoney(stage.completedCost),
    wastageCost: roundMoney(stage.wastageCost),
    reworkCost: roundMoney(stage.reworkCost)
  }));
  const stageManufacturingCost = roundMoney(sum(stageCosts, 'manufacturingCost'));
  const stageWastageCost = roundMoney(sum(stageCosts, 'wastageCost'));

  const damageCost = roundMoney(sum(damages, (damage) => {
    const bom = findBom(damage);
    return Number(damage.quantity || 0) * unitBomCost(bom);
  }));
  const totalWastageCost = roundMoney(stageWastageCost + damageCost + rejectedRawMaterialCost);
  const finishedGoodsCost = roundMoney(sum(finished, (row) => Number(row.totalQuantity || row.availableQuantity || 0) * Number(row.unitCost || 0)));
  const finishedGoodsValueAtSelling = roundMoney(sum(finished, (row) => Number(row.availableQuantity || 0) * Number(row.sellingPrice || 0)));

  const stockCostBySku = new Map(finished.map((row) => [row.sku, Number(row.unitCost || 0)]));
  const salesItems = sales.flatMap((order) => (order.items || []).map((item) => ({ ...plain(item), orderNo: order.orderNo, status: order.status })));
  const deliveredSales = sales.filter((order) => !['Cancelled', 'Returned'].includes(order.status));
  const sellingCost = roundMoney(sum(deliveredSales, 'total'));
  const salesCost = roundMoney(sum(salesItems.filter((item) => item.status !== 'Cancelled' && item.status !== 'Returned'), (item) => Number(item.quantity || 0) * Number(stockCostBySku.get(item.sku) || 0)));
  const totalManufacturingInvestment = roundMoney(rawMaterialInvestment + stageManufacturingCost);
  const profit = roundMoney(sellingCost - salesCost - totalWastageCost);
  const investment = roundMoney((grnPurchaseCost || purchaseCost || rawMaterialInvestment) + stageManufacturingCost);
  const roiPercent = investment ? Number(((profit / investment) * 100).toFixed(2)) : 0;

  return {
    summary: {
      rawMaterialPurchaseCost: grnPurchaseCost || purchaseCost,
      purchaseOrderCost: purchaseCost,
      receivedMaterialCost: grnPurchaseCost,
      rawMaterialInventoryCost,
      reservedRawMaterialCost,
      consumedRawMaterialCost,
      rawMaterialInvestment,
      manufacturingInvestment: totalManufacturingInvestment,
      stageManufacturingCost,
      wastageCost: totalWastageCost,
      finishedGoodsCost,
      finishedGoodsSellingValue: finishedGoodsValueAtSelling,
      sellingCost,
      salesCost,
      grossProfit: profit,
      marginPercent: marginPercent(profit, sellingCost),
      investment,
      roiPercent
    },
    stageCosts,
    finishedGoods: finished.map((row) => ({
      sku: row.sku,
      productName: row.productName,
      availableQuantity: row.availableQuantity,
      unitCost: row.unitCost,
      sellingPrice: row.sellingPrice,
      stockCost: roundMoney(Number(row.availableQuantity || 0) * Number(row.unitCost || 0)),
      sellingValue: roundMoney(Number(row.availableQuantity || 0) * Number(row.sellingPrice || 0)),
      expectedProfit: roundMoney(Number(row.availableQuantity || 0) * (Number(row.sellingPrice || 0) - Number(row.unitCost || 0)))
    })),
    sales: {
      revenue: sellingCost,
      costOfGoodsSold: salesCost,
      profit,
      marginPercent: marginPercent(profit, sellingCost)
    }
  };
}

exports.summary = asyncHandler(async (req, res) => {
  const [raw, pos, grns, supplierReturns, production, qc, finished, sales, returns, movements, warehouses, costTracking] = await Promise.all([
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
    Warehouse.find(),
    buildCostTracking()
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
    costTracking,
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

exports.costTracking = asyncHandler(async (req, res) => ok(res, await buildCostTracking()));

exports.purchaseDetails = asyncHandler(async (req, res) => {
  const { period = '30', paymentMode = 'All', purchaseType = 'All', creditDays = 'All' } = req.query;
  const since = new Date();
  since.setDate(since.getDate() - Number(period || 30));
  const filter = { orderDate: { $gte: since } };
  if (paymentMode !== 'All') filter.paymentMode = paymentMode;
  if (purchaseType !== 'All') filter.purchaseType = purchaseType;
  if (creditDays !== 'All') filter.creditDays = Number(creditDays);

  const rows = await PurchaseOrder.find(filter).populate('supplier').sort({ orderDate: -1, createdAt: -1 }).limit(500);
  const items = rows.map((row) => {
    const orderDate = row.orderDate || row.createdAt;
    const ageDays = orderDate ? daysBetween(new Date(orderDate)) : 0;
    return {
      _id: row._id,
      poNumber: row.poNumber,
      quotationNumber: row.quotationNumber,
      supplierName: row.supplierName,
      category: row.category,
      purchaseType: row.purchaseType || 'Raw Material Purchase',
      paymentMode: row.paymentMode || 'Credit',
      creditDays: Number(row.creditDays || 0),
      orderDate,
      totalAmount: row.totalAmount,
      status: row.status,
      ageDays,
      dueInDays: row.paymentMode === 'Cash' ? 0 : Math.max(Number(row.creditDays || 0) - ageDays, 0)
    };
  });

  ok(res, {
    filters: { period: Number(period || 30), paymentMode, purchaseType, creditDays },
    summary: {
      rows: items.length,
      value: sum(items, 'totalAmount'),
      cashValue: sum(items.filter((row) => row.paymentMode === 'Cash'), 'totalAmount'),
      creditValue: sum(items.filter((row) => row.paymentMode === 'Credit'), 'totalAmount'),
      ecommerceValue: sum(items.filter((row) => row.purchaseType === 'E-Commerce Purchase'), 'totalAmount'),
      readyProductValue: sum(items.filter((row) => ['Ready Product Purchase', 'Readymade Product Purchase'].includes(row.purchaseType)), 'totalAmount')
    },
    items
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
