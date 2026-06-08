const mongoose = require('mongoose');

const productionSchema = new mongoose.Schema({
  productionId: { type: String, required: true, unique: true },
  woNumber: { type: String, required: true },
  productStyle: String,
  department: String,
  lineMachine: String,
  targetQty: { type: Number, default: 0 },
  producedQty: { type: Number, default: 0 },
  rejectedQty: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Completed', 'In Progress', 'Pending', 'Rework / Rejected'],
    default: 'Pending'
  },
  shift: { type: String, enum: ['Day', 'Night'], default: 'Day' },
  productionDate: Date
}, { timestamps: true });

module.exports = mongoose.model('Production', productionSchema);
