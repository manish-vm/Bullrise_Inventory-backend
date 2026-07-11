exports.notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
};

const fieldLabels = {
  barcode: 'Barcode',
  batchNo: 'Batch number',
  bomNo: 'BOM number',
  code: 'Code',
  damageNo: 'Damage number',
  email: 'Email',
  grnNumber: 'GRN number',
  inspectionId: 'Inspection ID',
  jobCardNumber: 'Job card number',
  mrnNumber: 'Material request number',
  name: 'Name',
  orderNo: 'Order number',
  poNumber: 'PO number',
  productionId: 'Production ID',
  returnNo: 'Return number',
  returnNumber: 'Return number',
  serialNumber: 'Serial number',
  sku: 'SKU',
  supplierCode: 'Supplier code',
  transferNumber: 'Transfer number',
  variantId: 'Variant ID',
  woNumber: 'Work order number',
};

const resourceLabels = {
  attributes: 'attribute',
  categories: 'category',
  variants: 'variant',
};

const formatValue = (value) => {
  if (value === undefined || value === null || value === '') return 'this value';
  return String(value);
};

const fieldFromIndex = (indexName = '') => indexName
  .split('_')
  .find((part) => part && part !== '1' && part !== '-1' && part !== 'dup');

const duplicateFieldEntry = (keyValue = {}, indexName = '') => {
  const entries = Object.entries(keyValue);
  return entries.find(([field, value]) => fieldLabels[field] && typeof value !== 'object')
    || entries.find(([, value]) => typeof value !== 'object')
    || entries[0]
    || [fieldFromIndex(indexName), undefined];
};

const duplicateMessage = (err, req) => {
  const [field, value] = duplicateFieldEntry(err.keyValue, err.index);
  const fieldLabel = fieldLabels[field] || String(field || 'Value').replace(/([a-z])([A-Z])/g, '$1 $2');
  const valueText = formatValue(value);
  const resourceLabel = resourceLabels[req?.params?.resource];

  if (resourceLabel && field === 'name') {
    return `The ${resourceLabel} ${valueText} is already present.`;
  }

  return `${fieldLabel} ${valueText} is already present.`;
};

const validationMessage = (err) => {
  const errors = Object.values(err.errors || {});
  const first = errors[0];
  if (!first) return 'Please check the details and try again.';
  const fieldLabel = fieldLabels[first.path] || first.path;
  if (first.kind === 'required') return `${fieldLabel} is required.`;
  if (first.kind === 'enum') return `${fieldLabel} has an invalid value.`;
  return first.message || 'Please check the details and try again.';
};

exports.errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Server Error';

  if (err.code === 11000) {
    statusCode = 409;
    message = duplicateMessage(err, req);
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = validationMessage(err);
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'The selected record could not be found. Please refresh and try again.';
  }

  res.status(statusCode).json({ success: false, message });
};
