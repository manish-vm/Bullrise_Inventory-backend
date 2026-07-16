const asyncHandler = require('express-async-handler');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

async function getOrderCounts() {
  const rows = await PurchaseOrder.aggregate([
    { $group: { _id: '$supplier', ordersCount: { $sum: 1 } } }
  ]);

  return rows.reduce((counts, row) => {
    if (row._id) counts[String(row._id)] = row.ordersCount;
    return counts;
  }, {});
}

function withOrderCount(supplier, counts) {
  const item = supplier.toObject ? supplier.toObject() : supplier;
  return { ...item, ordersCount: counts[String(item._id)] || 0 };
}

const splitCategories = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const supplierCodePattern = /^SUP-(\d+)$/;

async function nextSupplierCode() {
  const suppliers = await Supplier.find({ supplierCode: supplierCodePattern }).select('supplierCode').lean();
  const lastNumber = suppliers.reduce((max, supplier) => {
    const match = supplierCodePattern.exec(supplier.supplierCode || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `SUP-${String(lastNumber + 1).padStart(3, '0')}`;
}

exports.getSuppliers = asyncHandler(async (req, res) => {
  const { search = '', status, category, city, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { supplierCode: new RegExp(search, 'i') }, { contactPerson: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (category && !['All Categories', 'All Raw Material Items'].includes(category)) filter.category = new RegExp(`(^|,\\s*)${escapeRegex(category)}(\\s*,|$)`, 'i');
  if (city && city !== 'All Cities') filter.city = city;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total, orderCounts] = await Promise.all([
    Supplier.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Supplier.countDocuments(filter),
    getOrderCounts()
  ]);
  ok(res, { items: items.map((item) => withOrderCount(item, orderCounts)), total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

exports.createSupplier = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (!payload.supplierCode) payload.supplierCode = await nextSupplierCode();
  const supplier = await Supplier.create(payload);
  await Activity.create({ module: 'suppliers', title: 'New Supplier Added', description: `${supplier.name} added successfully`, dateText: new Date().toLocaleString(), type: 'success' });
  created(res, supplier);
});

exports.getSupplier = asyncHandler(async (req, res) => {
  const [supplier, orderCounts] = await Promise.all([
    Supplier.findById(req.params.id),
    getOrderCounts()
  ]);
  ok(res, supplier ? withOrderCount(supplier, orderCounts) : supplier);
});
exports.updateSupplier = asyncHandler(async (req, res) => ok(res, await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true })));
exports.deleteSupplier = asyncHandler(async (req, res) => { await Supplier.findByIdAndDelete(req.params.id); ok(res, null, 'Deleted'); });

exports.getSupplierStats = asyncHandler(async (req, res) => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [total, active, inactive, suppliers, orderCounts, thisMonthOrders] = await Promise.all([
    Supplier.countDocuments(),
    Supplier.countDocuments({ status: 'Active' }),
    Supplier.countDocuments({ status: 'Inactive' }),
    Supplier.find(),
    getOrderCounts(),
    PurchaseOrder.countDocuments({ createdAt: { $gte: monthStart } })
  ]);
  const rows = suppliers.map((supplier) => withOrderCount(supplier, orderCounts));
  const byCategory = Object.values(rows.reduce((acc, s) => {
    splitCategories(s.category).forEach((category) => {
      acc[category] ||= { label: category, value: 0 };
      acc[category].value += 1;
    });
    return acc;
  }, {}));
  const top = rows.sort((a, b) => b.ordersCount - a.ordersCount).slice(0, 5).map(s => ({ name: s.name, value: `${s.ordersCount} Orders` }));
  ok(res, { total, active, inactive, thisMonthOrders, byCategory, top });
});

exports.getSupplierActivities = asyncHandler(async (req, res) => ok(res, await Activity.find({ module: 'suppliers' }).sort({ createdAt: -1 }).limit(5)));
