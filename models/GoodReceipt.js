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
  goodsReceivedDate: Date,
  itemsCount: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: 'm' },
  receivedBy: String,
  qcInspector: String,
  receiptValue: { type: Number, default: 0 },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  invoiceNumber: String,
  vehicleNumber: String,
  batchNumber: String,
  inspectionStatus: { type: String, enum: ['Pending', 'Accepted', 'Rejected', 'Partial'], default: 'Pending' },
  items: [goodReceiptItemSchema],
  stockPosted: { type: Boolean, default: false },
  transferStatus: { type: String, enum: ['Not Transferred', 'Ready To Transfer', 'Transferred'], default: 'Not Transferred' },
  transferredAt: Date,
  transferredBy: String,
  approvedBy: String,
  approvedAt: Date,
  approvalRemarks: String,
  status: { type: String, enum: ['Completed', 'Under QC', 'Pending', 'Rejected'], default: 'Pending' }
}, { timestamps: true });

goodReceiptSchema.index({ supplier: 1, receiptDate: -1 });
goodReceiptSchema.index({ poNumber: 1, status: 1 });

module.exports = mongoose.model('GoodReceipt', goodReceiptSchema);
