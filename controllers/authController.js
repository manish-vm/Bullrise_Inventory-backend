const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');
const { sign } = require('../utils/authToken');

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  lastLoginAt: user.lastLoginAt
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() });
  if (!user || user.status !== 'Active' || !user.comparePassword(password || '')) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();
  await Activity.create({ module: 'users', title: 'User login', description: `${user.name} signed in`, dateText: new Date().toLocaleString(), type: 'success' });
  ok(res, { user: publicUser(user), token: sign({ id: user._id, role: user.role }) }, 'Login successful');
});

exports.me = asyncHandler(async (req, res) => ok(res, publicUser(req.user)));

exports.listUsers = asyncHandler(async (req, res) => {
  const { search = '', role, status, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
  if (role && role !== 'All Roles') filter.role = role;
  if (status && status !== 'All Status') filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    User.find(filter).select('-passwordHash -salt').sort('name').skip(skip).limit(Number(limit)),
    User.countDocuments(filter)
  ]);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

exports.createUser = asyncHandler(async (req, res) => {
  const user = await User.createWithPassword({
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    role: req.body.role,
    status: req.body.status || 'Active'
  }, req.body.password || 'Bullrise@123');
  created(res, publicUser(user));
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new Error('User not found');
  ok(res, publicUser(user));
});

exports.updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new Error('User not found');
  ['name', 'email', 'phone', 'role', 'status'].forEach((key) => {
    if (req.body[key] !== undefined) user[key] = req.body[key];
  });
  if (req.body.password) user.setPassword(req.body.password);
  await user.save();
  await Activity.create({
    module: 'users',
    title: `${user.name} updated`,
    description: `${user.email} - ${user.role} - ${user.status}`,
    dateText: new Date().toLocaleString(),
    type: 'purple'
  });
  ok(res, publicUser(user));
});

exports.userStats = asyncHandler(async (req, res) => {
  const rows = await User.find();
  ok(res, {
    total: rows.length,
    active: rows.filter((row) => row.status === 'Active').length,
    inactive: rows.filter((row) => row.status === 'Inactive').length,
    admins: rows.filter((row) => ['Super Admin', 'Admin'].includes(row.role)).length
  });
});
