const asyncHandler = require('express-async-handler');
const GoodReceipt = require('../models/GoodReceipt');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');
const { receiveRawMaterialFromGRN } = require('../services/stockService');

function lineKey(line = {}) {
  return String(line.poLineNo || line.lineNo || line.materialName || line.category || '').toLowerCase();
}

function poLineItems(po) {
  if (!po) return [];
  if (po.items?.length) return po.items;

  return [{
    lineNo: 1,
    materialName: po.category || 'Raw Material',
    category: po.category,
    quantity: Number(po.orderedQuantity || 0),
    receivedQuantity: Number(po.receivedQuantity || 0),
    rejectedQuantity: 0,
    unit: 'm',
    unitPrice: Number(po.orderedQuantity || 0) ? Number(po.totalAmount || 0) / Number(po.orderedQuantity || 1) : 0,
    amount: Number(po.totalAmount || 0),
    status: po.status || 'Open'
  }];
}

function receiptLinesFromBody(body, po) {
  if (body.items?.length) {
    return body.items.map((line, index) => ({
      ...line,
      poLineNo: line.poLineNo || line.lineNo || index + 1,
      receivedQuantity: Number(line.receivedQuantity || line.acceptedQuantity || 0),
      acceptedQuantity: Number(line.acceptedQuantity ?? line.receivedQuantity ?? 0),
      rejectedQuantity: Number(line.rejectedQuantity || 0),
      unitCost: Number(line.unitCost || 0),
      totalValue: Number(line.totalValue || 0)
    }));
  }

  const poItems = poLineItems(po);
  const poItem = poItems.find((item) => String(item.category || '').toLowerCase() === String(body.category || '').toLowerCase()) || poItems[0];
  const quantity = Number(body.quantity || 0);
  return [{
    poLineNo: poItem?.lineNo || 1,
    materialName: poItem?.materialName || body.category || 'Raw Material',
    category: poItem?.category || body.category,
    orderedQuantity: Number(poItem?.quantity || quantity),
    receivedQuantity: quantity,
    acceptedQuantity: body.status === 'Rejected' ? 0 : quantity,
    rejectedQuantity: body.status === 'Rejected' ? quantity : 0,
    unit: body.unit || poItem?.unit || 'm',
    unitCost: quantity ? Number(body.receiptValue || 0) / quantity : Number(poItem?.unitPrice || 0),
    totalValue: Number(body.receiptValue || 0),
    batchNo: `${body.grnNumber}-B1`
  }];
}

async function approvedReceiptTotals(poNumber, excludeReceiptId) {
  if (!poNumber) return {};
  const filter = {
    poNumber,
    approvedAt: { $exists: true, $ne: null }
  };
  if (excludeReceiptId) filter._id = { $ne: excludeReceiptId };

  const receipts = await GoodReceipt.find(filter);
  return receipts.flatMap((receipt) => receipt.items || []).reduce((totals, line) => {
    const keys = [lineKey(line), String(line.materialName || '').toLowerCase()].filter(Boolean);
    keys.forEach((key) => {
      totals[key] ||= { accepted: 0, rejected: 0 };
      totals[key].accepted += Number(line.acceptedQuantity || 0);
      totals[key].rejected += Number(line.rejectedQuantity || 0);
    });
    return totals;
  }, {});
}

