const mongoose = require('mongoose');

const productAttributeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  type: { type: String, required: true },
  inputType: { type: String, required: true },
  values: { type: String, default: '-' },
  extraValues: { type: Number, default: 0 },
  usedInVariants: { type: Number, default: 0 },
  systemAttribute: { type: Boolean, default: false },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  createdOn: { type: Date, default: Date.now },
  color: { type: String, default: 'blue' }
}, { timestamps: true });

module.exports = mongoose.model('ProductAttribute', productAttributeSchema);
