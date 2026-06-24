const mongoose = require('mongoose');

const warehouseLocationSchema = new mongoose.Schema({
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  warehouseCode: String,
  name: { type: String, required: true },
  code: { type: String, required: true },
  type: { type: String, default: 'Rack' },
  capacity: { type: Number, default: 0 },
  usedCapacity: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Inactive', 'Full'], default: 'Active' }
}, { timestamps: true });

warehouseLocationSchema.index({ warehouse: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('WarehouseLocation', warehouseLocationSchema);
