const asyncHandler = require('express-async-handler');
const RawMaterialStock = require('../models/RawMaterialStock');
const MaterialBatch = require('../models/MaterialBatch');
const StockMovement = require('../models/StockMovement');
const GoodReceipt = require('../models/GoodReceipt');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const WarehouseLocation = require('../models/WarehouseLocation');
const Warehouse = require('../models/Warehouse');
const BarcodeLabel = require('../models/BarcodeLabel');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');
const { createMovement, receiveRawMaterialFromGRN, statusFor } = require('../services/stockService');

const pageParams = (query) => {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 10);
  return { page, limit, skip: (page - 1) * limit };
};

const dateFilter = (query) => {
  const filter = {};
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  return filter;
};

const postedRawMaterialStockFilter = {
  $or: [
    { availableQuantity: { $gt: 0 } },
    { reservedQuantity: { $gt: 0 } },
    { consumedQuantity: { $gt: 0 } },
    { rejectedQuantity: { $gt: 0 } },
    { totalValue: { $gt: 0 } }
  ]
};

async function repairZeroValueRawMaterialStock(items) {
  await Promise.all(items.map(async (item) => {
    if (Number(item.totalValue || 0) > 0 || Number(item.availableQuantity || 0) <= 0) return;
    const batches = await MaterialBatch.find({
      materialName: item.materialName,
      category: item.category,
      supplier: item.supplier || undefined
    });
    let totalValue = batches.reduce((sum, batch) => sum + Number(batch.totalValue || 0), 0);
    if (totalValue <= 0) {
      const grnIds = batches.map((batch) => batch.grn).filter(Boolean);
      const receipts = await GoodReceipt.find({ _id: { $in: grnIds } });
      totalValue = receipts.reduce((sum, receipt) => sum + Number(receipt.receiptValue || 0), 0);
    }
    if (totalValue <= 0) return;
    item.totalValue = totalValue;
    item.unitCost = totalValue / Number(item.availableQuantity || 1);
    await item.save();
  }));
}

async function postMissingCompletedGrns() {
  const receipts = await GoodReceipt.find({
    status: 'Completed',
    stockPosted: { $ne: true }
  });

  await Promise.all(receipts.map(async (receipt) => {
    await receiveRawMaterialFromGRN(receipt);
    receipt.stockPosted = true;
    receipt.approvedBy = receipt.approvedBy || 'System';
    receipt.approvedAt = receipt.approvedAt || new Date();
    await receipt.save();
  }));
}

exports.listRawMaterialStock = asyncHandler(async (req, res) => {
  await postMissingCompletedGrns();
  const { search = '', category, status, warehouse } = req.query;
  const { page, limit, skip } = pageParams(req.query);
  const filter = { $and: [postedRawMaterialStockFilter] };
  if (search) filter.$and.push({ $or: [{ materialName: new RegExp(search, 'i') }, { supplierName: new RegExp(search, 'i') }, { category: new RegExp(search, 'i') }] });
  if (category && category !== 'All Categories') filter.category = category;
  if (status && status !== 'All Status') filter.status = status;
  if (warehouse) filter.warehouse = warehouse;

  const [items, total] = await Promise.all([
    RawMaterialStock.find(filter).populate('warehouse location').sort('-createdAt').skip(skip).limit(limit),
    RawMaterialStock.countDocuments(filter)
  ]);
  await repairZeroValueRawMaterialStock(items);
  ok(res, { items, total, page, pages: Math.ceil(total / limit) });
});

exports.rawMaterialStats = asyncHandler(async (req, res) => {
  await postMissingCompletedGrns();
  const rows = await RawMaterialStock.find(postedRawMaterialStockFilter);
  await repairZeroValueRawMaterialStock(rows);
  ok(res, {
    totalItems: rows.length,
    availableQuantity: rows.reduce((sum, row) => sum + row.availableQuantity, 0),
    reservedQuantity: rows.reduce((sum, row) => sum + row.reservedQuantity, 0),
    stockValue: rows.reduce((sum, row) => sum + row.totalValue, 0),
    lowStock: rows.filter((row) => row.status === 'Low Stock' || row.availableQuantity <= row.reorderLevel).length
  });
});

