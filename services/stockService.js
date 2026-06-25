const Warehouse = require('../models/Warehouse');
const RawMaterialStock = require('../models/RawMaterialStock');
const MaterialBatch = require('../models/MaterialBatch');
const StockMovement = require('../models/StockMovement');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const SKU = require('../models/SKU');
const BarcodeLabel = require('../models/BarcodeLabel');

const statusFor = (available, reorderLevel) => {
  if (available <= 0) return 'Out of Stock';
  if (available <= reorderLevel) return 'Low Stock';
  return 'In Stock';
};

async function defaultWarehouse() {
  return Warehouse.findOne().sort({ code: 1 });
}

async function createMovement(payload) {
  return StockMovement.create({
    quantityIn: 0,
    quantityOut: 0,
    balanceAfter: 0,
    unitCost: 0,
    totalValue: 0,
    ...payload
  });
}

async function receiveRawMaterialFromGRN(receipt) {
  if (!['Completed', 'Under QC'].includes(receipt.status)) return null;

  const warehouse = await defaultWarehouse();
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
          unit: line.unit || receipt.unit
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
        unit: line.unit || receipt.unit,
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

async function reserveRawMaterial({ materialName, category, quantity, referenceType, referenceId, remarks }) {
  const stock = await RawMaterialStock.findOne({ materialName, category }).sort({ availableQuantity: -1 });
  if (!stock || stock.availableQuantity < quantity) {
    throw new Error(`Insufficient raw material stock for ${materialName}`);
  }

  stock.availableQuantity -= quantity;
  stock.reservedQuantity += quantity;
  stock.status = statusFor(stock.availableQuantity, stock.reorderLevel);
  await stock.save();

  await createMovement({
    movementType: 'MATERIAL_RESERVED',
    itemType: 'RAW_MATERIAL',
    referenceType,
    referenceId,
    materialId: materialName,
    warehouseId: stock.warehouse,
    quantityOut: quantity,
    balanceAfter: stock.availableQuantity,
    unitCost: stock.unitCost,
    totalValue: quantity * stock.unitCost,
    remarks
  });

  return stock;
}

async function postFinishedGoods({ product, variant, productName, sku, barcode, size, color, quantity, warehouse, referenceType, referenceId, remarks }) {
  const defaultWh = warehouse ? null : await defaultWarehouse();
  const warehouseId = warehouse || defaultWh?._id;

  const skuDoc = await SKU.findOneAndUpdate(
    { sku },
    { product, variant, sku, barcode: barcode || sku, productName, size, color, status: 'Active' },
    { new: true, upsert: true }
  );

  const stock = await FinishedGoodsStock.findOneAndUpdate(
    { sku, warehouse: warehouseId },
    {
      $setOnInsert: { product, variant, productName, sku, barcode: skuDoc.barcode, size, color, warehouse: warehouseId },
      $inc: { availableQuantity: quantity, totalQuantity: quantity }
    },
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
    remarks
  });

  return stock;
}

module.exports = {
  createMovement,
  receiveRawMaterialFromGRN,
  reserveRawMaterial,
  postFinishedGoods,
  statusFor
};
