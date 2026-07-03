const asyncHandler = require('express-async-handler');
const BillOfMaterial = require('../models/BillOfMaterial');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Activity = require('../models/Activity');
const WorkOrder = require('../models/ManufacturingWorkOrder');
const JobCard = require('../models/JobCard');
const ProductionTracking = require('../models/ProductionTracking');
const { ok, created } = require('../utils/apiResponse');

const productionStages = ['Cutting', 'Stitching', 'Finishing', 'QC', 'Packing'];

function normalizeMaterials(materials = [], baseQuantity = 1) {
  return materials.map((line, index) => {
    const quantityPerUnit = Number(line.quantityPerUnit || 0);
    const wastagePercent = Number(line.wastagePercent || 0);
    const unitCost = Number(line.unitCost || 0);
    const requiredForQty = Number(line.requiredForQty || baseQuantity || 1);
    const totalRequired = Number(line.totalRequired || (quantityPerUnit * requiredForQty * (1 + wastagePercent / 100)));
    return {
      ...line,
      lineNo: line.lineNo || index + 1,
      quantityPerUnit,
      wastagePercent,
      unitCost,
      requiredForQty,
      totalRequired,
      totalCost: Number(line.totalCost || totalRequired * unitCost)
    };
  });
}

function applyTotals(payload) {
  payload.materials = normalizeMaterials(payload.materials || [], payload.baseQuantity);
  payload.materialCost = payload.materials.reduce((sum, line) => sum + (line.quantityPerUnit * Number(payload.baseQuantity || 1) * line.unitCost), 0);
  payload.totalCost = payload.materials.reduce((sum, line) => sum + line.totalCost, 0);
  payload.wastageCost = Math.max(payload.totalCost - payload.materialCost, 0);
  return payload;
}

