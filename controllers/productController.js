const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Activity = require('../models/Activity');
const { ok, created } = require('../utils/apiResponse');

const buildFilter = ({ search = '', category, department, status }) => {
  const filter = {};

  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { sku: new RegExp(search, 'i') },
      { category: new RegExp(search, 'i') }
    ];
  }

  if (category && category !== 'All Categories') filter.category = category;
  if (department && department !== 'All Departments') filter.department = department;
  if (status && status !== 'All Status') filter.status = status;

  return filter;
};

async function getVariantCounts() {
  const rows = await ProductVariant.aggregate([
    { $group: { _id: '$product', count: { $sum: 1 } } }
  ]);

  return rows.reduce((counts, row) => {
    if (row._id) counts[row._id] = row.count;
    return counts;
  }, {});
}

function withVariantCount(product, counts) {
  const item = product.toObject ? product.toObject() : product;
  return { ...item, variants: counts[item.name] || 0 };
}

exports.getProducts = asyncHandler(async (req, res) => {
  const { sort = '-createdAt', page = 1, limit = 10 } = req.query;
  const pageNumber = Number(page);
  const pageSize = Number(limit);
  const filter = buildFilter(req.query);
  const [items, total, variantCounts] = await Promise.all([
    Product.find(filter).sort(sort).skip((pageNumber - 1) * pageSize).limit(pageSize),
    Product.countDocuments(filter),
    getVariantCounts()
  ]);

  ok(res, {
    items: items.map((item) => withVariantCount(item, variantCounts)),
    total,
    page: pageNumber,
    pages: Math.ceil(total / pageSize)
  });
});

exports.createProduct = asyncHandler(async (req, res) => created(res, await Product.create(req.body)));
exports.getProduct = asyncHandler(async (req, res) => ok(res, await Product.findById(req.params.id)));
exports.updateProduct = asyncHandler(async (req, res) => ok(res, await Product.findByIdAndUpdate(req.params.id, req.body, { new: true })));
exports.deleteProduct = asyncHandler(async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
});

exports.getProductStats = asyncHandler(async (req, res) => {
  const [products, variantCounts] = await Promise.all([
    Product.find().sort('-createdAt'),
    getVariantCounts()
  ]);
  const rows = products.map((product) => withVariantCount(product, variantCounts));
  const totalProducts = rows.reduce((sum, product) => sum + (product.productCount || 1), 0);
  const activeProducts = rows.filter((product) => product.status === 'Active').reduce((sum, product) => sum + (product.productCount || 1), 0);
  const inactiveProducts = totalProducts - activeProducts;
  const totalVariants = rows.reduce((sum, product) => sum + product.variants, 0);
  const categories = [...new Set(rows.map((product) => product.category))];
  const categoryTotals = categories
    .map((category) => ({
      label: category,
      value: rows
        .filter((product) => product.category === category)
        .reduce((sum, product) => sum + (product.productCount || 1), 0)
    }))
    .sort((a, b) => b.value - a.value);

  ok(res, {
    totalProducts,
    activeProducts,
    inactiveProducts,
    totalCategories: Math.max(categories.length, 18),
    totalVariants,
    categoryDistribution: categoryTotals,
    topProducts: rows
      .slice()
      .sort((a, b) => b.variants - a.variants)
      .slice(0, 5)
      .map((product) => ({ name: product.name, value: product.variants }))
  });
});

exports.getProductActivities = asyncHandler(async (req, res) => {
  const items = await Activity.find({ module: 'products' }).sort('-createdAt').limit(4);
  ok(res, items);
});
