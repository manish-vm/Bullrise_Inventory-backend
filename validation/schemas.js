const status = {
  active: ['Active', 'Inactive'],
  po: ['Open', 'Partially Received', 'Completed', 'Cancelled'],
  poLine: ['Open', 'Partially Received', 'Completed', 'Rejected'],
  grn: ['Completed', 'Under QC', 'Pending', 'Rejected'],
  purchaseType: ['Raw Material Purchase', 'Ready Product Purchase', 'Readymade Product Purchase', 'E-Commerce Purchase'],
  paymentMode: ['Cash', 'Credit'],
  transferStatus: ['Not Transferred', 'Ready To Transfer', 'Transferred'],
  stockReturn: ['Approved', 'Pending', 'Rejected', 'Draft'],
  workOrder: ['Draft', 'Approved', 'Completed', 'In Progress', 'Pending', 'Overdue'],
  priority: ['High', 'Medium', 'Low'],
  qc: ['Passed', 'Minor Defect', 'Major Defect', 'Pending'],
  label: ['Pending Print', 'Printed'],
  itemType: ['RAW_MATERIAL', 'FINISHED_GOOD'],
  direction: ['IN', 'OUT'],
  source: ['POS', 'ONLINE'],
  sale: ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
  condition: ['Good', 'Damaged', 'Repairable', 'Scrap'],
  returnDecision: ['Restock', 'Damage', 'Repair', 'Scrap'],
  returnStatus: ['Pending QC', 'Processed', 'Rejected'],
  warehouse: ['Active', 'Inactive', 'Maintenance'],
  location: ['Active', 'Inactive', 'Full'],
  bom: ['Draft', 'Active', 'Inactive'],
  department: ['Cutting', 'Stitching', 'Finishing', 'QC', 'Packing'],
  damageDecision: ['Damage', 'Scrap', 'Repair'],
  roles: ['Super Admin', 'Admin', 'Warehouse Manager', 'Production Manager', 'QC Inspector', 'Sales Staff'],
};

const id = { type: 'objectId' };
const str = (required = false) => ({ type: 'string', required, min: required ? 1 : undefined });
const num = (required = false, min = 0) => ({ type: 'number', required, min });
const date = { type: 'date' };

const poItem = {
  lineNo: num(false),
  materialName: str(),
  category: str(),
  quantity: num(false),
  unit: str(),
  unitPrice: num(false),
  amount: num(false),
  receivedQuantity: num(false),
  rejectedQuantity: num(false),
  balanceQuantity: num(false),
  status: { type: 'string', enum: status.poLine },
};

const grnItem = {
  poLineNo: num(false),
  materialName: str(),
  category: str(),
  orderedQuantity: num(false),
  receivedQuantity: num(false),
  acceptedQuantity: num(false),
  rejectedQuantity: num(false),
  unit: str(),
  unitCost: num(false),
  totalValue: num(false),
  batchNo: str(),
  remarks: str(),
};

const bomMaterial = {
  lineNo: num(false),
  materialName: str(true),
  category: str(),
  unit: str(),
  quantityPerUnit: num(false),
  wastagePercent: num(false),
  unitCost: num(false),
  requiredForQty: num(false, 1),
  totalRequired: num(false),
  totalCost: num(false),
  notes: str(),
};

const salesItem = {
  sku: str(true),
  productName: str(),
  quantity: num(true, 1),
  price: num(false),
  discount: num(false),
  tax: num(false),
};

