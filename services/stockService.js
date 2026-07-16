const Warehouse = require('../models/Warehouse');
const RawMaterialStock = require('../models/RawMaterialStock');
const MaterialBatch = require('../models/MaterialBatch');
const StockMovement = require('../models/StockMovement');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const SKU = require('../models/SKU');
const BarcodeLabel = require('../models/BarcodeLabel');
const ProductCategory = require('../models/ProductCategory');
const MaterialCategory = require('../models/MaterialCategory');

const statusFor = (available, reorderLevel) => {
  if (available <= 0) return 'Out of Stock';
  if (available <= reorderLevel) return 'Low Stock';
  return 'In Stock';
};

const validMaterialCategoryUnits = new Set(['m', 'pcs']);
const normalizeUnit = (unit, fallback = 'm') => {
  const value = String(unit || '').trim();
  return validMaterialCategoryUnits.has(value) ? value : fallback;
};
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRegex = (value) => {
  const normalized = String(value || '').trim().replace(/s$/i, '');
  return normalized ? new RegExp(`^${escapeRegex(normalized)}s?$`, 'i') : null;
};

function rawMaterialStockFilter({ materialName, category } = {}) {
  const names = [materialName, category].filter(Boolean);
  const clauses = [];
  names.forEach((name) => {
    const regex = nameRegex(name);
    if (regex) clauses.push({ materialName: regex }, { category: regex });
  });
  return clauses.length ? { $or: clauses } : {};
}

async function defaultWarehouse(kind) {
  const patterns = kind === 'FINISHED_GOOD'
    ? [/finished/i, /fg/i]
    : kind === 'RAW_MATERIAL'
      ? [/raw/i, /material/i]
      : [];

  for (const pattern of patterns) {
    const warehouse = await Warehouse.findOne({
      status: 'Active',
      $or: [{ type: pattern }, { name: pattern }, { code: pattern }]
    }).sort({ code: 1 });
    if (warehouse) return warehouse;
  }

  const activeWarehouse = await Warehouse.findOne({ status: 'Active' }).sort({ code: 1 });
  return activeWarehouse || Warehouse.findOne().sort({ code: 1 });
}

async function createMovement(payload, options = {}) {
  const movement = new StockMovement({
    quantityIn: 0,
    quantityOut: 0,
    balanceAfter: 0,
    unitCost: 0,
    totalValue: 0,
    ...payload
  });
  return movement.save(options.session ? { session: options.session } : undefined);
}

async function updateWarehouseCapacity(warehouseId, { stockIn = 0, stockOut = 0, valueIn = 0, valueOut = 0 } = {}, options = {}) {
  if (!warehouseId) return null;
  const warehouse = await Warehouse.findById(warehouseId).session(options.session || null);
  if (!warehouse) return null;

  warehouse.stockInUnits = Number(warehouse.stockInUnits || 0) + Number(stockIn || 0);
  warehouse.stockOutUnits = Number(warehouse.stockOutUnits || 0) + Number(stockOut || 0);
  warehouse.incomingStock = Number(warehouse.incomingStock || 0) + Number(stockIn || 0);
  warehouse.outgoingStock = Number(warehouse.outgoingStock || 0) + Number(stockOut || 0);
  warehouse.stockUnits = Math.max(Number(warehouse.stockUnits || 0) + Number(stockIn || 0) - Number(stockOut || 0), 0);
  warehouse.usedCapacity = warehouse.stockUnits;
  warehouse.availableStock = warehouse.stockUnits;
  warehouse.inventoryValue = Math.max(Number(warehouse.inventoryValue || warehouse.stockValue || 0) + Number(valueIn || 0) - Number(valueOut || 0), 0);
  warehouse.stockValue = warehouse.inventoryValue;
  await warehouse.save(options.session ? { session: options.session } : undefined);
  return warehouse;
}

