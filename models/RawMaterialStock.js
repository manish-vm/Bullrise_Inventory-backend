const mongoose = require('mongoose');

const rawMaterialStockSchema = new mongoose.Schema({
  materialName: { type: String, required: true },
  category: String,
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: String,
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation' },
  unit: { type: String, default: 'm' },
  availableQuantity: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  consumedQuantity: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 100 },
  status: { type: String, enum: ['In Stock', 'Low Stock', 'Out of Stock'], default: 'In Stock' }
}, { timestamps: true });

rawMaterialStockSchema.index({ materialName: 1, category: 1, warehouse: 1, location: 1 });

module.exports = mongoose.model('RawMaterialStock', rawMaterialStockSchema);
