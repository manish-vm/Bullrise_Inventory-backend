const mongoose = require('mongoose');

const serialInventorySchema = new mongoose.Schema({
  serialNumber: { type: String, required: true, unique: true },
  sku: String,
  productName: String,
  batchNo: String,
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  currentOwner: String,
  purchaseDate: Date,
  status: { type: String, enum: ['In Stock', 'Issued', 'Returned', 'Scrapped', 'Lost'], default: 'In Stock' },
  movementHistory: [{
    type: String,
    referenceType: String,
    referenceId: String,
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    owner: String,
    at: { type: Date, default: Date.now },
    remarks: String
  }]
}, { timestamps: true });

serialInventorySchema.index({ sku: 1, status: 1 });
serialInventorySchema.index({ batchNo: 1 });

module.exports = mongoose.model('SerialInventory', serialInventorySchema);