async function receiveRawMaterialFromGRN(receipt) {
  if (!['Completed', 'Under QC'].includes(receipt.status)) return null;

  const warehouse = await defaultWarehouse('RAW_MATERIAL');
  const lines = receipt.items?.length ? receipt.items : [{
    materialName: receipt.category || 'Raw Material',
    category: receipt.category,
    receivedQuantity: Number(receipt.quantity || 0),
    acceptedQuantity: receipt.status === 'Completed' ? Number(receipt.quantity || 0) : 0,
    rejectedQuantity: receipt.status === 'Rejected' ? Number(receipt.quantity || 0) : 0,
    unit: receipt.unit,
    unitCost: receipt.quantity ? Number(receipt.receiptValue || 0) / Number(receipt.quantity || 1) : 0,
    totalValue: Number(receipt.receiptValue || 0),
    batchNo: `${receipt.grnNumber}-B1`
  }];

  const stocks = [];
  const acceptedTotal = lines.reduce((sum, line) => {
    const receivedQuantity = Number(line.receivedQuantity || line.acceptedQuantity || 0);
    const acceptedQuantity = Number(line.acceptedQuantity ?? (receipt.status === 'Completed' ? receivedQuantity : 0));
    return sum + acceptedQuantity;
  }, 0);
  const fallbackUnitCost = acceptedTotal ? Number(receipt.receiptValue || 0) / acceptedTotal : 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const receivedQuantity = Number(line.receivedQuantity || line.acceptedQuantity || 0);
    if (receivedQuantity <= 0) continue;

    const acceptedQuantity = Number(line.acceptedQuantity ?? (receipt.status === 'Completed' ? receivedQuantity : 0));
    const rejectedQuantity = Number(line.rejectedQuantity || 0);
    const unitCost = Number(line.unitCost || (acceptedQuantity ? Number(line.totalValue || 0) / acceptedQuantity : 0) || fallbackUnitCost);
    const materialName = line.materialName || line.category || receipt.category || 'Raw Material';
    const category = line.category || receipt.category;
    const batchNo = line.batchNo || `${receipt.grnNumber}-B${index + 1}`;

    const stock = await RawMaterialStock.findOneAndUpdate(
      {
        materialName,
        category,
        supplier: receipt.supplier || undefined,
        warehouse: warehouse?._id
      },
      {
        $setOnInsert: {
          materialName,
          category,
          supplier: receipt.supplier,
          supplierName: receipt.supplierName,
          warehouse: warehouse?._id,
          unit: normalizeUnit(line.unit || receipt.unit)
        },
        $inc: {
          availableQuantity: acceptedQuantity,
          rejectedQuantity,
          totalValue: acceptedQuantity * unitCost
        },
        $set: { unitCost }
      },
      { new: true, upsert: true }
    );

    stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
    await stock.save();

    const materialItem = await MaterialCategory.findOne({ name: { $in: [materialName, category].filter(Boolean) } });
    if (materialItem) {
      materialItem.totalMaterials = stock.availableQuantity;
      materialItem.unit = normalizeUnit(stock.unit || line.unit || receipt.unit, materialItem.unit);
      await materialItem.save();
    }

    await MaterialBatch.findOneAndUpdate(
      { batchNo },
      {
        batchNo,
        materialName,
        category,
        supplier: receipt.supplier,
        supplierName: receipt.supplierName,
        warehouse: warehouse?._id,
        grn: receipt._id,
        poNumber: receipt.poNumber,
        quantityReceived: receivedQuantity,
        acceptedQuantity,
        rejectedQuantity,
        availableQuantity: acceptedQuantity,
        unit: normalizeUnit(line.unit || receipt.unit),
        unitCost,
        totalValue: acceptedQuantity * unitCost,
        status: acceptedQuantity > 0 ? 'Available' : 'Rejected'
      },
      { new: true, upsert: true }
    );

    await createMovement({
      movementType: 'GRN_RECEIVED',
      itemType: 'RAW_MATERIAL',
      referenceType: 'GoodReceipt',
      referenceId: String(receipt._id),
      materialId: materialName,
      warehouseId: warehouse?._id,
      batchNo,
      quantityIn: acceptedQuantity,
      balanceAfter: stock.availableQuantity,
      unitCost,
      totalValue: acceptedQuantity * unitCost,
      remarks: `${receipt.grnNumber} received ${materialName} from ${receipt.supplierName || 'supplier'}`
    });

    stocks.push(stock);
  }

  return stocks;
}

