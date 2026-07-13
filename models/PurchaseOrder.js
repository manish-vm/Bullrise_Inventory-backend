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
  quotationNumber: String,
  quotationDate: Date,
  purchaseType: { type: String, enum: ['Raw Material Purchase', 'Ready Product Purchase', 'E-Commerce Purchase'], default: 'Raw Material Purchase' },
  paymentMode: { type: String, enum: ['Cash', 'Credit'], default: 'Credit' },
  creditDays: { type: Number, enum: [0, 30, 60], default: 30 },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: String,
  category: String,
  orderDate: Date,
  expectedDate: Date,
  totalAmount: { type: Number, default: 0 },
  orderedQuantity: { type: Number, default: 0 },
  unit: { type: String, enum: ['m', 'pcs'], default: 'm' },
  receivedQuantity: { type: Number, default: 0 },
  status: { type: String, enum: ['Draft', 'Sent', 'Open', 'Partially Received', 'Completed', 'Cancelled'], default: 'Open' },
  items: [purchaseOrderItemSchema]
}, { timestamps: true });

purchaseOrderSchema.pre('validate', function calculatePoBalances() {
  this.items = (this.items || []).map((item) => {
    const ordered = Number(item.quantity || 0);
    const received = Number(item.receivedQuantity || 0);
    const rejected = Number(item.rejectedQuantity || 0);
    item.unitPrice = Number(item.unitPrice || 0);
    item.balanceQuantity = Math.max(ordered - received - rejected, 0);
    item.amount = ordered * item.unitPrice;
    item.status = item.balanceQuantity === 0 && ordered > 0 ? 'Completed' : received > 0 || rejected > 0 ? 'Partially Received' : item.status || 'Open';
    return item;
  });
  this.orderedQuantity = this.items.reduce((total, item) => total + Number(item.quantity || 0), Number(this.orderedQuantity || 0) && this.items.length ? 0 : Number(this.orderedQuantity || 0));
  this.receivedQuantity = this.items.reduce((total, item) => total + Number(item.receivedQuantity || 0), Number(this.receivedQuantity || 0) && this.items.length ? 0 : Number(this.receivedQuantity || 0));
  if (this.items.length) {
    this.category = this.items[0].category || this.items[0].materialName || this.category;
    this.unit = this.items[0].unit || this.unit;
    this.totalAmount = this.items.reduce((total, item) => total + Number(item.amount || 0), 0);
  }
  if (this.status !== 'Cancelled' && this.items.length) {
    if (this.receivedQuantity <= 0) this.status = this.status === 'Draft' || this.status === 'Sent' ? this.status : 'Open';
    else if (this.receivedQuantity < this.orderedQuantity) this.status = 'Partially Received';
    else this.status = 'Completed';
  }
});

purchaseOrderSchema.index({ status: 1, expectedDate: 1 });
purchaseOrderSchema.index({ supplier: 1, createdAt: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