exports.listBatches = asyncHandler(async (req, res) => {
  const { search = '', status } = req.query;
  const { page, limit, skip } = pageParams(req.query);
  const filter = {};
  if (search) filter.$or = [{ batchNo: new RegExp(search, 'i') }, { materialName: new RegExp(search, 'i') }, { poNumber: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  const [items, total] = await Promise.all([
    MaterialBatch.find(filter).populate('supplier warehouse location').sort('-createdAt').skip(skip).limit(limit),
    MaterialBatch.countDocuments(filter)
  ]);
  ok(res, { items, total, page, pages: Math.ceil(total / limit) });
});

exports.listMovements = asyncHandler(async (req, res) => {
  const { search = '', itemType, movementType, warehouse, sku } = req.query;
  const { page, limit, skip } = pageParams(req.query);
  const filter = { ...dateFilter(req.query) };
  if (search) filter.$or = [{ sku: new RegExp(search, 'i') }, { materialId: new RegExp(search, 'i') }, { batchNo: new RegExp(search, 'i') }, { referenceId: new RegExp(search, 'i') }];
  if (itemType && itemType !== 'All Item Types') filter.itemType = itemType;
  if (movementType && movementType !== 'All Movement Types') filter.movementType = movementType;
  if (warehouse) filter.warehouseId = warehouse;
  if (sku) filter.sku = sku;
  const [items, total] = await Promise.all([
    StockMovement.find(filter).populate('warehouseId locationId').sort('-createdAt').skip(skip).limit(limit),
    StockMovement.countDocuments(filter)
  ]);
  ok(res, { items, total, page, pages: Math.ceil(total / limit) });
});

exports.getMovement = asyncHandler(async (req, res) => ok(res, await StockMovement.findById(req.params.id).populate('warehouseId locationId')));

exports.movementStats = asyncHandler(async (req, res) => {
  const rows = await StockMovement.find(dateFilter(req.query));
  ok(res, {
    totalMovements: rows.length,
    rawMaterialMovements: rows.filter((row) => row.itemType === 'RAW_MATERIAL').length,
    finishedGoodsMovements: rows.filter((row) => row.itemType === 'FINISHED_GOOD').length,
    quantityIn: rows.reduce((sum, row) => sum + row.quantityIn, 0),
    quantityOut: rows.reduce((sum, row) => sum + row.quantityOut, 0),
    value: rows.reduce((sum, row) => sum + row.totalValue, 0)
  });
});

exports.listFinishedGoods = asyncHandler(async (req, res) => {
  const { search = '', status, warehouse } = req.query;
  const { page, limit, skip } = pageParams(req.query);
  const filter = {};
  if (search) filter.$or = [{ sku: new RegExp(search, 'i') }, { productName: new RegExp(search, 'i') }, { color: new RegExp(search, 'i') }, { size: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (warehouse) filter.warehouse = warehouse;
  const [items, total] = await Promise.all([
    FinishedGoodsStock.find(filter).populate('warehouse location').sort('-createdAt').skip(skip).limit(limit),
    FinishedGoodsStock.countDocuments(filter)
  ]);
  ok(res, { items, total, page, pages: Math.ceil(total / limit) });
});

exports.finishedGoodsStats = asyncHandler(async (req, res) => {
  const rows = await FinishedGoodsStock.find();
  ok(res, {
    totalSkus: rows.length,
    availableQuantity: rows.reduce((sum, row) => sum + row.availableQuantity, 0),
    reservedQuantity: rows.reduce((sum, row) => sum + row.reservedQuantity, 0),
    damagedQuantity: rows.reduce((sum, row) => sum + row.damagedQuantity, 0),
    lowStock: rows.filter((row) => row.status === 'Low Stock' || row.availableQuantity <= row.reorderLevel).length
  });
});

exports.listBarcodeLabels = asyncHandler(async (req, res) => {
  const { search = '', status, page = 1, limit = 10 } = req.query;
  const perPage = Number(limit);
  const filter = {};
  if (search) filter.$or = [{ sku: new RegExp(search, 'i') }, { barcode: new RegExp(search, 'i') }, { productName: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.labelStatus = status;
  const [items, total] = await Promise.all([
    BarcodeLabel.find(filter).sort('-createdAt').skip((Number(page) - 1) * perPage).limit(perPage),
    BarcodeLabel.countDocuments(filter)
  ]);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / perPage) });
});

exports.createBarcodeLabel = asyncHandler(async (req, res) => {
  created(res, await BarcodeLabel.create(req.body));
});

exports.updateBarcodeLabel = asyncHandler(async (req, res) => {
  ok(res, await BarcodeLabel.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});

exports.markBarcodePrinted = asyncHandler(async (req, res) => {
  const ids = req.body.ids || [];
  await BarcodeLabel.updateMany({ _id: { $in: ids } }, { labelStatus: 'Printed' });
  ok(res, { updated: ids.length }, 'Labels marked as printed');
});

exports.barcodeLabelStats = asyncHandler(async (req, res) => {
  const rows = await BarcodeLabel.find();
  ok(res, {
    total: rows.length,
    pending: rows.filter((row) => row.labelStatus === 'Pending Print').length,
    printed: rows.filter((row) => row.labelStatus === 'Printed').length,
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0)
  });
});

exports.listLocations = asyncHandler(async (req, res) => {
  const { search = '', status, warehouse } = req.query;
  const { page, limit, skip } = pageParams(req.query);
  const filter = {};
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { code: new RegExp(search, 'i') }, { warehouseCode: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (warehouse) filter.warehouse = warehouse;
  const [items, total, rawStock, finishedStock] = await Promise.all([
    WarehouseLocation.find(filter).populate('warehouse').sort('warehouseCode code').skip(skip).limit(limit),
    WarehouseLocation.countDocuments(filter),
    RawMaterialStock.find({ location: { $ne: null } }),
    FinishedGoodsStock.find({ location: { $ne: null } })
  ]);
  const usedByLocation = [...rawStock, ...finishedStock].reduce((map, stock) => {
    const key = String(stock.location || '');
    if (!key) return map;
    map[key] = (map[key] || 0) + Number(stock.availableQuantity || 0);
    return map;
  }, {});
  ok(res, {
    items: items.map((item) => ({ ...item.toObject(), usedCapacity: usedByLocation[String(item._id)] || 0 })),
    total,
    page,
    pages: Math.ceil(total / limit)
  });
});

exports.createLocation = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.body.warehouse);
  const item = await WarehouseLocation.create({ ...req.body, warehouseCode: warehouse?.code });
  created(res, item);
});

exports.updateLocation = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.warehouse) {
    const warehouse = await Warehouse.findById(payload.warehouse);
    payload.warehouseCode = warehouse?.code || payload.warehouseCode;
  }
  ok(res, await WarehouseLocation.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }));
});

