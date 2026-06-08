require('./config/dns');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ success: true, message: 'Bullrise API running' }));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/material-categories', require('./routes/categoryRoutes'));
app.use('/api/purchase-orders', require('./routes/poRoutes'));
app.use('/api/good-receipts', require('./routes/goodReceiptRoutes'));
app.use('/api/stock-returns', require('./routes/stockReturnRoutes'));
app.use('/api/manufacturing', require('./routes/manufacturingRoutes'));
app.use('/api/production', require('./routes/productionRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/product-catalog', require('./routes/productCatalogRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));

app.use(notFound);
app.use(errorHandler);
module.exports = app;
