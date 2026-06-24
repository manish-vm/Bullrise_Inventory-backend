const asyncHandler = require('express-async-handler');
const WorkOrder = require('../models/ManufacturingWorkOrder');
const QCInspection = require('../models/QCInspection');
const ProductionTracking = require('../models/ProductionTracking');
const ProductionPlan = require('../models/ProductionPlan');
const JobCard = require('../models/JobCard');
const Activity = require('../models/Activity');
const { ok } = require('../utils/apiResponse');
const { createMovement, postFinishedGoods, reserveRawMaterial } = require('../services/stockService');
const RawMaterialStock = require('../models/RawMaterialStock');
const BillOfMaterial = require('../models/BillOfMaterial');
const ProductionDamage = require('../models/ProductionDamage');

const pct = (part, total) => total ? Number(((part / total) * 100).toFixed(1)) : 0;
const dateText = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const colors = ['#16a34a', '#2f80ed', '#8b5cf6', '#f97316', '#ef4444'];
const productionStages = ['Cutting', 'Stitching', 'Finishing', 'QC', 'Packing'];

async function syncProductionDamage(jobCard, quantity, decision, remarks, recordedBy) {
  const existing = await ProductionDamage.findOne({ jobCard: jobCard._id });

  if (quantity <= 0) {
    if (existing) await existing.deleteOne();
    return null;
  }

  const damageDecision = decision || existing?.decision || 'Damage';
  const status = damageDecision === 'Scrap' ? 'Scrapped' : damageDecision === 'Repair' ? 'Repair Queue' : 'Recorded';
  const payload = {
    damageNo: existing?.damageNo || `DMG-${Date.now()}`,
    workOrder: jobCard.workOrder,
    jobCard: jobCard._id,
    woNumber: jobCard.woNumber,
    jobCardNumber: jobCard.jobCardNumber,
    productStyle: jobCard.productStyle,
    stageName: jobCard.stageName,
    quantity,
    reason: remarks || existing?.reason || 'Stage rejection',
    decision: damageDecision,
    status,
    recordedBy: recordedBy || existing?.recordedBy || 'System'
  };

  return ProductionDamage.findOneAndUpdate(
    { jobCard: jobCard._id },
    payload,
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function syncProductionTracking(jobCard) {
  const targetQty = Number(jobCard.inputQuantity || 0);
  const producedQty = Number(jobCard.completedQuantity || 0);
  const pendingQty = Number(jobCard.pendingQuantity || 0);
  const status = jobCard.status === 'Completed'
    ? 'Completed'
    : producedQty > 0 || jobCard.status === 'In Progress'
      ? 'In Progress'
      : pendingQty > 0 || targetQty > 0
        ? 'Pending'
        : jobCard.status === 'Overdue'
          ? 'Overdue'
          : 'Pending';

  return ProductionTracking.findOneAndUpdate(
    { jobCardNumber: jobCard.jobCardNumber },
    {
      jobCardNumber: jobCard.jobCardNumber,
      woNumber: jobCard.woNumber,
      productStyle: jobCard.productStyle,
      department: jobCard.stageName || jobCard.department,
      targetQty,
      producedQty,
      status,
      lastUpdated: new Date()
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

function applyJobCardTotals(jobCard, input) {
  const nextInput = Number(input ?? jobCard.inputQuantity ?? 0);
  const completed = Number(jobCard.completedQuantity || 0);
  const rejected = Number(jobCard.rejectedQuantity || 0);
  const rework = Number(jobCard.reworkQuantity || 0);

  jobCard.inputQuantity = nextInput;
  jobCard.pendingQuantity = Math.max(nextInput - completed - rejected - rework, 0);
  jobCard.progress = nextInput ? Number(((completed / nextInput) * 100).toFixed(1)) : 0;
  jobCard.status = jobCard.pendingQuantity === 0 && nextInput > 0 ? 'Completed' : nextInput > 0 ? 'In Progress' : 'Pending';
}

async function syncNextStageInput(jobCard) {
  const currentIndex = productionStages.indexOf(jobCard.stageName);
  const nextStage = productionStages[currentIndex + 1];
  if (!nextStage) return null;

  const nextCard = await JobCard.findOne({ woNumber: jobCard.woNumber, stageName: nextStage });
  if (!nextCard) return null;

  applyJobCardTotals(nextCard, Number(jobCard.completedQuantity || 0));
  nextCard.startTime = nextCard.inputQuantity > 0 ? nextCard.startTime || new Date() : nextCard.startTime;
  await nextCard.save();
  await syncProductionTracking(nextCard);
  return nextCard;
}

async function syncWorkOrderStageInputs(woNumber) {
  const cards = await JobCard.find({ woNumber });
  const byStage = new Map(cards.map((card) => [card.stageName, card]));

  for (let index = 1; index < productionStages.length; index += 1) {
    const previous = byStage.get(productionStages[index - 1]);
    const current = byStage.get(productionStages[index]);
    if (!previous || !current) continue;

    applyJobCardTotals(current, Number(previous.completedQuantity || 0));
    if (current.inputQuantity > 0) current.startTime = current.startTime || new Date();
    await current.save();
    await syncProductionTracking(current);
  }

  return JobCard.find({ woNumber }).sort({ createdAt: 1 });
}

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

exports.createWorkOrder = asyncHandler(async (req, res) => {
  const bom = req.body.bomId ? await BillOfMaterial.findById(req.body.bomId) : req.body.bomNo ? await BillOfMaterial.findOne({ bomNo: req.body.bomNo }) : null;
  if (!bom) throw new Error('Active BOM is required to create a work order');
  if (bom.status !== 'Active') throw new Error('Only active BOMs can be used for work orders');

  const plannedQty = Number(req.body.plannedQty || 0);
  if (plannedQty <= 0) throw new Error('Planned quantity is required');

  const multiplier = plannedQty / Number(bom.baseQuantity || 1);
  const requiredMaterials = (bom.materials || []).map((line) => ({
    materialName: line.materialName,
    category: line.category,
    requiredQuantity: Number((line.totalRequired * multiplier).toFixed(3)),
    reservedQuantity: 0,
    consumedQuantity: 0,
    unit: line.unit
  }));

  const workOrder = await WorkOrder.create({
    woNumber: req.body.woNumber,
    product: bom.product,
    variant: bom.variant,
    productStyle: bom.productName,
    department: req.body.department || bom.department || 'Cutting',
    priority: req.body.priority || 'Medium',
    plannedQty,
    completedQty: 0,
    status: 'Pending',
    startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
    endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : req.body.endDate ? new Date(req.body.endDate) : undefined,
    producedQty: 0,
    rejectedQty: 0,
    requiredMaterials,
    trendDate: new Date()
  });

  await Activity.create({
    module: 'manufacturing-overview',
    title: `${workOrder.woNumber} created`,
    description: `${workOrder.productStyle} - ${plannedQty} pcs from ${bom.bomNo}`,
    dateText: new Date().toLocaleString(),
    type: 'warning'
  });

  ok(res, workOrder, 'Work order created from BOM');
});

exports.getWorkOrder = asyncHandler(async (req, res) => ok(res, await WorkOrder.findById(req.params.id).populate('product variant')));

exports.updateWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findByIdAndUpdate(req.params.id, req.body, { new: true });
  ok(res, workOrder);
});

exports.deleteWorkOrder = asyncHandler(async (req, res) => {
  await WorkOrder.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
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

exports.createQCInspection = asyncHandler(async (req, res) => {
  const inspectedQty = Number(req.body.inspectedQty ?? req.body.inspectedQuantity ?? 0);
  const passedQty = Number(req.body.passedQty ?? req.body.passedQuantity ?? 0);
  const rejectedQuantity = Number(req.body.rejectedQuantity || 0);
  const reworkQuantity = Number(req.body.reworkQuantity || 0);
  const defects = Number(req.body.defects ?? rejectedQuantity + reworkQuantity);

  if (passedQty + rejectedQuantity + reworkQuantity > inspectedQty) {
    throw new Error('Passed, rejected and rework quantities cannot exceed inspected quantity');
  }

  const item = await QCInspection.create({
    ...req.body,
    inspectedQty,
    passedQty,
    rejectedQuantity,
    reworkQuantity,
    defects,
    inspectionDate: req.body.inspectionDate ? new Date(req.body.inspectionDate) : new Date()
  });

  await Activity.create({
    module: 'qc-inspection',
    title: `${item.inspectionId} created`,
    description: `${item.productStyle || item.woNumber} inspection recorded`,
    dateText: new Date().toLocaleString(),
    type: item.status === 'Passed' ? 'success' : item.status === 'Major Defect' ? 'danger' : 'warning'
  });

  ok(res, item, 'QC inspection created');
});

exports.getQCInspectionById = asyncHandler(async (req, res) => ok(res, await QCInspection.findById(req.params.id)));

exports.updateQCInspection = asyncHandler(async (req, res) => {
  const item = await QCInspection.findById(req.params.id);
  if (!item) throw new Error('QC inspection not found');
  if (item.postedToStock) throw new Error('Posted QC inspections cannot be edited');

  Object.assign(item, req.body);
  item.inspectedQty = Number(req.body.inspectedQty ?? req.body.inspectedQuantity ?? item.inspectedQty ?? 0);
  item.passedQty = Number(req.body.passedQty ?? req.body.passedQuantity ?? item.passedQty ?? 0);
  item.rejectedQuantity = Number(req.body.rejectedQuantity ?? item.rejectedQuantity ?? 0);
  item.reworkQuantity = Number(req.body.reworkQuantity ?? item.reworkQuantity ?? 0);
  item.defects = Number(req.body.defects ?? item.rejectedQuantity + item.reworkQuantity);

  if (item.passedQty + item.rejectedQuantity + item.reworkQuantity > item.inspectedQty) {
    throw new Error('Passed, rejected and rework quantities cannot exceed inspected quantity');
  }

  await item.save();
  ok(res, item, 'QC inspection updated');
});

exports.deleteQCInspection = asyncHandler(async (req, res) => {
  const item = await QCInspection.findById(req.params.id);
  if (!item) throw new Error('QC inspection not found');
  if (item.postedToStock) throw new Error('Posted QC inspections cannot be deleted');
  await item.deleteOne();
  ok(res, null, 'Deleted');
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

exports.updateProductionTracking = asyncHandler(async (req, res) => {
  const item = await ProductionTracking.findById(req.params.id);
  if (!item) throw new Error('Production tracking record not found');
  ['jobCardNumber', 'woNumber', 'productStyle', 'department', 'status'].forEach((key) => {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  });
  if (req.body.targetQty !== undefined) item.targetQty = Number(req.body.targetQty || 0);
  if (req.body.producedQty !== undefined) item.producedQty = Number(req.body.producedQty || 0);
  item.lastUpdated = req.body.lastUpdated ? new Date(req.body.lastUpdated) : new Date();
  await item.save();
  ok(res, item, 'Production tracking updated');
});

exports.importProductionTracking = asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) throw new Error('No production tracking rows supplied');
  const saved = [];
  for (const row of rows) {
    if (!row.jobCardNumber) continue;
    const item = await ProductionTracking.findOneAndUpdate(
      { jobCardNumber: row.jobCardNumber },
      {
        jobCardNumber: row.jobCardNumber,
        woNumber: row.woNumber || '',
        productStyle: row.productStyle || '',
        department: row.department || '',
        targetQty: Number(row.targetQty || 0),
        producedQty: Number(row.producedQty || 0),
        status: row.status || 'Pending',
        lastUpdated: row.lastUpdated ? new Date(row.lastUpdated) : new Date()
      },
      { new: true, upsert: true, runValidators: true }
    );
    saved.push(item);
  }
  ok(res, saved, `${saved.length} production tracking rows imported`);
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
  const rows = await JobCard.find().sort({ woNumber: -1, createdAt: 1 });
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

exports.getProductionDamage = asyncHandler(async (req, res) => {
  const { search = '', decision, status, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ damageNo: new RegExp(search, 'i') }, { woNumber: new RegExp(search, 'i') }, { jobCardNumber: new RegExp(search, 'i') }, { productStyle: new RegExp(search, 'i') }];
  if (decision && decision !== 'All Decisions') filter.decision = decision;
  if (status && status !== 'All Status') filter.status = status;
  const perPage = Number(limit);
  const skip = (Number(page) - 1) * perPage;
  const [items, total] = await Promise.all([
    ProductionDamage.find(filter).populate('workOrder jobCard').sort('-createdAt').skip(skip).limit(perPage),
    ProductionDamage.countDocuments(filter)
  ]);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / perPage) });
});

exports.getProductionDamageStats = asyncHandler(async (req, res) => {
  const rows = await ProductionDamage.find();
  ok(res, {
    total: rows.length,
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    damage: rows.filter((row) => row.decision === 'Damage').reduce((sum, row) => sum + row.quantity, 0),
    scrap: rows.filter((row) => row.decision === 'Scrap').reduce((sum, row) => sum + row.quantity, 0),
    repair: rows.filter((row) => row.decision === 'Repair').reduce((sum, row) => sum + row.quantity, 0)
  });
});

exports.generateStageJobCards = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) throw new Error('Work order not found');

  const existing = await JobCard.find({ woNumber: workOrder.woNumber });
  if (existing.length) {
    const synced = await syncWorkOrderStageInputs(workOrder.woNumber);
    await Promise.all(synced.map((card) => syncProductionTracking(card)));
    ok(res, synced, 'Stage job cards already exist');
    return;
  }

  const cards = await JobCard.insertMany(productionStages.map((stage, index) => ({
    jobCardNumber: `${workOrder.woNumber}-${String(index + 1).padStart(2, '0')}-${stage.toUpperCase()}`,
    workOrder: workOrder._id,
    woNumber: workOrder.woNumber,
    productStyle: workOrder.productStyle,
    stageName: stage,
    department: stage,
    assignedTo: `${stage} Team`,
    inputQuantity: index === 0 ? workOrder.plannedQty : 0,
    pendingQuantity: index === 0 ? workOrder.plannedQty : 0,
    completedQuantity: 0,
    rejectedQuantity: 0,
    reworkQuantity: 0,
    startDate: workOrder.startDate || new Date(),
    dueDate: workOrder.dueDate,
    priority: workOrder.priority || 'Medium',
    status: index === 0 ? 'In Progress' : 'Pending',
    progress: 0,
    trendDate: new Date()
  })));
  await Promise.all(cards.map((card) => syncProductionTracking(card)));

  await Activity.create({
    module: 'job-cards',
    title: `${workOrder.woNumber} stage cards generated`,
    description: productionStages.join(' -> '),
    dateText: new Date().toLocaleString(),
    type: 'success'
  });

  ok(res, cards, 'Stage job cards generated');
});

