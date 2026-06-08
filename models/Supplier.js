const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  supplierCode: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  initials: String,
  contactPerson: { type: String, required: true },
  designation: { type: String, default: 'Manager' },
  category: { type: String, required: true },
  city: { type: String, default: 'Chennai' },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  ordersCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Supplier', supplierSchema);