async function receiveRawMaterialFromPO(po) {
  if (po.status !== 'Completed' || po.stockPosted) return [];

  const warehouse = await defaultWarehouse('RAW_MATERIAL');
  const lines = po.items?.length ? po.items : [{
    lineNo: 1,
    materialName: po.category || 'Raw Material',
    category: po.category,
    quantity: Number(po.orderedQuantity || 0),
    unit: po.unit || 'm',
    unitPrice: Number(po.orderedQuantity || 0) ? Number(po.totalAmount || 0) / Number(po.orderedQuantity || 1) : 0
  }];

  const stocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const quantity = Number(line.quantity || 0);
    if (quantity <= 0) continue;

    const unitCost = Number(line.unitPrice || (quantity ? Number(line.amount || 0) / quantity : 0));
    const materialName = line.materialName || line.category || po.category || 'Raw Material';
    const category = line.category || po.category;
    const batchNo = `${po.poNumber}-L${line.lineNo || index + 1}`;

    const stock = await RawMaterialStock.findOneAndUpdate(
      {
        materialName,
        category,
        supplier: po.supplier || undefined,
        warehouse: warehouse?._id
      },
      {
        $setOnInsert: {
          materialName,
          category,
          supplier: po.supplier,
          supplierName: po.supplierName,
          warehouse: warehouse?._id,
          unit: normalizeUnit(line.unit || po.unit)
        },
        $inc: {
          availableQuantity: quantity,
          totalValue: quantity * unitCost
        },
        $set: { unitCost }
      },
      { new: true, upsert: true }
    );

    stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
    await stock.save();

    const materialItem = await MaterialCategory.findOne({ name: { $in: [materialName, category].filter(Boolean) } });
    if (materialItem) {
      materialItem.totalMaterials = stock.availableQuantity;
      materialItem.unit = normalizeUnit(stock.unit || line.unit || po.unit, materialItem.unit);
      await materialItem.save();
    }

    await MaterialBatch.findOneAndUpdate(
      { batchNo },
      {
        batchNo,
        materialName,
        category,
        supplier: po.supplier,
        supplierName: po.supplierName,
        warehouse: warehouse?._id,
        poNumber: po.poNumber,
        quantityReceived: quantity,
        acceptedQuantity: quantity,
        rejectedQuantity: 0,
        availableQuantity: quantity,
        unit: normalizeUnit(line.unit || po.unit),
        unitCost,
        totalValue: quantity * unitCost,
        status: 'Available'
      },
      { new: true, upsert: true }
    );

    await createMovement({
      movementType: 'PO_COMPLETED',
      itemType: 'RAW_MATERIAL',
      referenceType: 'PurchaseOrder',
      referenceId: String(po._id),
      materialId: materialName,
      warehouseId: warehouse?._id,
      batchNo,
      quantityIn: quantity,
      balanceAfter: stock.availableQuantity,
      unitCost,
      totalValue: quantity * unitCost,
      remarks: `${po.poNumber} completed ${materialName} from ${po.supplierName || 'supplier'}`
    });

    stocks.push(stock);
  }

  po.stockPosted = true;
  return stocks;
}

