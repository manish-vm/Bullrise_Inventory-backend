const mongoose = require('mongoose');

const productionDamageSchema = new mongoose.Schema({
  damageNo: { type: String, required: true, unique: true },
  workOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'ManufacturingWorkOrder' },
  jobCard: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCard' },
  woNumber: String,
  jobCardNumber: String,
  productStyle: String,
  stageName: String,
  quantity: { type: Number, default: 0 },
  reason: String,
  decision: { type: String, enum: ['Damage', 'Scrap', 'Repair'], default: 'Damage' },
  status: { type: String, enum: ['Recorded', 'Reviewed', 'Scrapped', 'Repair Queue'], default: 'Recorded' },
  recordedBy: String
}, { timestamps: true });

module.exports = mongoose.model('ProductionDamage', productionDamageSchema);
