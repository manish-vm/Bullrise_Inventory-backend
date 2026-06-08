const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema({
  materialName: String,
  category: String,
  quantity: Number,
  unitPrice: Number,
  amount: Number
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: { type: String, required: true, unique: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: String,
  category: String,
  orderDate: Date,
  expectedDate: Date,
  totalAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['Open', 'Partially Received', 'Completed', 'Cancelled'], default: 'Open' },
  items: [purchaseOrderItemSchema]
}, { timestamps: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
