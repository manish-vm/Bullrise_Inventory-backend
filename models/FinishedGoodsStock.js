const mongoose = require('mongoose');

const finishedGoodsStockSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
  productName: String,
  sku: { type: String, required: true },
  barcode: String,
  size: String,
  color: String,
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation' },
  availableQuantity: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  damagedQuantity: { type: Number, default: 0 },
  returnedQuantity: { type: Number, default: 0 },
  totalQuantity: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 25 },
  status: { type: String, enum: ['In Stock', 'Low Stock', 'Out of Stock'], default: 'In Stock' }
}, { timestamps: true });

finishedGoodsStockSchema.index({ sku: 1, warehouse: 1, location: 1 });

module.exports = mongoose.model('FinishedGoodsStock', finishedGoodsStockSchema);