exports.completeJobCardStage = asyncHandler(async (req, res) => {
  const jobCard = await JobCard.findById(req.params.id);
  if (!jobCard) throw new Error('Job card not found');

  const input = Number(jobCard.inputQuantity || req.body.inputQuantity || 0);
  const completed = Number(req.body.completedQuantity || 0);
  const rejected = Number(req.body.rejectedQuantity || 0);
  const rework = Number(req.body.reworkQuantity || 0);
  const damageDecision = req.body.damageDecision || 'Damage';
  if (completed + rejected + rework > input) {
    throw new Error('Completed, rejected and rework quantities cannot exceed input quantity');
  }

  jobCard.completedQuantity = completed;
  jobCard.rejectedQuantity = rejected;
  jobCard.reworkQuantity = rework;
  jobCard.pendingQuantity = Math.max(input - completed - rejected - rework, 0);
  jobCard.progress = input ? Number(((completed / input) * 100).toFixed(1)) : 0;
  jobCard.status = jobCard.pendingQuantity === 0 ? 'Completed' : 'In Progress';
  jobCard.startTime = jobCard.startTime || new Date();
  if (jobCard.status === 'Completed') jobCard.endTime = new Date();
  jobCard.remarks = req.body.remarks || jobCard.remarks;
  await jobCard.save();
  await syncProductionTracking(jobCard);

  const nextCard = await syncNextStageInput(jobCard);
  if (completed > 0 && nextCard) {
    await createMovement({
      movementType: 'TRANSFER_OUT',
      itemType: 'FINISHED_GOOD',
      referenceType: 'JobCard',
      referenceId: String(jobCard._id),
      sku: jobCard.woNumber,
      quantityOut: completed,
      balanceAfter: jobCard.pendingQuantity,
      remarks: `${jobCard.stageName} output transferred to ${nextCard.stageName}`
    });
    await createMovement({
      movementType: 'TRANSFER_IN',
      itemType: 'FINISHED_GOOD',
      referenceType: 'JobCard',
      referenceId: String(jobCard._id),
      sku: jobCard.woNumber,
      quantityIn: completed,
      balanceAfter: completed,
      remarks: `${nextCard.stageName} input received from ${jobCard.stageName}`
    });
  }

  if (rework > 0) {
    const count = await JobCard.countDocuments({ woNumber: jobCard.woNumber, jobCardNumber: new RegExp(`^RW-${jobCard.woNumber}-${jobCard.stageName}`) });
    await JobCard.create({
      jobCardNumber: `RW-${jobCard.woNumber}-${jobCard.stageName}-${count + 1}`,
      workOrder: jobCard.workOrder,
      woNumber: jobCard.woNumber,
      productStyle: jobCard.productStyle,
      stageName: jobCard.stageName,
      department: jobCard.department,
      assignedTo: 'Rework Team',
      inputQuantity: rework,
      pendingQuantity: rework,
      completedQuantity: 0,
      rejectedQuantity: 0,
      reworkQuantity: 0,
      priority: 'High',
      status: 'Pending',
      startDate: new Date(),
      dueDate: jobCard.dueDate,
      remarks: req.body.remarks || `Rework from ${jobCard.jobCardNumber}`,
      trendDate: new Date()
    }).then(syncProductionTracking);
    await createMovement({
      movementType: 'REWORK',
      itemType: 'FINISHED_GOOD',
      referenceType: 'JobCard',
      referenceId: String(jobCard._id),
      sku: jobCard.woNumber,
      quantityOut: rework,
      remarks: `${rework} units routed to ${jobCard.stageName} rework`
    });
  }

  if (rejected > 0) {
    const damage = await syncProductionDamage(jobCard, rejected, damageDecision, req.body.remarks, req.user?.name);
    await createMovement({
      movementType: 'DAMAGE',
      itemType: 'FINISHED_GOOD',
      referenceType: 'ProductionDamage',
      referenceId: String(damage._id),
      sku: jobCard.woNumber,
      quantityOut: rejected,
      remarks: `${rejected} units ${damageDecision.toLowerCase()} from ${jobCard.stageName}`
    });
  }

  const workOrder = await WorkOrder.findOne({ woNumber: jobCard.woNumber });
  if (workOrder) {
    const cards = await JobCard.find({ woNumber: jobCard.woNumber });
    const packingCard = cards.find((card) => card.stageName === 'Packing');
    workOrder.completedQty = packingCard?.completedQuantity || 0;
    workOrder.rejectedQty = cards.reduce((sum, card) => sum + Number(card.rejectedQuantity || 0), 0);
    workOrder.producedQty = workOrder.completedQty;
    if (workOrder.completedQty >= workOrder.plannedQty) workOrder.status = 'Completed';
    else if (cards.some((card) => card.status === 'In Progress')) workOrder.status = 'In Progress';
    await workOrder.save();
  }

  await Activity.create({
    module: 'job-cards',
    title: `${jobCard.jobCardNumber} updated`,
    description: `${jobCard.stageName}: ${completed} completed, ${rejected} rejected, ${rework} rework`,
    dateText: new Date().toLocaleString(),
    type: rejected > 0 ? 'warning' : 'success'
  });

  ok(res, jobCard, 'Stage completed and next stage updated');
});

