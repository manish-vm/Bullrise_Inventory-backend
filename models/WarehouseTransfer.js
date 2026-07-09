const mongoose = require('mongoose');

const warehouseTransferSchema = new mongoose.Schema({
  transferNumber: { type: String, required: true, unique: true },
  itemType: { type: String, enum: ['RAW_MATERIAL', 'FINISHED_GOOD'], default: 'RAW_MATERIAL' },
  productName: String,
  materialName: String,
  sku: String,
  batchNo: String,
  serialNumbers: [String],
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'm' },
  fromWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  toWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  requestedBy: String,
  approvedBy: String,
  vehicle: String,
  transferDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['Pending', 'Transit', 'Received', 'Cancelled'], default: 'Pending' },
  sentAt: Date,
  receivedAt: Date,
  remarks: String,
  audit: [{
    action: String,
    by: String,
    at: { type: Date, default: Date.now },
    remarks: String
  }]
}, { timestamps: true });

warehouseTransferSchema.index({ status: 1, transferDate: -1 });
warehouseTransferSchema.index({ fromWarehouse: 1, toWarehouse: 1 });

module.exports = mongoose.model('WarehouseTransfer', warehouseTransferSchema);
