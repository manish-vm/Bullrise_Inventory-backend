const mongoose = require('mongoose');

const productCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, required: true },
  department: { type: String, required: true },
  products: { type: Number, default: 0 },
  variants: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  createdOn: { type: Date, required: true },
  color: { type: String, default: 'green' }
}, { timestamps: true });

module.exports = mongoose.model('ProductCategory', productCategorySchema);