exports.approveWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) throw new Error('Work order not found');

  const requirements = workOrder.requiredMaterials?.length
    ? workOrder.requiredMaterials
    : [{ materialName: 'Fabrics', category: 'Fabrics', requiredQuantity: Math.max(workOrder.plannedQty, 1), unit: 'm' }];

  for (const requirement of requirements) {
    const stock = await RawMaterialStock.findOne({
      $or: [{ materialName: requirement.materialName }, { category: requirement.category }]
    }).sort({ availableQuantity: -1 });
    if (!stock || stock.availableQuantity < requirement.requiredQuantity) {
      throw new Error(`Insufficient stock for ${requirement.materialName || requirement.category}`);
    }
  }

  let reservedQty = 0;
  for (const requirement of requirements) {
    await reserveRawMaterial({
      materialName: requirement.materialName,
      category: requirement.category,
      quantity: requirement.requiredQuantity,
      referenceType: 'ManufacturingWorkOrder',
      referenceId: String(workOrder._id),
      remarks: `${workOrder.woNumber} approved material reservation`
    });
    requirement.reservedQuantity = requirement.requiredQuantity;
    reservedQty += requirement.requiredQuantity;
  }

  workOrder.requiredMaterials = requirements;
  workOrder.reservedQty = reservedQty;
  workOrder.status = 'Approved';
  await workOrder.save();
  await Activity.create({ module: 'manufacturing-overview', title: `${workOrder.woNumber} approved`, description: `${reservedQty} raw material units reserved`, dateText: new Date().toLocaleString(), type: 'success' });
  ok(res, workOrder, 'Work order approved and material reserved');
});

