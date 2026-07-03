const asyncHandler = require('express-async-handler');
const Activity = require('../models/Activity');
const ProductCategory = require('../models/ProductCategory');
const ProductVariant = require('../models/ProductVariant');
const ProductAttribute = require('../models/ProductAttribute');
const Product = require('../models/Product');
const RawMaterialStock = require('../models/RawMaterialStock');
const MaterialCategory = require('../models/MaterialCategory');
const { ok, created } = require('../utils/apiResponse');

const resources = {
  categories: {
    Model: ProductCategory,
    module: 'product-categories',
    searchFields: ['name', 'description', 'department'],
    defaultSort: '-createdAt'
  },
  variants: {
    Model: ProductVariant,
    module: 'product-variants',
    searchFields: ['variantId', 'product', 'sku', 'category'],
    defaultSort: '-createdAt'
  },
  attributes: {
    Model: ProductAttribute,
    module: 'product-attributes',
    searchFields: ['name', 'type', 'inputType'],
    defaultSort: '-createdAt'
  }
};

const getResource = (req) => resources[req.params.resource];
const classPalette = ['blue', 'green', 'purple', 'orange', 'pink', 'teal', 'yellow', 'rose', 'grey', 'navy', 'denim'];

const nextClassColor = async (Model, id) => {
  const used = await Model.find(id ? { _id: { $ne: id } } : {}).select('color');
  const usedSet = new Set(used.map((row) => row.color).filter(Boolean));
  const unused = classPalette.find((color) => !usedSet.has(color));
  return unused || classPalette[used.length % classPalette.length];
};

const normalizePayload = async (resourceKey, Model, body, id) => {
  const payload = { ...body };
  if (['attributes', 'categories', 'variants'].includes(resourceKey) && !id) payload.color = await nextClassColor(Model);
  return payload;
};

async function syncCategoryQuantityToRawStock(category) {
  if (!category?.name) return null;
  return RawMaterialStock.findOneAndUpdate(
    { $or: [{ materialName: category.name }, { category: category.name }] },
    {
      $setOnInsert: {
        materialName: category.name,
        category: category.name
      },
      $set: {
        availableQuantity: Number(category.products || 0),
        unit: 'm'
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function materialInventoryCategories() {
  const [stockRows, materialItems] = await Promise.all([
    RawMaterialStock.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$category', '$materialName'] },
          products: { $sum: '$availableQuantity' },
          unit: { $first: '$unit' },
          updatedAt: { $max: '$updatedAt' }
        }
      },
      { $match: { _id: { $nin: [null, ''] } } },
      { $sort: { updatedAt: -1, _id: 1 } }
    ]),
    MaterialCategory.find()
  ]);
  const itemMap = new Map(materialItems.map((item) => [item.name, item]));
  return stockRows.map((row, index) => {
    const item = itemMap.get(row._id);
    return {
      _id: `material-${row._id}`,
      name: row._id,
      description: item?.description || 'Auto-created from approved raw material inventory',
      department: 'Material Inventory',
      products: Number(row.products || 0),
      unit: row.unit || item?.unit || 'm',
      status: item?.status || 'Active',
      createdOn: item?.createdAt || row.updatedAt,
      createdAt: item?.createdAt || row.updatedAt,
      updatedAt: row.updatedAt,
      color: item?.color || classPalette[index % classPalette.length]
    };
  });
}

function filterMaterialInventoryCategories(rows, query) {
  const { search = '', status } = query;
  return rows.filter((row) => {
    const matchesSearch = !search || [row.name, row.description, row.department]
      .some((value) => new RegExp(search, 'i').test(String(value || '')));
    const matchesStatus = !status || status === 'All Status' || row.status === status;
    return matchesSearch && matchesStatus;
  });
}

const buildFilter = (resource, query) => {
  const { search = '', status, category, product, type, inputType, department } = query;
  const filter = {};

  if (search) {
    filter.$or = resource.searchFields.map((field) => ({ [field]: new RegExp(search, 'i') }));
  }

  if (status && status !== 'All Status') filter.status = status;
  if (category && category !== 'All Categories') filter.category = category;
  if (product && product !== 'All Products') filter.product = product;
  if (type && type !== 'All Types' && type !== 'All Attributes') filter.type = type;
  if (inputType && inputType !== 'All Input Types') filter.inputType = inputType;
  if (department && department !== 'All Departments') filter.department = department;

  return filter;
};

