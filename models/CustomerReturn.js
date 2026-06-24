const mongoose = require('mongoose');

const customerReturnSchema = new mongoose.Schema({
  returnNo: { type: String, required: true, unique: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  orderNo: String,
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  reason: String,
  condition: { type: String, enum: ['Good', 'Damaged', 'Repairable', 'Scrap'], default: 'Good' },
  decision: { type: String, enum: ['Restock', 'Damage', 'Repair', 'Scrap'], default: 'Restock' },
  status: { type: String, enum: ['Pending QC', 'Processed', 'Rejected'], default: 'Pending QC' },
  remarks: String
}, { timestamps: true });

module.exports = mongoose.model('CustomerReturn', customerReturnSchema);
