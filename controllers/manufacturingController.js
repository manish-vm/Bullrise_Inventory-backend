const asyncHandler = require('express-async-handler');
const WorkOrder = require('../models/ManufacturingWorkOrder');
const QCInspection = require('../models/QCInspection');
const ProductionTracking = require('../models/ProductionTracking');
const ProductionPlan = require('../models/ProductionPlan');
const JobCard = require('../models/JobCard');
const Activity = require('../models/Activity');
const { ok } = require('../utils/apiResponse');

const pct = (part, total) => total ? Number(((part / total) * 100).toFixed(1)) : 0;
const dateText = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const colors = ['#16a34a', '#2f80ed', '#8b5cf6', '#f97316', '#ef4444'];

function statusOverview(rows) {
  return ['Completed', 'In Progress', 'Pending', 'Overdue'].map((label) => ({
    label,
    value: rows.filter((row) => row.status === label).length
  }));
}

function trendByDate(rows, dateKey, qtyKey) {
  const grouped = {};
  rows.forEach((row) => {
    const key = dateText(row[dateKey]);
    grouped[key] ||= { day: key, completed: 0, progress: 0, pending: 0, overdue: 0 };
    const qty = row[qtyKey] || 0;
    if (row.status === 'Completed') grouped[key].completed += qty;
    if (row.status === 'In Progress') grouped[key].progress += qty;
    if (row.status === 'Pending') grouped[key].pending += qty;
    if (row.status === 'Overdue') grouped[key].overdue += qty;
  });
  return Object.values(grouped);
}

exports.getOverview = asyncHandler(async (req, res) => {
  const rows = await WorkOrder.find().sort({ dueDate: -1 });
  const planned = rows.reduce((sum, row) => sum + row.plannedQty, 0);
  const completed = rows.reduce((sum, row) => sum + row.completedQty, 0);
  const produced = rows.reduce((sum, row) => sum + row.producedQty, 0);
  const rejected = rows.reduce((sum, row) => sum + row.rejectedQty, 0);
  const departments = Object.values(rows.reduce((acc, row) => {
    acc[row.department] ||= { name: row.department, value: 0, color: colors[Object.keys(acc).length % colors.length] };
    acc[row.department].value += row.completedQty;
    return acc;
  }, {}));

  ok(res, {
    stats: {
      total: rows.length,
      inProgress: rows.filter((row) => row.status === 'In Progress').length,
      completed: rows.filter((row) => row.status === 'Completed').length,
      pending: rows.filter((row) => row.status === 'Pending').length,
      overdue: rows.filter((row) => row.status === 'Overdue').length,
      produced,
      rejected,
      efficiency: pct(completed, planned),
      avgCycleDays: rows.length ? Number((rows.reduce((sum, row) => sum + row.cycleDays, 0) / rows.length).toFixed(1)) : 0
    },
    rows,
    overview: statusOverview(rows),
    trend: trendByDate(rows, 'trendDate', 'completedQty'),
    departments,
    activities: await Activity.find({ module: 'manufacturing-overview' }).sort({ createdAt: -1 }).limit(5)
  });
});

exports.getQCInspection = asyncHandler(async (req, res) => {
  const rows = await QCInspection.find().sort({ inspectionDate: -1 });
  const total = rows.length;
  const statusCount = (status) => rows.filter((row) => row.status === status).length;
  const defects = Object.values(rows.reduce((acc, row) => {
    const label = row.defectType || 'Others';
    acc[label] ||= { label, value: 0 };
    acc[label].value += row.defects;
    return acc;
  }, {})).map((item, index) => ({ ...item, percent: pct(item.value, rows.reduce((sum, row) => sum + row.defects, 0)), color: colors[index % colors.length] }));
  const passRates = Object.values(rows.reduce((acc, row) => {
    acc[row.department] ||= { name: row.department, inspected: 0, passed: 0, color: colors[Object.keys(acc).length % colors.length] };
    acc[row.department].inspected += row.inspectedQty;
    acc[row.department].passed += row.passedQty;
    return acc;
  }, {})).map((item) => ({ name: item.name, value: pct(item.passed, item.inspected), color: item.color }));

  ok(res, {
    stats: {
      total,
      passed: statusCount('Passed'),
      minor: statusCount('Minor Defect'),
      major: statusCount('Major Defect'),
      pending: statusCount('Pending')
    },
    rows,
    overview: ['Passed', 'Minor Defect', 'Major Defect', 'Pending'].map((label) => ({ label, value: statusCount(label) })),
    defects,
    passRates,
    trend: rows.map((row) => ({ day: dateText(row.inspectionDate), passed: row.passedQty, minor: row.status === 'Minor Defect' ? row.defects : 0, major: row.status === 'Major Defect' ? row.defects : 0 })),
    activities: await Activity.find({ module: 'qc-inspection' }).sort({ createdAt: -1 }).limit(5)
  });
});

