const mongoose = require('mongoose');

const stockReturnSchema = new mongoose.Schema({
  returnNumber: { type: String, required: true, unique: true },
  poNumber: String,
  grnNumber: String,
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: String,
  category: String,
  returnDate: Date,
  itemsCount: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: 'm' },
  returnValue: { type: Number, default: 0 },
  reason: { type: String, required: true },
  status: { type: String, enum: ['Approved', 'Pending', 'Rejected', 'Draft'], default: 'Draft' }
}, { timestamps: true });

module.exports = mongoose.model('StockReturn', stockReturnSchema);
