const mongoose = require('mongoose');

const manufacturingWorkOrderSchema = new mongoose.Schema({
  woNumber: { type: String, required: true, unique: true },
  productStyle: String,
  department: String,
  plannedQty: { type: Number, default: 0 },
  completedQty: { type: Number, default: 0 },
  status: { type: String, enum: ['Completed', 'In Progress', 'Pending', 'Overdue'], default: 'Pending' },
  dueDate: Date,
  producedQty: { type: Number, default: 0 },
  rejectedQty: { type: Number, default: 0 },
  cycleDays: { type: Number, default: 0 },
  trendDate: Date
}, { timestamps: true });

module.exports = mongoose.model('ManufacturingWorkOrder', manufacturingWorkOrderSchema);
