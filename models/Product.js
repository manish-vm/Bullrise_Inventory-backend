const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true },
  collectionName: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  baseUnit: { type: String, default: 'Pcs' },
  productCount: { type: Number, default: 1 },
  variants: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  createdOn: { type: Date, default: Date.now },
  color: { type: String, default: 'green' }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
