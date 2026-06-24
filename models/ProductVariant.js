const mongoose = require('mongoose');

const productVariantSchema = new mongoose.Schema({
  variantId: { type: String, required: true, unique: true, trim: true },
  product: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  attributes: { type: String, required: true },
  sku: { type: String, required: true, unique: true, trim: true },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  createdOn: { type: Date, default: Date.now },
  color: { type: String, default: 'black' }
}, { timestamps: true });

module.exports = mongoose.model('ProductVariant', productVariantSchema);