exports.startWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) throw new Error('Work order not found');
  if (!workOrder.requiredMaterials?.length) throw new Error('Work order has no reserved materials');

  let consumedQty = 0;
  for (const requirement of workOrder.requiredMaterials) {
    const consumeQty = Number(requirement.reservedQuantity || requirement.requiredQuantity || 0);
    if (consumeQty <= 0) continue;
    const stock = await RawMaterialStock.findOne({
      $or: [{ materialName: requirement.materialName }, { category: requirement.category }]
    }).sort({ reservedQuantity: -1 });
    if (!stock || stock.reservedQuantity < consumeQty) throw new Error(`Reserved stock missing for ${requirement.materialName}`);

    stock.reservedQuantity -= consumeQty;
    stock.consumedQuantity += consumeQty;
    await stock.save();
    requirement.consumedQuantity = consumeQty;
    consumedQty += consumeQty;

    await createMovement({
      movementType: 'MATERIAL_CONSUMED',
      itemType: 'RAW_MATERIAL',
      referenceType: 'ManufacturingWorkOrder',
      referenceId: String(workOrder._id),
      materialId: requirement.materialName,
      warehouseId: stock.warehouse,
      locationId: stock.location,
      quantityOut: consumeQty,
      balanceAfter: stock.availableQuantity,
      unitCost: stock.unitCost,
      totalValue: consumeQty * Number(stock.unitCost || 0),
      remarks: `${workOrder.woNumber} production started`
    });
  }

  workOrder.consumedQty = consumedQty;
  workOrder.status = 'In Progress';
  workOrder.startDate = workOrder.startDate || new Date();
  await workOrder.save();
  await Activity.create({ module: 'production-tracking', title: `${workOrder.woNumber} started`, description: `${consumedQty} raw material units consumed`, dateText: new Date().toLocaleString(), type: 'purple' });
  ok(res, workOrder, 'Work order started and material consumed');
});

