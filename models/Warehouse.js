const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  location: String,
  type: String,
  totalCapacity: { type: Number, default: 0 },
  usedCapacity: { type: Number, default: 0 },
  stockUnits: { type: Number, default: 0 },
  stockValue: { type: Number, default: 0 },
  stockInUnits: { type: Number, default: 0 },
  stockOutUnits: { type: Number, default: 0 },
  reservedStock: { type: Number, default: 0 },
  availableStock: { type: Number, default: 0 },
  incomingStock: { type: Number, default: 0 },
  outgoingStock: { type: Number, default: 0 },
  inventoryValue: { type: Number, default: 0 },
  color: { type: String, default: '#2f80ed' },
  status: { type: String, enum: ['Active', 'Inactive', 'Maintenance'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('Warehouse', warehouseSchema);
