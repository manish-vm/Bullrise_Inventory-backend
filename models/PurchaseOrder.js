const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema({
  lineNo: Number,
  materialName: String,
  category: String,
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: 'm' },
  unitPrice: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  receivedQuantity: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  balanceQuantity: { type: Number, default: 0 },
  status: { type: String, enum: ['Open', 'Partially Received', 'Completed', 'Rejected'], default: 'Open' }
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: { type: String, required: true, unique: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: String,
  category: String,
  orderDate: Date,
  expectedDate: Date,
  totalAmount: { type: Number, default: 0 },
  orderedQuantity: { type: Number, default: 0 },
  unit: { type: String, enum: ['m', 'pcs'], default: 'm' },
  receivedQuantity: { type: Number, default: 0 },
  status: { type: String, enum: ['Open', 'Partially Received', 'Completed', 'Cancelled'], default: 'Open' },
  items: [purchaseOrderItemSchema]
}, { timestamps: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
