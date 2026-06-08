const mongoose = require('mongoose');

const jobCardSchema = new mongoose.Schema({
  jobCardNumber: { type: String, required: true, unique: true },
  woNumber: String,
  productStyle: String,
  department: String,
  assignedTo: String,
  startDate: Date,
  dueDate: Date,
  priority: { type: String, enum: ['High', 'Medium', 'Low', 'None'], default: 'None' },
  status: { type: String, enum: ['Completed', 'In Progress', 'Pending', 'Overdue'], default: 'Pending' },
  progress: { type: Number, default: 0 },
  trendDate: Date
}, { timestamps: true });

module.exports = mongoose.model('JobCard', jobCardSchema);
