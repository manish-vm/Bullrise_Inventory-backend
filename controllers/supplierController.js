const asyncHandler = require('express-async-handler');
const Supplier = require('../models/Supplier');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

exports.getSuppliers = asyncHandler(async (req, res) => {
  const { search = '', status, category, city, page = 1, limit = 8 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { supplierCode: new RegExp(search, 'i') }, { contactPerson: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (category && category !== 'All Categories') filter.category = category;
  if (city && city !== 'All Cities') filter.city = city;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Supplier.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Supplier.countDocuments(filter)
  ]);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

exports.createSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.create(req.body);
  await Activity.create({ module: 'suppliers', title: 'New Supplier Added', description: `${supplier.name} added successfully`, dateText: new Date().toLocaleString(), type: 'success' });
  created(res, supplier);
});

exports.getSupplier = asyncHandler(async (req, res) => ok(res, await Supplier.findById(req.params.id)));
exports.updateSupplier = asyncHandler(async (req, res) => ok(res, await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true })));
exports.deleteSupplier = asyncHandler(async (req, res) => { await Supplier.findByIdAndDelete(req.params.id); ok(res, null, 'Deleted'); });

exports.getSupplierStats = asyncHandler(async (req, res) => {
  const [total, active, inactive, rows] = await Promise.all([
    Supplier.countDocuments(), Supplier.countDocuments({ status: 'Active' }), Supplier.countDocuments({ status: 'Inactive' }), Supplier.find()
  ]);
  const byCategory = Object.values(rows.reduce((acc, s) => {
    acc[s.category] ||= { label: s.category, value: 0 };
    acc[s.category].value += 1;
    return acc;
  }, {}));
  const top = rows.sort((a, b) => b.ordersCount - a.ordersCount).slice(0, 5).map(s => ({ name: s.name, value: `${s.ordersCount} Orders` }));
  ok(res, { total, active, inactive, thisMonthOrders: 18, byCategory, top });
});

exports.getSupplierActivities = asyncHandler(async (req, res) => ok(res, await Activity.find({ module: 'suppliers' }).sort({ createdAt: -1 }).limit(5)));
