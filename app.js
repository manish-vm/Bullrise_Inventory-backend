require('./config/dns');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { allowRoles, protect } = require('./middleware/authMiddleware');

const app = express();
const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '');
const allowedOrigins = String(process.env.CLIENT_URL || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked origin: ${origin}`));
  },
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ success: true, message: 'Bullrise API running' }));
app.use('/api/auth', require('./routes/authRoutes'));

app.use('/api/suppliers', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager', 'Production Manager'), require('./routes/supplierRoutes'));
app.use('/api/material-categories', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager', 'Production Manager'), require('./routes/categoryRoutes'));
app.use('/api/purchase-orders', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager', 'Production Manager'), require('./routes/poRoutes'));
app.use('/api/good-receipts', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager'), require('./routes/goodReceiptRoutes'));
app.use('/api/stock-returns', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager'), require('./routes/stockReturnRoutes'));
app.use('/api/manufacturing', protect, allowRoles('Super Admin', 'Admin', 'Production Manager', 'QC Inspector'), require('./routes/manufacturingRoutes'));
app.use('/api/production', protect, allowRoles('Super Admin', 'Admin', 'Production Manager'), require('./routes/productionRoutes'));
app.use('/api/products', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager', 'Production Manager', 'Sales Staff'), require('./routes/productRoutes'));
app.use('/api/product-catalog', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager', 'Production Manager', 'Sales Staff'), require('./routes/productCatalogRoutes'));
app.use('/api/boms', protect, allowRoles('Super Admin', 'Admin', 'Production Manager'), require('./routes/bomRoutes'));
app.use('/api/warehouses', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager'), require('./routes/warehouseRoutes'));
app.use('/api/inventory', protect, allowRoles('Super Admin', 'Admin', 'Warehouse Manager', 'Production Manager', 'Sales Staff'), require('./routes/inventoryRoutes'));
app.use('/api/sales', protect, allowRoles('Super Admin', 'Admin', 'Sales Staff'), require('./routes/salesRoutes'));
app.use('/api/customer-returns', protect, allowRoles('Super Admin', 'Admin', 'Sales Staff'), require('./routes/customerReturnRoutes'));
app.use('/api/reports', protect, allowRoles('Super Admin', 'Admin'), require('./routes/reportRoutes'));

app.use(notFound);
app.use(errorHandler);
module.exports = app;
