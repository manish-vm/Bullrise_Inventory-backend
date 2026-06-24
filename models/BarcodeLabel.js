const mongoose = require('mongoose');

const barcodeLabelSchema = new mongoose.Schema({
  sku: { type: String, required: true },
  barcode: { type: String, required: true },
  productName: String,
  quantity: { type: Number, default: 1 },
  labelStatus: { type: String, enum: ['Pending Print', 'Printed'], default: 'Pending Print' },
  referenceType: String,
  referenceId: String
}, { timestamps: true });

module.exports = mongoose.model('BarcodeLabel', barcodeLabelSchema);
