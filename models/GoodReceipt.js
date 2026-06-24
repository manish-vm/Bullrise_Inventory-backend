const mongoose = require('mongoose');

const goodReceiptItemSchema = new mongoose.Schema({
  poLineNo: Number,
  materialName: String,
  category: String,
  orderedQuantity: { type: Number, default: 0 },
  receivedQuantity: { type: Number, default: 0 },
  acceptedQuantity: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  unit: { type: String, default: 'm' },
  unitCost: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
  batchNo: String,
  remarks: String
}, { _id: false });

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
  items: [goodReceiptItemSchema],
  stockPosted: { type: Boolean, default: false },
  approvedBy: String,
  approvedAt: Date,
  approvalRemarks: String,
  status: { type: String, enum: ['Completed', 'Under QC', 'Pending', 'Rejected'], default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model('GoodReceipt', goodReceiptSchema);
