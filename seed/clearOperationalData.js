require('../config/dns');
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Activity = require('../models/Activity');
const BarcodeLabel = require('../models/BarcodeLabel');
const BillOfMaterial = require('../models/BillOfMaterial');
const CustomerReturn = require('../models/CustomerReturn');
const FinishedGoodsStock = require('../models/FinishedGoodsStock');
const GoodReceipt = require('../models/GoodReceipt');
const JobCard = require('../models/JobCard');
const ManufacturingWorkOrder = require('../models/ManufacturingWorkOrder');
const MaterialBatch = require('../models/MaterialBatch');
const MaterialCategory = require('../models/MaterialCategory');
const MaterialRequest = require('../models/MaterialRequest');
const Product = require('../models/Product');
const ProductAttribute = require('../models/ProductAttribute');
const ProductCategory = require('../models/ProductCategory');
const Production = require('../models/Production');
const ProductionDamage = require('../models/ProductionDamage');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionTracking = require('../models/ProductionTracking');
const ProductVariant = require('../models/ProductVariant');
const PurchaseOrder = require('../models/PurchaseOrder');
const QCInspection = require('../models/QCInspection');
const RawMaterialStock = require('../models/RawMaterialStock');
const SalesOrder = require('../models/SalesOrder');
const SerialInventory = require('../models/SerialInventory');
const SKU = require('../models/SKU');
const StockMovement = require('../models/StockMovement');
const StockReturn = require('../models/StockReturn');
const Supplier = require('../models/Supplier');
const Warehouse = require('../models/Warehouse');
const WarehouseLocation = require('../models/WarehouseLocation');
const WarehouseTransfer = require('../models/WarehouseTransfer');

const collectionsToClear = [
  Activity,
  BarcodeLabel,
  BillOfMaterial,
  CustomerReturn,
  FinishedGoodsStock,
  GoodReceipt,
  JobCard,
  ManufacturingWorkOrder,
  MaterialBatch,
  MaterialCategory,
  MaterialRequest,
  Product,
  ProductAttribute,
  ProductCategory,
  Production,
  ProductionDamage,
  ProductionPlan,
  ProductionTracking,
  ProductVariant,
  PurchaseOrder,
  QCInspection,
  RawMaterialStock,
  SalesOrder,
  SerialInventory,
  SKU,
  StockMovement,
  StockReturn,
  Supplier,
  Warehouse,
  WarehouseLocation,
  WarehouseTransfer
];

async function clearOperationalData() {
  await connectDB();

  const results = await Promise.all(collectionsToClear.map(async (model) => {
    const result = await model.deleteMany({});
    return { collection: model.collection.name, deleted: result.deletedCount || 0 };
  }));

  const totalDeleted = results.reduce((sum, row) => sum + row.deleted, 0);
  console.table(results);
  console.log(`Operational reset completed. Deleted ${totalDeleted} documents. Users were preserved.`);
  await mongoose.connection.close();
}

clearOperationalData().catch(async (error) => {
  console.error('Operational reset failed:', error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
