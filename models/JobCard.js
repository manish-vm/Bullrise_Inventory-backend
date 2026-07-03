const mongoose = require('mongoose');

const jobCardSchema = new mongoose.Schema({
  jobCardNumber: { type: String, required: true, unique: true },
  workOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'ManufacturingWorkOrder' },
  woNumber: String,
  productStyle: String,
  stageName: { type: String, enum: ['Cutting', 'Stitching', 'Finishing', 'QC', 'Packing'], default: 'Cutting' },
  department: String,
  assignedTo: String,
  inputQuantity: { type: Number, default: 0 },
  completedQuantity: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  reworkQuantity: { type: Number, default: 0 },
  pendingQuantity: { type: Number, default: 0 },
  startTime: Date,
  endTime: Date,
  remarks: String,
  startDate: Date,
  dueDate: Date,
  priority: { type: String, enum: ['High', 'Medium', 'Low', 'None'], default: 'None' },
  status: { type: String, enum: ['Completed', 'In Progress', 'Pending', 'Overdue'], default: 'Pending' },
  progress: { type: Number, default: 0 },
  unitStageCost: { type: Number, default: 0 },
  stageCost: { type: Number, default: 0 },
  postedToStock: { type: Boolean, default: false },
  trendDate: Date
}, { timestamps: true });

module.exports = mongoose.model('JobCard', jobCardSchema);