async function syncPurchaseOrderFromReceipts(po) {
  if (!po) return;
  const totals = await approvedReceiptTotals(po.poNumber);
  const sourceItems = poLineItems(po);
  po.items = sourceItems.map((item, index) => {
    const key = String(item.lineNo || index + 1).toLowerCase();
    const materialKey = String(item.materialName || '').toLowerCase();
    const lineTotals = totals[key] || totals[materialKey] || { accepted: 0, rejected: 0 };
    const receivedQuantity = lineTotals.accepted;
    const rejectedQuantity = lineTotals.rejected;
    const balanceQuantity = Math.max(Number(item.quantity || 0) - receivedQuantity - rejectedQuantity, 0);
    return {
      ...item.toObject?.() || item,
      lineNo: item.lineNo || index + 1,
      receivedQuantity,
      rejectedQuantity,
      balanceQuantity,
      status: receivedQuantity >= Number(item.quantity || 0) ? 'Completed' : receivedQuantity > 0 || rejectedQuantity > 0 ? 'Partially Received' : 'Open'
    };
  });
  po.orderedQuantity = po.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  po.receivedQuantity = po.items.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0);
  if (po.receivedQuantity <= 0) po.status = 'Open';
  else if (po.receivedQuantity >= po.orderedQuantity) po.status = 'Completed';
  else po.status = 'Partially Received';
}

async function assertReceiptWithinBalance(po, receiptLines, excludeReceiptId) {
  if (!po) return;
  const totals = await approvedReceiptTotals(po.poNumber, excludeReceiptId);
  const poItems = poLineItems(po);
  for (const line of receiptLines) {
    const poItem = poItems.find((item, index) => (
      String(item.lineNo || index + 1) === String(line.poLineNo) ||
      String(item.materialName || '').toLowerCase() === String(line.materialName || '').toLowerCase() ||
      String(item.category || '').toLowerCase() === String(line.category || '').toLowerCase()
    ));
    if (!poItem) throw new Error(`PO line not found for ${line.materialName || line.poLineNo}`);
    const key = String(poItem.lineNo || 1).toLowerCase();
    const materialKey = String(poItem.materialName || '').toLowerCase();
    const lineTotals = totals[key] || totals[materialKey] || { accepted: 0, rejected: 0 };
    const balance = Number(poItem.quantity || 0) - lineTotals.accepted - lineTotals.rejected;
    const incoming = Number(line.acceptedQuantity || 0) + Number(line.rejectedQuantity || 0);
    if (incoming > balance) throw new Error(`Receipt quantity exceeds pending balance for ${poItem.materialName}`);
  }
}

exports.getGoodReceipts = asyncHandler(async (req, res) => {
  const { search = '', status, supplier, category, page = 1, limit = 10 } = req.query;
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
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage);
  const total = await GoodReceipt.countDocuments(filter);

  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / perPage) });
});

