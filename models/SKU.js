const mongoose = require('mongoose');

const skuSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
  sku: { type: String, required: true, unique: true },
  barcode: { type: String, required: true, unique: true },
  productName: String,
  size: String,
  color: String,
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('SKU', skuSchema);
