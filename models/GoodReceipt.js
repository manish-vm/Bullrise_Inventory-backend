const mongoose = require('mongoose');

const goodReceiptSchema = new mongoose.Schema({
  grnNumber: { type: String, required: true, unique: true },
  poNumber: String,
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: String,
  category: String,
  receiptDate: Date,
  itemsCount: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: 'm' },
  receivedBy: String,
  receiptValue: { type: Number, default: 0 },
  status: { type: String, enum: ['Completed', 'Under QC', 'Pending', 'Rejected'], default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model('GoodReceipt', goodReceiptSchema);
