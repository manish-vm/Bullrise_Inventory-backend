const mongoose = require('mongoose');

const qcInspectionSchema = new mongoose.Schema({
  inspectionId: { type: String, required: true, unique: true },
  woNumber: String,
  productStyle: String,
  department: String,
  inspectionType: String,
  inspectedQty: { type: Number, default: 0 },
  passedQty: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  reworkQuantity: { type: Number, default: 0 },
  defects: { type: Number, default: 0 },
  defectType: String,
  defectNotes: String,
  sku: String,
  size: String,
  color: String,
  postedToStock: { type: Boolean, default: false },
  status: { type: String, enum: ['Passed', 'Minor Defect', 'Major Defect', 'Pending'], default: 'Pending' },
  inspectionDate: Date
}, { timestamps: true });

module.exports = mongoose.model('QCInspection', qcInspectionSchema);