async function createTrackingForCard(card) {
  return ProductionTracking.findOneAndUpdate(
    { jobCardNumber: card.jobCardNumber },
    {
      jobCardNumber: card.jobCardNumber,
      woNumber: card.woNumber,
      productStyle: card.productStyle,
      department: card.stageName || card.department,
      targetQty: Number(card.inputQuantity || 0),
      producedQty: Number(card.completedQuantity || 0),
      status: card.status,
      lastUpdated: new Date()
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function createManufacturingFlowFromBom(bom) {
  const plannedQty = Number(bom.baseQuantity || 1);
  const woNumber = `WO-${bom.bomNo}`;
  const multiplier = plannedQty / Number(bom.baseQuantity || 1);
  const requiredMaterials = (bom.materials || []).map((line) => ({
    materialName: line.materialName,
    category: line.category,
    requiredQuantity: Number((Number(line.totalRequired || 0) * multiplier).toFixed(3)),
    reservedQuantity: 0,
    consumedQuantity: 0,
    unit: line.unit
  }));

  let workOrder = await WorkOrder.findOne({ woNumber });
  if (!workOrder) {
    workOrder = await WorkOrder.create({
      woNumber,
      product: bom.product,
      variant: bom.variant,
      productStyle: bom.productName,
      department: 'Cutting',
      priority: 'Medium',
      plannedQty,
      status: 'Pending',
      dueDate: new Date(Date.now() + 7 * 86400000),
      producedQty: 0,
      rejectedQty: 0,
      completedQty: 0,
      requiredMaterials,
      trendDate: new Date()
    });
  }

  const existingCards = await JobCard.find({ woNumber });
  if (!existingCards.length) {
    const cards = await JobCard.insertMany(productionStages.map((stage, index) => ({
      jobCardNumber: `${woNumber}-${String(index + 1).padStart(2, '0')}-${stage.toUpperCase()}`,
      workOrder: workOrder._id,
      woNumber,
      productStyle: bom.productName,
      stageName: stage,
      department: stage,
      assignedTo: `${stage} Team`,
      inputQuantity: index === 0 ? plannedQty : 0,
      pendingQuantity: index === 0 ? plannedQty : 0,
      completedQuantity: 0,
      rejectedQuantity: 0,
      reworkQuantity: 0,
      dueDate: workOrder.dueDate,
      priority: 'Medium',
      status: 'Pending',
      progress: 0,
      trendDate: new Date()
    })));
    await Promise.all(cards.map(createTrackingForCard));
  }

  return workOrder;
}

exports.list = asyncHandler(async (req, res) => {
  const { search = '', status, productName, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ bomNo: new RegExp(search, 'i') }, { productName: new RegExp(search, 'i') }, { productSku: new RegExp(search, 'i') }, { variantSku: new RegExp(search, 'i') }];
  if (status && status !== 'All Status') filter.status = status;
  if (productName && productName !== 'All Products') filter.productName = productName;
  const perPage = Number(limit);
  const skip = (Number(page) - 1) * perPage;
  const [items, total] = await Promise.all([
    BillOfMaterial.find(filter).populate('product variant').sort('-createdAt').skip(skip).limit(perPage),
    BillOfMaterial.countDocuments(filter)
  ]);
  ok(res, { items, total, page: Number(page), pages: Math.ceil(total / perPage) });
});

exports.create = asyncHandler(async (req, res) => {
  const product = req.body.product ? await Product.findById(req.body.product) : await Product.findOne({ name: req.body.productName });
  const variant = req.body.variant ? await ProductVariant.findById(req.body.variant) : req.body.variantSku ? await ProductVariant.findOne({ sku: req.body.variantSku }) : null;
  const payload = applyTotals({
    ...req.body,
    product: req.body.product || product?._id,
    variant: req.body.variant || variant?._id,
    productName: req.body.productName || product?.name,
    productSku: req.body.productSku || product?.sku,
    variantSku: req.body.variantSku || variant?.sku,
    category: req.body.category || product?.category || variant?.category,
    department: req.body.department || product?.department
  });
  const bom = await BillOfMaterial.create(payload);
  await Activity.create({ module: 'bom', title: `${bom.bomNo} created`, description: `${bom.productName} BOM created`, dateText: new Date().toLocaleString(), type: 'success' });
  created(res, bom);
});

exports.get = asyncHandler(async (req, res) => ok(res, await BillOfMaterial.findById(req.params.id).populate('product variant')));

exports.update = asyncHandler(async (req, res) => {
  const bom = await BillOfMaterial.findById(req.params.id);
  if (!bom) throw new Error('BOM not found');
  Object.assign(bom, applyTotals({ ...bom.toObject(), ...req.body }));
  await bom.save();
  ok(res, bom);
});

exports.remove = asyncHandler(async (req, res) => {
  await BillOfMaterial.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
});

exports.approve = asyncHandler(async (req, res) => {
  const bom = await BillOfMaterial.findById(req.params.id);
  if (!bom) throw new Error('BOM not found');
  bom.status = 'Active';
  bom.approvedBy = req.user?.name || 'System';
  bom.approvedAt = new Date();
  await bom.save();
  const workOrder = await createManufacturingFlowFromBom(bom);
  await Activity.create({ module: 'bom', title: `${bom.bomNo} approved`, description: `${bom.productName} BOM activated`, dateText: new Date().toLocaleString(), type: 'success' });
  await Activity.create({ module: 'manufacturing-overview', title: `${workOrder.woNumber} pending approval`, description: `${bom.productName} work order is ready for approval`, dateText: new Date().toLocaleString(), type: 'warning' });
  ok(res, { bom, workOrder }, 'BOM approved and work order pending approval');
});

exports.stats = asyncHandler(async (req, res) => {
  const rows = await BillOfMaterial.find();
  ok(res, {
    total: rows.length,
    active: rows.filter((row) => row.status === 'Active').length,
    draft: rows.filter((row) => row.status === 'Draft').length,
    inactive: rows.filter((row) => row.status === 'Inactive').length,
    totalMaterialCost: rows.reduce((sum, row) => sum + row.materialCost, 0),
    totalCost: rows.reduce((sum, row) => sum + row.totalCost, 0)
  });
});

exports.activities = asyncHandler(async (req, res) => ok(res, await Activity.find({ module: 'bom' }).sort('-createdAt').limit(5)));
