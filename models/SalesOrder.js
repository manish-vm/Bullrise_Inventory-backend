const mongoose = require('mongoose');

const salesOrderItemSchema = new mongoose.Schema({
  sku: { type: String, required: true },
  productName: String,
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: false });

const salesOrderSchema = new mongoose.Schema({
  orderNo: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerPhone: String,
  source: { type: String, enum: ['POS', 'ONLINE'], default: 'POS' },
  items: [salesOrderItemSchema],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'], default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model('SalesOrder', salesOrderSchema);
