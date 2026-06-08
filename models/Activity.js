const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  module: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  dateText: String,
  type: { type: String, default: 'success' }
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);
