const crypto = require('crypto');
const mongoose = require('mongoose');

const roles = ['Super Admin', 'Admin', 'Warehouse Manager', 'Production Manager', 'QC Inspector', 'Sales Staff'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  role: { type: String, enum: roles, default: 'Admin' },
  passwordHash: { type: String, required: true },
  salt: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  lastLoginAt: Date
}, { timestamps: true });

userSchema.methods.setPassword = function setPassword(password) {
  this.salt = crypto.randomBytes(16).toString('hex');
  this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 100000, 64, 'sha512').toString('hex');
};

userSchema.methods.comparePassword = function comparePassword(password) {
  const hash = crypto.pbkdf2Sync(password, this.salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(this.passwordHash, 'hex'));
};

userSchema.statics.createWithPassword = function createWithPassword(data, password) {
  const user = new this(data);
  user.setPassword(password);
  return user.save();
};

module.exports = mongoose.model('User', userSchema);
module.exports.roles = roles;