exports.deleteLocation = asyncHandler(async (req, res) => {
  await WarehouseLocation.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
});

exports.adjustStock = asyncHandler(async (req, res) => {
  const { itemType, stockId, quantity, reason, remarks, direction = 'IN' } = req.body;
  const note = reason || remarks;
  const amount = Math.abs(Number(quantity || 0));
  if (!amount) throw new Error('Adjustment quantity is required');

  const Model = itemType === 'FINISHED_GOOD' ? FinishedGoodsStock : RawMaterialStock;
  const stock = await Model.findById(stockId);
  if (!stock) throw new Error('Stock item not found');

  const signed = direction === 'OUT' ? -amount : amount;
  stock.availableQuantity += signed;
  if (stock.availableQuantity < 0) throw new Error('Adjustment would make stock negative');
  stock.totalQuantity = stock.totalQuantity != null ? stock.totalQuantity + signed : stock.totalQuantity;
  stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
  await stock.save();

  await createMovement({
    movementType: 'ADJUSTMENT',
    itemType,
    referenceType: 'Adjustment',
    referenceId: String(stock._id),
    materialId: itemType === 'RAW_MATERIAL' ? stock.materialName : undefined,
    sku: itemType === 'FINISHED_GOOD' ? stock.sku : undefined,
    warehouseId: stock.warehouse,
    locationId: stock.location,
    quantityIn: direction === 'IN' ? amount : 0,
    quantityOut: direction === 'OUT' ? amount : 0,
    balanceAfter: stock.availableQuantity,
    unitCost: stock.unitCost,
    totalValue: amount * Number(stock.unitCost || 0),
    remarks: note
  });

  await Activity.create({ module: 'warehouse-overview', title: 'Stock adjustment posted', description: note || `${amount} units adjusted`, dateText: new Date().toLocaleString(), type: 'warning' });
  ok(res, stock, 'Stock adjusted');
});

async function getStockModel(itemType) {
  return itemType === 'FINISHED_GOOD' ? FinishedGoodsStock : RawMaterialStock;
}

function stockIdentity(stock, itemType) {
  if (itemType === 'FINISHED_GOOD') return { sku: stock.sku, productName: stock.productName, product: stock.product, variant: stock.variant, barcode: stock.barcode, size: stock.size, color: stock.color };
  return { materialName: stock.materialName, category: stock.category, supplier: stock.supplier, supplierName: stock.supplierName, unit: stock.unit };
}

exports.stockIn = asyncHandler(async (req, res) => {
  const { itemType, stockId, quantity, remarks } = req.body;
  const amount = Number(quantity || 0);
  if (amount <= 0) throw new Error('Stock in quantity is required');
  const Model = await getStockModel(itemType);
  const stock = await Model.findById(stockId);
  if (!stock) throw new Error('Stock item not found');

  stock.availableQuantity += amount;
  if (stock.totalQuantity != null) stock.totalQuantity += amount;
  stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
  await stock.save();

  await createMovement({
    movementType: itemType === 'FINISHED_GOOD' ? 'FINISHED_GOODS_IN' : 'ADJUSTMENT',
    itemType,
    referenceType: 'StockIn',
    referenceId: String(stock._id),
    materialId: itemType === 'RAW_MATERIAL' ? stock.materialName : undefined,
    sku: itemType === 'FINISHED_GOOD' ? stock.sku : undefined,
    warehouseId: stock.warehouse,
    locationId: stock.location,
    quantityIn: amount,
    balanceAfter: stock.availableQuantity,
    unitCost: stock.unitCost,
    totalValue: amount * Number(stock.unitCost || 0),
    remarks
  });

  ok(res, stock, 'Stock in posted');
});

