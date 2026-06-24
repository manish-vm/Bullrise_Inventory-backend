const mongoose = require('mongoose');

const materialBatchSchema = new mongoose.Schema({
  batchNo: { type: String, required: true, unique: true },
  materialName: { type: String, required: true },
  category: String,
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: String,
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation' },
  grn: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodReceipt' },
  poNumber: String,
  quantityReceived: { type: Number, default: 0 },
  acceptedQuantity: { type: Number, default: 0 },
  rejectedQuantity: { type: Number, default: 0 },
  availableQuantity: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  consumedQuantity: { type: Number, default: 0 },
  unit: { type: String, default: 'm' },
  unitCost: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
  status: { type: String, enum: ['Available', 'Reserved', 'Consumed', 'Rejected'], default: 'Available' }
}, { timestamps: true });

module.exports = mongoose.model('MaterialBatch', materialBatchSchema);
