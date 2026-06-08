const mongoose = require('mongoose');

const productionTrackingSchema = new mongoose.Schema({
  jobCardNumber: { type: String, required: true, unique: true },
  woNumber: String,
  productStyle: String,
  department: String,
  targetQty: { type: Number, default: 0 },
  producedQty: { type: Number, default: 0 },
  status: { type: String, enum: ['Completed', 'In Progress', 'Pending', 'Overdue'], default: 'Pending' },
  lastUpdated: Date
}, { timestamps: true });

module.exports = mongoose.model('ProductionTracking', productionTrackingSchema);