exports.updateJobCardStage = asyncHandler(async (req, res) => {
  const jobCard = await JobCard.findById(req.params.id);
  if (!jobCard) throw new Error('Job card not found');

  const completed = Number(req.body.completedQuantity ?? jobCard.completedQuantity ?? 0);
  const rejected = Number(req.body.rejectedQuantity ?? jobCard.rejectedQuantity ?? 0);
  const rework = Number(req.body.reworkQuantity ?? jobCard.reworkQuantity ?? 0);
  const damageDecision = req.body.damageDecision;
  const input = Number(req.body.inputQuantity ?? jobCard.inputQuantity ?? jobCard.progress ?? 0);
  if (completed + rejected + rework > input) throw new Error('Completed, rejected and rework quantities cannot exceed input quantity');

  jobCard.inputQuantity = input;
  jobCard.completedQuantity = completed;
  jobCard.rejectedQuantity = rejected;
  jobCard.reworkQuantity = rework;
  jobCard.pendingQuantity = Math.max(input - completed - rejected - rework, 0);
  jobCard.progress = input ? Number(((completed / input) * 100).toFixed(1)) : jobCard.progress;
  jobCard.status = jobCard.pendingQuantity === 0 ? 'Completed' : 'In Progress';
  jobCard.startTime = jobCard.startTime || new Date();
  if (jobCard.status === 'Completed') jobCard.endTime = new Date();
  jobCard.remarks = req.body.remarks ?? jobCard.remarks;
  await jobCard.save();
  await syncProductionTracking(jobCard);
  await syncNextStageInput(jobCard);
  await syncProductionDamage(jobCard, rejected, damageDecision, req.body.remarks, req.user?.name);

  const workOrder = await WorkOrder.findOne({ woNumber: jobCard.woNumber });
  if (workOrder) {
    const jobCards = await JobCard.find({ woNumber: jobCard.woNumber });
    workOrder.completedQty = jobCards.reduce((sum, item) => sum + Number(item.completedQuantity || 0), 0);
    workOrder.rejectedQty = jobCards.reduce((sum, item) => sum + Number(item.rejectedQuantity || 0), 0);
    workOrder.producedQty = workOrder.completedQty;
    if (workOrder.completedQty >= workOrder.plannedQty) workOrder.status = 'Completed';
    await workOrder.save();
  }

  ok(res, jobCard, 'Job card stage updated');
});