module.exports = {
  login: { email: str(true), password: str(true) },
  userCreate: { name: str(true), email: str(true), phone: str(), role: { type: 'string', enum: status.roles }, status: { type: 'string', enum: status.active }, password: str(true) },
  userUpdate: { name: str(), email: str(), phone: str(), role: { type: 'string', enum: status.roles }, status: { type: 'string', enum: status.active }, password: str() },
  supplier: {
    supplierCode: str(), name: str(true), initials: str(), contactPerson: str(true), designation: str(),
    category: str(true), city: str(), phone: str(true), email: str(true), status: { type: 'string', enum: status.active }, ordersCount: num(false),
  },
  materialCategory: {
    name: str(true), description: str(true), totalMaterials: num(false), lowStockItems: num(false), unit: str(), icon: str(), color: str(), status: { type: 'string', enum: status.active },
  },
  product: {
    name: str(true), sku: str(true), collectionName: str(true), category: str(true), department: str(),
    baseUnit: str(), productCount: num(false), variants: num(false), status: { type: 'string', enum: status.active }, createdOn: date, color: str(),
  },
  productCategory: {
    name: str(true), description: str(true), department: str(true), products: num(false), variants: num(false), status: { type: 'string', enum: status.active }, createdOn: date, color: str(),
  },
  productVariant: {
    variantId: str(true), product: str(true), category: str(true), attributes: str(true), sku: str(true), price: num(false), stock: num(false), status: { type: 'string', enum: status.active }, createdOn: date, color: str(),
  },
  productAttribute: {
    name: str(true), type: str(true), inputType: str(true), values: str(), extraValues: num(false), usedInVariants: num(false), systemAttribute: { type: 'boolean' }, status: { type: 'string', enum: status.active }, createdOn: date, color: str(),
  },
  purchaseOrder: {
    poNumber: str(), quotationNumber: str(), quotationDate: date, purchaseType: { type: 'string', enum: status.purchaseType }, paymentMode: { type: 'string', enum: status.paymentMode }, creditDays: num(false),
    supplier: { ...id, required: true }, supplierName: str(), category: str(), orderDate: date, expectedDate: date,
    totalAmount: num(false), orderedQuantity: num(false), receivedQuantity: num(false), status: { type: 'string', enum: status.po },
    items: { type: 'array', of: poItem },
  },
  goodReceipt: {
    grnNumber: str(), poNumber: str(), supplier: id, supplierName: str(), category: str(), receiptDate: date, goodsReceivedDate: date,
    itemsCount: num(false), quantity: num(false), unit: str(), receivedBy: str(), qcInspector: str(), receiptValue: num(false), items: { type: 'array', of: grnItem },
    transferStatus: { type: 'string', enum: status.transferStatus }, status: { type: 'string', enum: status.grn },
  },
  goodReceiptApproval: { items: { type: 'array', of: grnItem }, remarks: str(), approvalRemarks: str() },
  stockReturn: {
    returnNumber: str(true), poNumber: str(), grnNumber: str(), supplier: id, supplierName: str(), category: str(), returnDate: date,
    itemsCount: num(false), quantity: num(false), unit: str(), returnValue: num(false), reason: str(true), status: { type: 'string', enum: status.stockReturn },
  },
  bom: {
    bomNo: str(true), product: id, variant: id, productName: str(true), productSku: str(), variantSku: str(), styleCode: str(), category: str(), department: str(),
    baseQuantity: num(false, 1), materials: { type: 'array', min: 1, of: bomMaterial }, materialCost: num(false), wastageCost: num(false), totalCost: num(false),
    version: num(false, 1), status: { type: 'string', enum: status.bom }, remarks: str(),
  },
  warehouse: { name: str(true), code: str(true), location: str(), type: str(), totalCapacity: num(false), usedCapacity: num(false), stockUnits: num(false), stockValue: num(false), stockInUnits: num(false), stockOutUnits: num(false), color: str(), status: { type: 'string', enum: status.warehouse } },
  location: { warehouse: { ...id, required: true }, warehouseCode: str(), name: str(true), code: str(true), type: str(), capacity: num(false), usedCapacity: num(false), status: { type: 'string', enum: status.location } },
  barcodeLabel: { sku: str(true), barcode: str(true), productName: str(), quantity: num(false, 1), labelStatus: { type: 'string', enum: status.label }, referenceType: str(), referenceId: str() },
  barcodePrinted: { ids: { type: 'array', min: 1, of: { value: id } } },
  finishedGoodsStock: {
    productName: str(), sku: str(), barcode: str(), size: str(), color: str(),
    availableQuantity: num(false), reservedQuantity: num(false), damagedQuantity: num(false), returnedQuantity: num(false),
    totalQuantity: num(false), unitCost: num(false), sellingPrice: num(false), reorderLevel: num(false),
    status: { type: 'string', enum: ['In Stock', 'Low Stock', 'Out of Stock'] },
  },
  stockTransaction: { itemType: { type: 'string', required: true, enum: status.itemType }, stockId: { ...id, required: true }, quantity: num(true, 1), destinationWarehouse: id, destinationLocation: id, remarks: str(), reason: str(), direction: { type: 'string', enum: status.direction } },
  stockTransfer: { itemType: { type: 'string', required: true, enum: status.itemType }, stockId: { ...id, required: true }, quantity: num(true, 1), destinationWarehouse: { ...id, required: true }, destinationLocation: id, remarks: str() },
  workOrder: { woNumber: str(true), bomId: id, product: id, variant: id, productStyle: str(), department: str(), priority: { type: 'string', enum: status.priority }, plannedQty: num(false), completedQty: num(false), status: { type: 'string', enum: status.workOrder }, startDate: date, endDate: date, dueDate: date },
  qcInspection: { inspectionId: str(true), woNumber: str(), productStyle: str(), department: str(), inspectionType: str(), inspectedQty: num(false), passedQty: num(false), rejectedQuantity: num(false), reworkQuantity: num(false), defects: num(false), defectType: str(), defectNotes: str(), sku: str(), size: str(), color: str(), status: { type: 'string', enum: status.qc }, inspectionDate: date },
  stageUpdate: { completedQuantity: num(false), rejectedQuantity: num(false), reworkQuantity: num(false), damageDecision: { type: 'string', enum: status.damageDecision }, remarks: str() },
  qcPostStock: { passedQuantity: num(false), rejectedQuantity: num(false), reworkQuantity: num(false) },
  sale: { orderNo: str(true), customerName: str(true), customerPhone: str(), source: { type: 'string', enum: status.source }, items: { type: 'array', required: true, min: 1, of: salesItem } },
  saleStatus: { status: { type: 'string', required: true, enum: status.sale } },
  customerReturn: { returnNo: str(true), order: id, orderNo: str(), sku: str(true), quantity: num(true, 1), reason: str(), condition: { type: 'string', enum: status.condition }, decision: { type: 'string', enum: status.returnDecision }, status: { type: 'string', enum: status.returnStatus }, remarks: str() },
  customerReturnProcess: { decision: { type: 'string', enum: status.returnDecision } },
};
