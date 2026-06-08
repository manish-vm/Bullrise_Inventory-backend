const mongoose = require('mongoose');

const productionPlanSchema = new mongoose.Schema({
  woNumber: { type: String, required: true, unique: true },
  productStyle: String,
  department: String,
  plannedQty: { type: Number, default: 0 },
  startDate: Date,
  endDate: Date,
  priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  status: { type: String, enum: ['Completed', 'In Progress', 'Pending', 'Overdue'], default: 'Pending' },
  completedQty: { type: Number, default: 0 },
  producedQty: { type: Number, default: 0 },
  rejectedQty: { type: Number, default: 0 },
  cycleDays: { type: Number, default: 0 },
  trendDate: Date
}, { timestamps: true });

module.exports = mongoose.model('ProductionPlan', productionPlanSchema);