exports.getProductionTracking = asyncHandler(async (req, res) => {
  const rows = await ProductionTracking.find().sort({ lastUpdated: -1 });
  const target = rows.reduce((sum, row) => sum + row.targetQty, 0);
  const produced = rows.reduce((sum, row) => sum + row.producedQty, 0);
  const statusQty = (status) => rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.producedQty, 0);
  const departments = Object.values(rows.reduce((acc, row) => {
    acc[row.department] ||= { name: row.department, produced: 0, target: 0, color: colors[Object.keys(acc).length % colors.length] };
    acc[row.department].produced += row.producedQty;
    acc[row.department].target += row.targetQty;
    return acc;
  }, {})).map((item) => ({ name: item.name, value: pct(item.produced, item.target), color: item.color }));

  ok(res, {
    stats: {
      totalProduction: produced,
      completed: statusQty('Completed'),
      inProgress: statusQty('In Progress'),
      pending: rows.filter((row) => row.status === 'Pending').reduce((sum, row) => sum + (row.targetQty - row.producedQty), 0),
      overdue: rows.filter((row) => row.status === 'Overdue').reduce((sum, row) => sum + (row.targetQty - row.producedQty), 0),
      target
    },
    rows,
    overview: ['Completed', 'In Progress', 'Pending', 'Overdue'].map((label) => ({ label, value: label === 'Completed' ? statusQty(label) : label === 'In Progress' ? statusQty(label) : rows.filter((row) => row.status === label).reduce((sum, row) => sum + (row.targetQty - row.producedQty), 0) })),
    departments,
    trend: trendByDate(rows, 'lastUpdated', 'producedQty'),
    activities: await Activity.find({ module: 'production-tracking' }).sort({ createdAt: -1 }).limit(5)
  });
});

exports.getProductionPlanning = asyncHandler(async (req, res) => {
  const rows = await ProductionPlan.find().sort({ startDate: -1 });
  const planned = rows.reduce((sum, row) => sum + row.plannedQty, 0);
  const completed = rows.reduce((sum, row) => sum + row.completedQty, 0);
  const produced = rows.reduce((sum, row) => sum + row.producedQty, 0);
  const rejected = rows.reduce((sum, row) => sum + row.rejectedQty, 0);
  const departments = Object.values(rows.reduce((acc, row) => {
    acc[row.department] ||= { name: row.department, value: 0, color: colors[Object.keys(acc).length % colors.length] };
    acc[row.department].value += row.completedQty;
    return acc;
  }, {}));

  ok(res, {
    stats: {
      total: rows.length,
      inProgress: rows.filter((row) => row.status === 'In Progress').length,
      completed: rows.filter((row) => row.status === 'Completed').length,
      pending: rows.filter((row) => row.status === 'Pending').length,
      overdue: rows.filter((row) => row.status === 'Overdue').length,
      produced,
      rejected,
      efficiency: pct(completed, planned),
      avgCycleDays: rows.length ? Number((rows.reduce((sum, row) => sum + row.cycleDays, 0) / rows.length).toFixed(1)) : 0
    },
    rows,
    overview: statusOverview(rows),
    trend: trendByDate(rows, 'trendDate', 'completedQty'),
    departments,
    activities: await Activity.find({ module: 'production-planning' }).sort({ createdAt: -1 }).limit(5)
  });
});

exports.getJobCards = asyncHandler(async (req, res) => {
  const rows = await JobCard.find().sort({ startDate: -1 });
  const count = (status) => rows.filter((row) => row.status === status).length;
  const priorityCount = (priority) => rows.filter((row) => row.priority === priority).length;
  const departments = Object.values(rows.reduce((acc, row) => {
    acc[row.department] ||= { name: row.department, value: 0, color: colors[Object.keys(acc).length % colors.length] };
    acc[row.department].value += 1;
    return acc;
  }, {}));
  const trend = Object.values(rows.reduce((acc, row) => {
    const key = dateText(row.trendDate);
    acc[key] ||= { day: key, completed: 0, progress: 0, pending: 0, overdue: 0 };
    if (row.status === 'Completed') acc[key].completed += 1;
    if (row.status === 'In Progress') acc[key].progress += 1;
    if (row.status === 'Pending') acc[key].pending += 1;
    if (row.status === 'Overdue') acc[key].overdue += 1;
    return acc;
  }, {}));

  ok(res, {
    stats: {
      total: rows.length,
      inProgress: count('In Progress'),
      completed: count('Completed'),
      pending: count('Pending'),
      overdue: count('Overdue')
    },
    rows,
    overview: ['Completed', 'In Progress', 'Pending', 'Overdue'].map((label) => ({ label, value: count(label) })),
    departments,
    priorities: [
      { label: 'High Priority', value: priorityCount('High') },
      { label: 'Medium Priority', value: priorityCount('Medium') },
      { label: 'Low Priority', value: priorityCount('Low') },
      { label: 'No Priority', value: priorityCount('None') }
    ],
    trend,
    activities: await Activity.find({ module: 'job-cards' }).sort({ createdAt: -1 }).limit(5)
  });
});
