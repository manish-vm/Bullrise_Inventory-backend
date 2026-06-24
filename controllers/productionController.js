const asyncHandler = require('express-async-handler');
const Production = require('../models/Production');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

const colors = ['#16a34a', '#2f80ed', '#8b5cf6', '#f97316', '#ef4444'];
const pct = (part, total) => total ? Number(((part / total) * 100).toFixed(1)) : 0;
const dateText = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

exports.getProduction = asyncHandler(async (req, res) => {
  const rows = await Production.find().sort({ productionDate: -1, productionId: -1 });
  const target = rows.reduce((sum, row) => sum + row.targetQty, 0);
  const totalProduced = rows.reduce((sum, row) => sum + row.producedQty, 0);
  const totalRejected = rows.reduce((sum, row) => sum + row.rejectedQty, 0);
  const statusQty = (status) => rows
    .filter((row) => row.status === status)
    .reduce((sum, row) => sum + row.producedQty, 0);

  const pending = rows
    .filter((row) => row.status === 'Pending')
    .reduce((sum, row) => sum + Math.max(row.targetQty - row.producedQty, 0), 0);

  const departments = Object.values(rows.reduce((acc, row) => {
    acc[row.department] ||= {
      name: row.department,
      value: 0,
      color: colors[Object.keys(acc).length % colors.length]
    };
    acc[row.department].value += row.producedQty;
    return acc;
  }, {}));

  const shiftTotal = rows.reduce((acc, row) => {
    acc[row.shift] = (acc[row.shift] || 0) + row.producedQty;
    return acc;
  }, {});

  const trend = Object.values(rows.reduce((acc, row) => {
    const key = dateText(row.productionDate);
    acc[key] ||= { day: key, completed: 0, progress: 0, pending: 0, rework: 0 };
    if (row.status === 'Completed') acc[key].completed += row.producedQty;
    if (row.status === 'In Progress') acc[key].progress += row.producedQty;
    if (row.status === 'Pending') acc[key].pending += Math.max(row.targetQty - row.producedQty, 0);
    if (row.status === 'Rework / Rejected') acc[key].rework += row.rejectedQty;
    return acc;
  }, {}));

  ok(res, {
    stats: {
      totalProduced,
      completed: statusQty('Completed'),
      inProgress: statusQty('In Progress'),
      pending,
      rejected: totalRejected,
      target
    },
    rows,
    status: [
      { label: 'Completed', value: statusQty('Completed'), percent: pct(statusQty('Completed'), target) },
      { label: 'In Progress', value: statusQty('In Progress'), percent: pct(statusQty('In Progress'), target) },
      { label: 'Pending', value: pending, percent: pct(pending, target) },
      { label: 'Rework / Rejected', value: totalRejected, percent: pct(totalRejected, target) }
    ],
    departments,
    shifts: [
      { name: 'Day Shift', value: shiftTotal.Day || 0, percent: pct(shiftTotal.Day || 0, totalProduced), color: '#2f80ed' },
      { name: 'Night Shift', value: shiftTotal.Night || 0, percent: pct(shiftTotal.Night || 0, totalProduced), color: '#16a34a' }
    ],
    trend,
    activities: await Activity.find({ module: 'production' }).sort({ createdAt: -1 }).limit(5)
  });
});

exports.createProduction = asyncHandler(async (req, res) => {
  const item = await Production.create({
    ...req.body,
    targetQty: Number(req.body.targetQty || 0),
    producedQty: Number(req.body.producedQty || 0),
    rejectedQty: Number(req.body.rejectedQty || 0),
    productionDate: req.body.productionDate ? new Date(req.body.productionDate) : new Date()
  });
  await Activity.create({
    module: 'production',
    title: `${item.productionId} created`,
    description: `${item.productStyle || item.woNumber} production entry created`,
    dateText: new Date().toLocaleString(),
    type: 'success'
  });
  created(res, item);
});

exports.updateProduction = asyncHandler(async (req, res) => {
  const item = await Production.findById(req.params.id);
  if (!item) throw new Error('Production entry not found');
  Object.assign(item, req.body);
  item.targetQty = Number(req.body.targetQty ?? item.targetQty ?? 0);
  item.producedQty = Number(req.body.producedQty ?? item.producedQty ?? 0);
  item.rejectedQty = Number(req.body.rejectedQty ?? item.rejectedQty ?? 0);
  if (req.body.productionDate) item.productionDate = new Date(req.body.productionDate);
  await item.save();
  ok(res, item, 'Production entry updated');
});
