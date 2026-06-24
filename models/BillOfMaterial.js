const mongoose = require('mongoose');

const bomMaterialSchema = new mongoose.Schema({
  lineNo: Number,
  materialName: { type: String, required: true },
  category: String,
  unit: { type: String, default: 'm' },
  quantityPerUnit: { type: Number, default: 0 },
  wastagePercent: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  requiredForQty: { type: Number, default: 1 },
  totalRequired: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  notes: String
}, { _id: false });

const billOfMaterialSchema = new mongoose.Schema({
  bomNo: { type: String, required: true, unique: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
  productName: { type: String, required: true },
  productSku: String,
  variantSku: String,
  styleCode: String,
  category: String,
  department: String,
  baseQuantity: { type: Number, default: 1 },
  materials: [bomMaterialSchema],
  materialCost: { type: Number, default: 0 },
  wastageCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
  status: { type: String, enum: ['Draft', 'Active', 'Inactive'], default: 'Draft' },
  approvedBy: String,
  approvedAt: Date,
  remarks: String
}, { timestamps: true });

billOfMaterialSchema.index({ productName: 1, variantSku: 1, status: 1 });

module.exports = mongoose.model('BillOfMaterial', billOfMaterialSchema);