exports.createGoodReceipt = asyncHandler(async (req, res) => {
  const supplier = req.body.supplier ? await Supplier.findById(req.body.supplier) : null;
  const po = req.body.poNumber ? await PurchaseOrder.findOne({ poNumber: req.body.poNumber }) : null;
  const receiptItems = receiptLinesFromBody(req.body, po);
  await assertReceiptWithinBalance(po, receiptItems);

  const quantity = receiptItems.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0);
  const receiptValue = receiptItems.reduce((sum, item) => sum + Number(item.totalValue || (Number(item.acceptedQuantity || 0) * Number(item.unitCost || 0))), 0);
  const receipt = await GoodReceipt.create({
    ...req.body,
    supplierName: req.body.supplierName || supplier?.name || po?.supplierName,
    supplier: req.body.supplier || po?.supplier,
    category: req.body.category || receiptItems[0]?.category,
    items: receiptItems,
    itemsCount: receiptItems.length,
    quantity: req.body.quantity || quantity,
    unit: req.body.unit || receiptItems[0]?.unit || 'm',
    receiptValue: req.body.receiptValue || receiptValue
  });
  if (receipt.status === 'Completed') {
    await receiveRawMaterialFromGRN(receipt);
    receipt.stockPosted = true;
    receipt.approvedBy = req.user?.name || 'System';
    receipt.approvedAt = new Date();
    await receipt.save();
  }

  if (po && receipt.status === 'Completed') {
    await syncPurchaseOrderFromReceipts(po);
    await po.save();
  }

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
exports.updateGoodReceipt = asyncHandler(async (req, res) => {
  const receipt = await GoodReceipt.findById(req.params.id);
  if (!receipt) throw new Error('GRN not found');
  Object.assign(receipt, req.body);

  if (receipt.status === 'Completed' && !receipt.stockPosted) {
    await receiveRawMaterialFromGRN(receipt);
    receipt.stockPosted = true;
    receipt.approvedBy = req.user?.name || receipt.approvedBy || 'System';
    receipt.approvedAt = receipt.approvedAt || new Date();
  }

  await receipt.save();
  ok(res, receipt);
});
exports.deleteGoodReceipt = asyncHandler(async (req, res) => { await GoodReceipt.findByIdAndDelete(req.params.id); ok(res, null, 'Deleted'); });

exports.approveGoodReceipt = asyncHandler(async (req, res) => {
  const receipt = await GoodReceipt.findById(req.params.id);
  if (!receipt) throw new Error('GRN not found');
  if (receipt.stockPosted) throw new Error('GRN is already approved and posted to stock');

  const po = receipt.poNumber ? await PurchaseOrder.findOne({ poNumber: receipt.poNumber }) : null;
  const incomingItems = req.body.items?.length ? req.body.items : receipt.items;
  const approvedItems = incomingItems.map((line, index) => {
    const receivedQuantity = Number(line.receivedQuantity || line.acceptedQuantity || line.rejectedQuantity || 0);
    const acceptedQuantity = Number(line.acceptedQuantity || 0);
    const rejectedQuantity = Number(line.rejectedQuantity || 0);
    if (acceptedQuantity + rejectedQuantity > receivedQuantity) {
      throw new Error(`Accepted and rejected quantity exceeds received quantity for ${line.materialName || `line ${index + 1}`}`);
    }
    return {
      ...line,
      poLineNo: line.poLineNo || index + 1,
      receivedQuantity,
      acceptedQuantity,
      rejectedQuantity,
      unitCost: Number(line.unitCost || 0),
      totalValue: Number(line.totalValue || acceptedQuantity * Number(line.unitCost || 0)),
      batchNo: line.batchNo || `${receipt.grnNumber}-B${index + 1}`
    };
  });

  await assertReceiptWithinBalance(po, approvedItems, receipt._id);

  const acceptedTotal = approvedItems.reduce((sum, line) => sum + Number(line.acceptedQuantity || 0), 0);
  const rejectedTotal = approvedItems.reduce((sum, line) => sum + Number(line.rejectedQuantity || 0), 0);
  if (acceptedTotal + rejectedTotal <= 0) {
    throw new Error('Enter accepted or rejected quantity before approving GRN');
  }

  receipt.items = approvedItems;
  receipt.itemsCount = approvedItems.length;
  receipt.quantity = approvedItems.reduce((sum, line) => sum + Number(line.receivedQuantity || 0), 0);
  receipt.receiptValue = approvedItems.reduce((sum, line) => sum + Number(line.totalValue || 0), 0);
  receipt.status = acceptedTotal > 0 ? 'Completed' : rejectedTotal > 0 ? 'Rejected' : 'Pending';
  receipt.approvedBy = req.user?.name || req.body.approvedBy || 'System';
  receipt.approvedAt = new Date();
  receipt.approvalRemarks = req.body.remarks;

  if (acceptedTotal > 0) {
    await receiveRawMaterialFromGRN(receipt);
    receipt.stockPosted = true;
  }

  await receipt.save();

  if (po) {
    await syncPurchaseOrderFromReceipts(po);
    await po.save();
  }

  await Activity.create({
    module: 'good-receipts',
    title: `${receipt.grnNumber} approved`,
    description: `${acceptedTotal} accepted, ${rejectedTotal} rejected`,
    dateText: new Date().toLocaleString(),
    type: acceptedTotal > 0 ? 'success' : 'danger'
  });

  ok(res, receipt, 'GRN approved');
});

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
