const mongoose = require('mongoose');

const materialRequestItemSchema = new mongoose.Schema({
  materialName: String,
  category: String,
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  sku: String,
  requiredQuantity: { type: Number, default: 0 },
  issuedQuantity: { type: Number, default: 0 },
  remainingQuantity: { type: Number, default: 0 },
  unit: { type: String, default: 'm' },
  unitCost: { type: Number, default: 0 },
  issueStatus: { type: String, enum: ['Pending', 'Partially Issued', 'Issued', 'Rejected'], default: 'Pending' }
}, { _id: false });

const materialIssueSchema = new mongoose.Schema({
  minNumber: String,
  issuedBy: String,
  issuedAt: Date,
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  items: [{
    materialName: String,
    requestedQuantity: Number,
    issuedQuantity: Number,
    unit: String,
    batches: [{
      batchNo: String,
      quantity: Number,
      unitCost: Number
    }]
  }],
  totalValue: { type: Number, default: 0 },
  remarks: String
}, { _id: false });

const materialRequestSchema = new mongoose.Schema({
  mrnNumber: { type: String, required: true, unique: true },
  department: { type: String, required: true },
  requestedBy: { type: String, required: true },
  purpose: String,
  priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
  status: { type: String, enum: ['Pending', 'Approved', 'Issued', 'Partially Issued', 'Rejected'], default: 'Pending' },
  approvedBy: String,
  approvedAt: Date,
  rejectedBy: String,
  rejectedAt: Date,
  rejectionReason: String,
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  items: [materialRequestItemSchema],
  issues: [materialIssueSchema],
  requestedQuantity: { type: Number, default: 0 },
  issuedQuantity: { type: Number, default: 0 },
  remainingQuantity: { type: Number, default: 0 },
  totalIssuedValue: { type: Number, default: 0 },
  audit: [{
    action: String,
    by: String,
    at: { type: Date, default: Date.now },
    remarks: String
  }]
}, { timestamps: true });

materialRequestSchema.index({ status: 1, priority: 1, createdAt: -1 });
materialRequestSchema.index({ department: 1, createdAt: -1 });

module.exports = mongoose.model('MaterialRequest', materialRequestSchema);