exports.list = asyncHandler(async (req, res) => {
  const resource = getResource(req);
  if (!resource) return ok(res, { items: [], total: 0, page: 1, pages: 0 });

  const { page = 1, limit = 10, sort = resource.defaultSort } = req.query;
  const pageNumber = Number(page);
  const pageSize = Number(limit);

  if (req.params.resource === 'categories') {
    const rows = filterMaterialInventoryCategories(await materialInventoryCategories(), req.query);
    const items = rows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
    ok(res, { items, total: rows.length, page: pageNumber, pages: Math.ceil(rows.length / pageSize) });
    return;
  }

  const filter = buildFilter(resource, req.query);
  const items = await resource.Model.find(filter).sort(sort).skip((pageNumber - 1) * pageSize).limit(pageSize);
  const total = await resource.Model.countDocuments(filter);

  ok(res, { items, total, page: pageNumber, pages: Math.ceil(total / pageSize) });
});

exports.create = asyncHandler(async (req, res) => {
  const resource = getResource(req);
  if (req.params.resource === 'categories') throw new Error('Product categories are created automatically from approved material inventory.');
  const item = await resource.Model.create(await normalizePayload(req.params.resource, resource.Model, req.body));
  created(res, item);
});

exports.update = asyncHandler(async (req, res) => {
  const resource = getResource(req);
  if (req.params.resource === 'categories') throw new Error('Product categories are updated automatically from approved material inventory.');
  const payload = await normalizePayload(req.params.resource, resource.Model, req.body, req.params.id);
  const item = await resource.Model.findByIdAndUpdate(req.params.id, payload, { new: true });
  ok(res, item);
});

exports.remove = asyncHandler(async (req, res) => {
  const resource = getResource(req);
  if (req.params.resource === 'categories') throw new Error('Product categories are removed automatically when material inventory changes.');
  await resource.Model.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
});

exports.stats = asyncHandler(async (req, res) => {
  const resource = getResource(req);
  const rows = await resource.Model.find();

  if (req.params.resource === 'categories') {
    const materialRows = await materialInventoryCategories();
    const totalProducts = materialRows.reduce((sum, row) => sum + row.products, 0);
    const active = materialRows.filter((row) => row.status === 'Active').length;
    ok(res, {
      total: materialRows.length,
      active,
      inactive: materialRows.length - active,
      totalProducts,
      distribution: materialRows.map((row) => ({ label: row.name, value: row.products })).sort((a, b) => b.value - a.value),
      top: materialRows.slice().sort((a, b) => b.products - a.products).slice(0, 5).map((row) => ({ name: row.name, value: row.products }))
    });
    return;
  }

  if (req.params.resource === 'legacy-categories') {
    const totalProducts = rows.reduce((sum, row) => sum + row.products, 0);
    const totalVariants = rows.reduce((sum, row) => sum + row.variants, 0);
    const active = rows.filter((row) => row.status === 'Active').length;
    ok(res, {
      total: rows.length,
      active,
      inactive: rows.length - active,
      totalProducts,
      totalVariants,
      distribution: rows.map((row) => ({ label: row.name, value: row.products })).sort((a, b) => b.value - a.value),
      top: rows.slice().sort((a, b) => b.products - a.products).slice(0, 5).map((row) => ({ name: row.name, value: row.products }))
    });
    return;
  }

  if (req.params.resource === 'variants') {
    const [products, categories] = await Promise.all([
      Product.countDocuments(),
      ProductCategory.countDocuments()
    ]);
    const active = rows.filter((row) => row.status === 'Active').length;
    const inactive = rows.length - active;
    ok(res, {
      total: rows.length,
      active,
      inactive,
      totalProducts: products,
      totalCategories: categories,
      distribution: [
        { label: 'Active', value: active },
        { label: 'Inactive', value: inactive }
      ],
      top: rows.slice().sort((a, b) => new Date(b.createdAt || b.createdOn || 0) - new Date(a.createdAt || a.createdOn || 0)).slice(0, 5).map((row) => ({ name: row.sku, value: 1 }))
    });
    return;
  }

  const active = rows.filter((row) => row.status === 'Active').length;
  const system = rows.filter((row) => row.systemAttribute).length;
  const typeMap = rows.reduce((map, row) => {
    map[row.type] = (map[row.type] || 0) + 1;
    return map;
  }, {});
  ok(res, {
    total: rows.length,
    active,
    inactive: rows.length - active,
    usedInVariants: rows.reduce((sum, row) => sum + Number(row.usedInVariants || 0), 0),
    systemAttributes: system,
    distribution: Object.entries(typeMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    top: rows
      .map((row) => ({
        name: row.name,
        value: String(row.values || '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item && item !== '-').length
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  });
});

exports.activities = asyncHandler(async (req, res) => {
  const resource = getResource(req);
  const items = await Activity.find({ module: resource.module }).sort('-createdAt').limit(4);
  ok(res, items);
});