exports.postQCToStock = asyncHandler(async (req, res) => {
  const inspection = await QCInspection.findById(req.params.id);
  if (!inspection) throw new Error('QC inspection not found');
  if (inspection.postedToStock) throw new Error('QC inspection is already posted to stock');

  const passedQty = Number(req.body.passedQuantity ?? inspection.passedQty ?? 0);
  const rejectedQty = Number(req.body.rejectedQuantity ?? inspection.rejectedQuantity ?? inspection.defects ?? 0);
  const reworkQty = Number(req.body.reworkQuantity ?? inspection.reworkQuantity ?? 0);
  const sku = req.body.sku || inspection.sku || `BR-${String(inspection.productStyle || 'STYLE').slice(0, 3).toUpperCase()}-${String(req.body.color || inspection.color || 'MIX').slice(0, 3).toUpperCase()}-${req.body.size || inspection.size || 'M'}`;

  if (passedQty > 0) {
    await postFinishedGoods({
      productName: inspection.productStyle,
      sku,
      barcode: sku.replaceAll('-', ''),
      size: req.body.size || inspection.size || 'M',
      color: req.body.color || inspection.color || 'MIX',
      quantity: passedQty,
      referenceType: 'QCInspection',
      referenceId: String(inspection._id),
      remarks: `${inspection.inspectionId} QC passed`
    });
    await createMovement({
      movementType: 'QC_PASSED',
      itemType: 'FINISHED_GOOD',
      referenceType: 'QCInspection',
      referenceId: String(inspection._id),
      sku,
      quantityIn: passedQty,
      balanceAfter: passedQty,
      remarks: `${inspection.inspectionId} passed quantity`
    });
  }

  if (rejectedQty > 0) {
    await createMovement({
      movementType: 'QC_REJECTED',
      itemType: 'FINISHED_GOOD',
      referenceType: 'QCInspection',
      referenceId: String(inspection._id),
      sku,
      quantityOut: rejectedQty,
      remarks: `${inspection.inspectionId} rejected quantity`
    });
  }

  if (reworkQty > 0) {
    const count = await JobCard.countDocuments({ woNumber: inspection.woNumber });
    await JobCard.create({
      jobCardNumber: `RW-${inspection.inspectionId}-${count + 1}`,
      woNumber: inspection.woNumber,
      productStyle: inspection.productStyle,
      stageName: 'Finishing',
      department: inspection.department,
      assignedTo: 'Rework Team',
      inputQuantity: reworkQty,
      pendingQuantity: reworkQty,
      priority: 'High',
      status: 'Pending',
      startDate: new Date(),
      dueDate: new Date(Date.now() + 2 * 86400000),
      remarks: inspection.defectNotes || inspection.defectType
    });
    await createMovement({
      movementType: 'REWORK',
      itemType: 'FINISHED_GOOD',
      referenceType: 'QCInspection',
      referenceId: String(inspection._id),
      sku,
      quantityOut: reworkQty,
      remarks: `${inspection.inspectionId} rework quantity`
    });
  }

  inspection.passedQty = passedQty;
  inspection.rejectedQuantity = rejectedQty;
  inspection.reworkQuantity = reworkQty;
  inspection.sku = sku;
  inspection.size = req.body.size || inspection.size;
  inspection.color = req.body.color || inspection.color;
  inspection.postedToStock = true;
  await inspection.save();
  await Activity.create({ module: 'qc-inspection', title: `${inspection.inspectionId} posted to stock`, description: `${passedQty} passed, ${rejectedQty} rejected, ${reworkQty} rework`, dateText: new Date().toLocaleString(), type: 'success' });
  ok(res, inspection, 'QC posted to finished goods stock');
});
