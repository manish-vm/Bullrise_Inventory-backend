const mongoose = require('mongoose');

const materialRequirementSchema = new mongoose.Schema({
  materialName: String,
  category: String,
  requiredQuantity: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  consumedQuantity: { type: Number, default: 0 },
  unit: { type: String, default: 'm' }
}, { _id: false });

const manufacturingWorkOrderSchema = new mongoose.Schema({
  woNumber: { type: String, required: true, unique: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
  productStyle: String,
  department: String,
  priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  plannedQty: { type: Number, default: 0 },
  completedQty: { type: Number, default: 0 },
  status: { type: String, enum: ['Draft', 'Approved', 'Completed', 'In Progress', 'Pending', 'Overdue'], default: 'Pending' },
  startDate: Date,
  endDate: Date,
  dueDate: Date,
  producedQty: { type: Number, default: 0 },
  rejectedQty: { type: Number, default: 0 },
  reservedQty: { type: Number, default: 0 },
  consumedQty: { type: Number, default: 0 },
  requiredMaterials: [materialRequirementSchema],
  cycleDays: { type: Number, default: 0 },
  trendDate: Date
}, { timestamps: true });

module.exports = mongoose.model('ManufacturingWorkOrder', manufacturingWorkOrderSchema);
