const mongoose = require('mongoose');

const materialCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, required: true },
  totalMaterials: { type: Number, default: 0 },
  lowStockItems: { type: Number, default: 0 },
  icon: { type: String, default: 'box' },
  color: { type: String, default: 'orange' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('MaterialCategory', materialCategorySchema);
