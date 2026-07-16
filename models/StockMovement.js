const mongoose = require('mongoose');

const movementTypes = [
  'GRN_RECEIVED',
  'PO_COMPLETED',
  'SUPPLIER_RETURN',
  'MATERIAL_RESERVED',
  'MATERIAL_CONSUMED',
  'PRODUCTION_OUTPUT',
  'QC_PASSED',
  'QC_REJECTED',
  'REWORK',
  'FINISHED_GOODS_IN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'SALE',
  'SALES_RETURN',
  'DAMAGE',
  'ADJUSTMENT'
];

const stockMovementSchema = new mongoose.Schema({
  movementType: { type: String, enum: movementTypes, required: true },
  itemType: { type: String, enum: ['RAW_MATERIAL', 'FINISHED_GOOD'], required: true },
  referenceType: String,
  referenceId: String,
  materialId: String,
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
  sku: String,
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation' },
  batchNo: String,
  quantityIn: { type: Number, default: 0 },
  quantityOut: { type: Number, default: 0 },
  balanceAfter: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
  remarks: String,
  createdBy: { type: String, default: 'System' }
}, { timestamps: true });

stockMovementSchema.index({ itemType: 1, movementType: 1, createdAt: -1 });
stockMovementSchema.index({ sku: 1, batchNo: 1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