exports.stockOut = asyncHandler(async (req, res) => {
  const { itemType, stockId, quantity, remarks, movementType = 'ADJUSTMENT' } = req.body;
  const amount = Number(quantity || 0);
  if (amount <= 0) throw new Error('Stock out quantity is required');
  const Model = await getStockModel(itemType);
  const stock = await Model.findById(stockId);
  if (!stock) throw new Error('Stock item not found');
  if (stock.availableQuantity < amount) throw new Error('Insufficient available stock');

  stock.availableQuantity -= amount;
  if (stock.totalQuantity != null) stock.totalQuantity -= amount;
  stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
  await stock.save();

  await createMovement({
    movementType,
    itemType,
    referenceType: 'StockOut',
    referenceId: String(stock._id),
    materialId: itemType === 'RAW_MATERIAL' ? stock.materialName : undefined,
    sku: itemType === 'FINISHED_GOOD' ? stock.sku : undefined,
    warehouseId: stock.warehouse,
    locationId: stock.location,
    quantityOut: amount,
    balanceAfter: stock.availableQuantity,
    unitCost: stock.unitCost,
    totalValue: amount * Number(stock.unitCost || 0),
    remarks
  });

  ok(res, stock, 'Stock out posted');
});

exports.transferStock = asyncHandler(async (req, res) => {
  const { itemType, stockId, quantity, destinationWarehouse, destinationLocation, remarks } = req.body;
  const amount = Number(quantity || 0);
  if (amount <= 0) throw new Error('Transfer quantity is required');
  if (!destinationWarehouse) throw new Error('Destination warehouse is required');

  const Model = await getStockModel(itemType);
  const source = await Model.findById(stockId);
  if (!source) throw new Error('Source stock item not found');
  if (source.availableQuantity < amount) throw new Error('Insufficient stock for transfer');

  source.availableQuantity -= amount;
  if (source.totalQuantity != null) source.totalQuantity -= amount;
  source.status = statusFor(source.availableQuantity, source.reorderLevel);
  await source.save();

  const identity = stockIdentity(source, itemType);
  const destFilter = itemType === 'FINISHED_GOOD'
    ? { sku: source.sku, warehouse: destinationWarehouse, location: destinationLocation || undefined }
    : { materialName: source.materialName, category: source.category, warehouse: destinationWarehouse, location: destinationLocation || undefined };

  const destination = await Model.findOneAndUpdate(
    destFilter,
    {
      $setOnInsert: {
        ...identity,
        warehouse: destinationWarehouse,
        location: destinationLocation,
        unit: source.unit,
        unitCost: source.unitCost,
        reorderLevel: source.reorderLevel
      },
      $inc: {
        availableQuantity: amount,
        totalQuantity: itemType === 'FINISHED_GOOD' ? amount : 0,
        totalValue: itemType === 'RAW_MATERIAL' ? amount * Number(source.unitCost || 0) : 0
      }
    },
    { new: true, upsert: true }
  );
  destination.status = statusFor(destination.availableQuantity, destination.reorderLevel);
  await destination.save();

  await createMovement({
    movementType: 'TRANSFER_OUT',
    itemType,
    referenceType: 'StockTransfer',
    referenceId: String(source._id),
    materialId: itemType === 'RAW_MATERIAL' ? source.materialName : undefined,
    sku: itemType === 'FINISHED_GOOD' ? source.sku : undefined,
    warehouseId: source.warehouse,
    locationId: source.location,
    quantityOut: amount,
    balanceAfter: source.availableQuantity,
    unitCost: source.unitCost,
    totalValue: amount * Number(source.unitCost || 0),
    remarks
  });

  await createMovement({
    movementType: 'TRANSFER_IN',
    itemType,
    referenceType: 'StockTransfer',
    referenceId: String(destination._id),
    materialId: itemType === 'RAW_MATERIAL' ? destination.materialName : undefined,
    sku: itemType === 'FINISHED_GOOD' ? destination.sku : undefined,
    warehouseId: destination.warehouse,
    locationId: destination.location,
    quantityIn: amount,
    balanceAfter: destination.availableQuantity,
    unitCost: destination.unitCost,
    totalValue: amount * Number(destination.unitCost || 0),
    remarks
  });

  ok(res, { source, destination }, 'Stock transferred');
});