async function reserveRawMaterial({ materialName, category, quantity, referenceType, referenceId, remarks }) {
  let remaining = Number(quantity || 0);
  const stocks = await RawMaterialStock.find(rawMaterialStockFilter({ materialName, category })).sort({ availableQuantity: -1 });
  const available = stocks.reduce((total, stock) => total + Number(stock.availableQuantity || 0), 0);
  if (available < remaining) {
    const label = materialName || category || 'raw material';
    throw new Error(`Insufficient raw material stock for ${label}. Required ${quantity}, available ${available}.`);
  }

  const reservedStocks = [];
  for (const stock of stocks) {
    if (remaining <= 0) break;
    const reserveQty = Math.min(Number(stock.availableQuantity || 0), remaining);
    if (reserveQty <= 0) continue;

    stock.availableQuantity -= reserveQty;
    stock.reservedQuantity += reserveQty;
    stock.totalValue = Math.max(Number(stock.totalValue || 0) - (reserveQty * Number(stock.unitCost || 0)), 0);
    stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
    await stock.save();
    reservedStocks.push(stock);
    remaining -= reserveQty;

    await createMovement({
      movementType: 'MATERIAL_RESERVED',
      itemType: 'RAW_MATERIAL',
      referenceType,
      referenceId,
      materialId: materialName || category,
      warehouseId: stock.warehouse,
      locationId: stock.location,
      quantityOut: reserveQty,
      balanceAfter: stock.availableQuantity,
      unitCost: stock.unitCost,
      totalValue: reserveQty * stock.unitCost,
      remarks
    });
  }

  const names = [materialName, category].filter(Boolean);
  const materialItem = await MaterialCategory.findOne(names.length ? { $or: names.map((name) => ({ name: nameRegex(name) })) } : {});
  if (materialItem) {
    const categoryStocks = await RawMaterialStock.find(rawMaterialStockFilter({ materialName: materialItem.name, category: materialItem.name }));
    materialItem.totalMaterials = categoryStocks.reduce((total, stock) => total + Number(stock.availableQuantity || 0), 0);
    materialItem.unit = reservedStocks[0]?.unit || materialItem.unit;
    await materialItem.save();
  } else {
    const categoryRow = await ProductCategory.findOne(names.length ? { $or: names.map((name) => ({ name: nameRegex(name) })) } : {});
    if (categoryRow) {
      const categoryStocks = await RawMaterialStock.find(rawMaterialStockFilter({ materialName: categoryRow.name, category: categoryRow.name }));
      categoryRow.products = categoryStocks.reduce((total, stock) => total + Number(stock.availableQuantity || 0), 0);
      await categoryRow.save();
    }
  }

  return reservedStocks;
}

async function postFinishedGoods({ product, variant, productName, sku, barcode, size, color, quantity, warehouse, unitCost = 0, sellingPrice = 0, referenceType, referenceId, remarks }) {
  const defaultWh = warehouse ? null : await defaultWarehouse('FINISHED_GOOD');
  const warehouseId = warehouse || defaultWh?._id;

  const skuDoc = await SKU.findOneAndUpdate(
    { sku },
    { product, variant, sku, barcode: barcode || sku, productName, size, color, status: 'Active' },
    { new: true, upsert: true }
  );

  const update = {
    $setOnInsert: { product, variant, productName, sku, barcode: skuDoc.barcode, size, color, warehouse: warehouseId },
    $inc: { availableQuantity: quantity, totalQuantity: quantity }
  };
  if (Number(unitCost || 0) > 0) update.$set = { ...(update.$set || {}), unitCost };
  if (Number(sellingPrice || 0) > 0) update.$set = { ...(update.$set || {}), sellingPrice };

  const stock = await FinishedGoodsStock.findOneAndUpdate(
    { sku, warehouse: warehouseId },
    update,
    { new: true, upsert: true }
  );

  stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
  await stock.save();

  await BarcodeLabel.create({ sku, barcode: skuDoc.barcode, productName, quantity, referenceType, referenceId });
  await createMovement({
    movementType: 'FINISHED_GOODS_IN',
    itemType: 'FINISHED_GOOD',
    referenceType,
    referenceId,
    productId: product,
    variantId: variant,
    sku,
    warehouseId,
    quantityIn: quantity,
    balanceAfter: stock.availableQuantity,
    unitCost,
    totalValue: quantity * Number(unitCost || 0),
    remarks
  });

  return stock;
}

module.exports = {
  createMovement,
  updateWarehouseCapacity,
  receiveRawMaterialFromGRN,
  receiveRawMaterialFromPO,
  reserveRawMaterial,
  postFinishedGoods,
  statusFor,
  rawMaterialStockFilter
};
