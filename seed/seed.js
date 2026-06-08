require('../config/dns');
require('dotenv').config();
const connectDB = require('../config/db');
const Supplier = require('../models/Supplier');
const MaterialCategory = require('../models/MaterialCategory');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodReceipt = require('../models/GoodReceipt');
const StockReturn = require('../models/StockReturn');
const WorkOrder = require('../models/ManufacturingWorkOrder');
const QCInspection = require('../models/QCInspection');
const ProductionTracking = require('../models/ProductionTracking');
const ProductionPlan = require('../models/ProductionPlan');
const JobCard = require('../models/JobCard');
const Production = require('../models/Production');
const Activity = require('../models/Activity');
const Product = require('../models/Product');
const ProductCategory = require('../models/ProductCategory');
const ProductVariant = require('../models/ProductVariant');
const ProductAttribute = require('../models/ProductAttribute');
const Warehouse = require('../models/Warehouse');

const suppliers = [
 ['SUP-001','ABC Textiles Ltd.','AT','Arvind Kumar','Manager','Fabrics','+91 98765 43210','arvind@abctextiles.com','Active',18],
 ['SUP-002','XYZ Mills','XY','Ramesh Patel','Director','Fabrics','+91 91234 56789','ramesh@xyzmills.com','Active',15],
 ['SUP-003','PQR Threads','PT','Priya Sharma','Sales Head','Threads','+91 99887 66554','priya@pqrthreads.com','Active',12],
 ['SUP-004','Dye Chem Pvt. Ltd.','DC','Deepak Singh','Manager','Dyes & Chemicals','+91 97654 32109','deepak@dyechem.com','Inactive',8],
 ['SUP-005','S. Marketing','SM','Sanjay Mehta','Proprietor','Accessories','+91 94567 89012','sanjay@smarketing.com','Active',6],
 ['SUP-006','Laxmi Group','LG','Meena Joshi','Manager','Packaging','+91 90011 22334','meena@laxmigroup.com','Active',4],
 ['SUP-007','Gujrat Traders','GT','Harish Bhatt','Partner','Interlinings','+91 93221 44332','harish@gujrattraders.com','Inactive',3],
 ['SUP-008','Navyam Industries','NV','Nitin Verma','CEO','Elastics','+91 99123 44567','nitin@navyam.com','Active',2]
].map(s => ({supplierCode:s[0],name:s[1],initials:s[2],contactPerson:s[3],designation:s[4],category:s[5],phone:s[6],email:s[7],status:s[8],ordersCount:s[9]}));

const cats = [
 ['Fabrics','All types of fabric materials used in production.',450,6,'roll','orange','Active'],
 ['Threads','Sewing threads, yarns and stitching materials.',300,2,'thread','pink','Active'],
 ['Dyes & Chemicals','Dyes, chemicals and finishing agents.',120,3,'flask','blue','Active'],
 ['Trims & Accessories','Buttons, zippers, labels and accessories.',180,4,'button','yellow','Active'],
 ['Labels & Tags','Brand labels, care labels and hanging tags.',100,1,'tag','purple','Active'],
 ['Packaging','Packing materials and poly bags, cartons etc.',100,2,'box','orange','Active'],
 ['Adhesives','Glues, tapes and bonding materials.',80,0,'tape','green','Active'],
 ['Elastics','Elastic bands and stretchable materials.',70,0,'elastic','pink','Active'],
 ['Interlinings','Interlining, fusing and bonding sheets.',50,0,'fabric','green','Active'],
 ['Embroidery Materials','Embroidery threads, needles and stabilizers.',40,0,'needle','purple','Active'],
 ['Cleaning Supplies','Cleaning agents and maintenance supplies.',30,0,'clean','orange','Active'],
 ['Leather & Faux Leather','Leather, PU leather and synthetic alternatives.',20,0,'leather','brown','Inactive']
].map(c => ({name:c[0],description:c[1],totalMaterials:c[2],lowStockItems:c[3],icon:c[4],color:c[5],status:c[6]}));

const products = [
 ["Men's T-Shirt",'TSH-001','Premium Cotton','T-Shirts','Cutting','Pcs',399,12,'Active','2025-05-20','green'],
 ['Hoodie','HD-002','Winter Collection','Hoodies','Stitching','Pcs',224,8,'Active','2025-05-18','navy'],
 ["Men's Polo",'PL-003','Classic Fit','Polo Shirts','Finishing','Pcs',187,10,'Active','2025-05-17','white'],
 ["Women's Top",'TOP-004','Casual Wear','Tops','Cutting','Pcs',86,15,'Active','2025-05-16','pink'],
 ['Denim Jacket','DJ-005','Denim Collection','Jackets','Stitching','Pcs',63,6,'Active','2025-05-15','denim'],
 ['Track Pants','TRP-006','Sports Wear','Bottom Wear','Cutting','Pcs',143,9,'Inactive','2025-05-14','black'],
 ['Sweatshirt','SWT-007','Winter Collection','Sweatshirts','Finishing','Pcs',51,7,'Active','2025-05-13','teal'],
 ['Kids T-Shirt','KTS-008','Kids Wear','Kids Wear','Stitching','Pcs',95,11,'Active','2025-05-12','yellow']
].map(p => ({name:p[0],sku:p[1],collectionName:p[2],category:p[3],department:p[4],baseUnit:p[5],productCount:p[6],variants:p[7],status:p[8],createdOn:new Date(p[9]),color:p[10]}));

const productCategories = [
 ['T-Shirts','All types of T-shirts for men, women and kids','Cutting',399,1050,'Active','2025-05-20','green'],
 ['Hoodies','Hoodies and sweatshirts collection','Stitching',224,620,'Active','2025-05-18','blue'],
 ['Shirts','Casual, formal and dress shirts','Finishing',187,480,'Active','2025-05-17','orange'],
 ['Bottom Wear','Pants, jeans, shorts and trousers','Cutting',249,690,'Active','2025-05-16','purple'],
 ['Jackets','Denim, bomber, leather and winter jackets','Stitching',132,360,'Active','2025-05-15','pink'],
 ['Dresses','Women dresses and tunics','Finishing',81,220,'Active','2025-05-14','rose'],
 ['Polo Shirts','Polo shirts and pique polos','Finishing',98,250,'Active','2025-05-13','teal'],
 ['Kids Wear','All kids clothing items','Stitching',58,160,'Inactive','2025-05-10','yellow'],
 ['Accessories','Caps, belts, socks and other accessories','Cutting',20,130,'Active','2025-05-09','blue'],
 ['Innerwear','Briefs, trunks, vests and innerwear','Finishing',0,0,'Inactive','2025-05-08','purple']
].map(c => ({name:c[0],description:c[1],department:c[2],products:c[3],variants:c[4],status:c[5],createdOn:new Date(c[6]),color:c[7]}));

const productVariants = [
 ['VAR-2025-0001',"Men's T-Shirt",'T-Shirts','Size: M, Color: Black','TSH-M-BLK',12,150,'Active','2025-05-20','black'],
 ['VAR-2025-0002',"Men's T-Shirt",'T-Shirts','Size: L, Color: Black','TSH-L-BLK',12,120,'Active','2025-05-20','black'],
 ['VAR-2025-0003',"Men's T-Shirt",'T-Shirts','Size: M, Color: White','TSH-M-WHT',12,200,'Active','2025-05-20','white'],
 ['VAR-2025-0004',"Men's Polo",'Shirts','Size: M, Color: Navy','PL-M-NVY',18,80,'Active','2025-05-19','navy'],
 ['VAR-2025-0005',"Men's Polo",'Shirts','Size: L, Color: Navy','PL-L-NVY',18,70,'Active','2025-05-19','navy'],
 ['VAR-2025-0006','Hoodie','Hoodies','Size: M, Color: Grey','HD-M-GRY',28,60,'Active','2025-05-18','grey'],
 ['VAR-2025-0007','Hoodie','Hoodies','Size: L, Color: Grey','HD-L-GRY',28,50,'Active','2025-05-18','grey'],
 ['VAR-2025-0008','Denim Jacket','Jackets','Size: M, Color: Blue','DJ-M-BLU',45,40,'Active','2025-05-17','denim'],
 ['VAR-2025-0009','Denim Jacket','Jackets','Size: L, Color: Blue','DJ-L-BLU',45,35,'Inactive','2025-05-17','denim'],
 ['VAR-2025-0010',"Women's Top",'Tops','Size: M, Color: Pink','TOP-M-PNK',15,90,'Active','2025-05-16','pink']
].map(v => ({variantId:v[0],product:v[1],category:v[2],attributes:v[3],sku:v[4],price:v[5],stock:v[6],status:v[7],createdOn:new Date(v[8]),color:v[9]}));

const productAttributes = [
 ['Color','List','Dropdown','Black, White, Navy, Grey',8,1248,true,'Active','2025-05-20','purple'],
 ['Size','List','Dropdown','XS, S, M, L, XL, XXL',2,1248,true,'Active','2025-05-20','green'],
 ['Material','List','Dropdown','Cotton, Polyester, Linen',4,980,true,'Active','2025-05-19','orange'],
 ['Weight','Numeric','Number','-',0,320,false,'Active','2025-05-18','blue'],
 ['Pattern','List','Dropdown','Solid, Striped, Checked',5,540,false,'Active','2025-05-18','pink'],
 ['Fit','List','Dropdown','Regular, Slim, Relaxed',2,610,false,'Active','2025-05-17','teal'],
 ['Brand','List','Dropdown','Bullrise, Nike, Adidas',6,450,false,'Inactive','2025-05-16','purple'],
 ['GSM','Numeric','Number','-',0,210,false,'Active','2025-05-15','orange'],
 ['Care Instructions','Text','Text Area','-',0,305,false,'Active','2025-05-15','blue'],
 ['Season','List','Dropdown','Summer, Winter, All Season',1,275,false,'Inactive','2025-05-14','grey']
].map(a => ({name:a[0],type:a[1],inputType:a[2],values:a[3],extraValues:a[4],usedInVariants:a[5],systemAttribute:a[6],status:a[7],createdOn:new Date(a[8]),color:a[9]}));

const warehouses = [
 ['Main Warehouse','WH-001','New York, USA','Primary',20000,14250,65430,654300,5250,4180,'#2f80ed','Active'],
 ['Raw Material Warehouse','WH-002','New York, USA','Raw Material',15000,8650,28760,287600,2860,1660,'#16c784','Active'],
 ['Finished Goods Warehouse','WH-003','Los Angeles, USA','Finished Goods',18000,12480,21980,219800,1920,2240,'#ff9800','Active'],
 ['Accessories Warehouse','WH-004','Chicago, USA','Accessories',10000,6240,7320,73200,1420,980,'#9c27ff','Active'],
 ['Returns Warehouse','WH-005','Miami, USA','Returns',8000,2450,2190,10780,1000,810,'#22b8c7','Active']
].map(w => ({name:w[0], code:w[1], location:w[2], type:w[3], totalCapacity:w[4], usedCapacity:w[5], stockUnits:w[6], stockValue:w[7], stockInUnits:w[8], stockOutUnits:w[9], color:w[10], status:w[11]}));

async function seed(){
 await connectDB();
 await Promise.all([Supplier.deleteMany(), MaterialCategory.deleteMany(), PurchaseOrder.deleteMany(), GoodReceipt.deleteMany(), StockReturn.deleteMany(), WorkOrder.deleteMany(), QCInspection.deleteMany(), ProductionTracking.deleteMany(), ProductionPlan.deleteMany(), JobCard.deleteMany(), Production.deleteMany(), Product.deleteMany(), ProductCategory.deleteMany(), ProductVariant.deleteMany(), ProductAttribute.deleteMany(), Warehouse.deleteMany(), Activity.deleteMany()]);
 const createdSuppliers = await Supplier.insertMany(suppliers);
 await MaterialCategory.insertMany(cats);
 await Product.insertMany(products);
 await ProductCategory.insertMany(productCategories);
 await ProductVariant.insertMany(productVariants);
 await ProductAttribute.insertMany(productAttributes);
 await Warehouse.insertMany(warehouses);
 const dates = ['2025-05-22','2025-05-21','2025-05-20','2025-05-19','2025-05-18','2025-05-17','2025-05-16','2025-05-15'];
 const amounts = [125000,85600,42300,67850,33450,28900,19750,14250];
 const statuses = ['Open','Partially Received','Open','Completed','Completed','Cancelled','Open','Partially Received'];
 for(let i=0;i<8;i++){
   const s = createdSuppliers[i];
   await PurchaseOrder.create({poNumber:`PO-2025-${1024-i}`, supplier:s._id, supplierName:s.name, category:s.category, orderDate:new Date(dates[i]), expectedDate:new Date(Date.parse(dates[i])+6*86400000), totalAmount:amounts[i], status:statuses[i], items:[{materialName:s.category, category:s.category, quantity:100, unitPrice:amounts[i]/100, amount:amounts[i]}]});
 }
 const goodReceipts = [
  ['GRN-2025-0086','PO-2025-1024',0,'2025-05-22',5,1250,'m','Ramesh Kumar',225000,'Completed'],
  ['GRN-2025-0085','PO-2025-1023',1,'2025-05-21',4,850,'m','Arvind Kumar',156000,'Completed'],
  ['GRN-2025-0084','PO-2025-1022',2,'2025-05-20',3,620,'kg','Priya Sharma',96500,'Under QC'],
  ['GRN-2025-0083','PO-2025-1021',3,'2025-05-19',6,1100,'kg','Deepak Singh',210000,'Completed'],
  ['GRN-2025-0082','PO-2025-1020',4,'2025-05-18',2,300,'m','Sanjay Mehta',68000,'Under QC'],
  ['GRN-2025-0081','PO-2025-1019',5,'2025-05-17',5,780,'m','Meena Joshi',134700,'Completed'],
  ['GRN-2025-0080','PO-2025-1018',6,'2025-05-16',3,450,'m','Harish Bhatt',72000,'Rejected'],
  ['GRN-2025-0079','PO-2025-1017',7,'2025-05-15',4,690,'m','Nitin Verma',89500,'Completed']
 ].map(r => {
   const s = createdSuppliers[r[2]];
   return {grnNumber:r[0], poNumber:r[1], supplier:s._id, supplierName:s.name, category:s.category, receiptDate:new Date(r[3]), itemsCount:r[4], quantity:r[5], unit:r[6], receivedBy:r[7], receiptValue:r[8], status:r[9]};
 });
 await GoodReceipt.insertMany(goodReceipts);
 const workOrders = [
  ['WO-2025-0128',"Men's T-Shirt",'Cutting',1000,600,'In Progress','2025-05-25',600,18,2.1,'2025-05-22'],
  ['WO-2025-0127','Hoodie','Stitching',800,800,'Completed','2025-05-20',800,12,2.0,'2025-05-20'],
  ['WO-2025-0126',"Men's Polo",'Finishing',500,250,'In Progress','2025-05-24',250,8,2.4,'2025-05-22'],
  ['WO-2025-0125',"Women's Top",'Cutting',700,0,'Pending','2025-05-26',0,0,0,'2025-05-21'],
  ['WO-2025-0124','Denim Jacket','Stitching',300,150,'In Progress','2025-05-23',150,10,3.2,'2025-05-21'],
  ['WO-2025-0123','Sweatshirt','Finishing',600,600,'Completed','2025-05-19',600,15,2.5,'2025-05-19'],
  ['WO-2025-0122','Track Pants','Cutting',900,450,'In Progress','2025-05-27',450,20,2.7,'2025-05-20'],
  ['WO-2025-0121',"Kids T-Shirt",'Stitching',400,0,'Overdue','2025-05-18',0,0,0,'2025-05-18']
 ].map(w => ({woNumber:w[0], productStyle:w[1], department:w[2], plannedQty:w[3], completedQty:w[4], status:w[5], dueDate:new Date(w[6]), producedQty:w[7], rejectedQty:w[8], cycleDays:w[9], trendDate:new Date(w[10])}));
 await WorkOrder.insertMany(workOrders);
 const inspections = [
  ['QC-2025-0328','WO-2025-0128',"Men's T-Shirt",'Cutting','In-Line',1000,920,80,'Stitching Defect','Passed','2025-05-22'],
  ['QC-2025-0327','WO-2025-0127','Hoodie','Stitching','Final',800,780,20,'Measurement','Passed','2025-05-22'],
  ['QC-2025-0326','WO-2025-0126',"Men's Polo",'Finishing','Final',500,430,70,'Fabric Defect','Minor Defect','2025-05-22'],
  ['QC-2025-0325','WO-2025-0125',"Women's Top",'Cutting','In-Line',700,650,50,'Printing Defect','Passed','2025-05-21'],
  ['QC-2025-0324','WO-2025-0124','Denim Jacket','Stitching','In-Line',300,260,40,'Measurement','Minor Defect','2025-05-21'],
  ['QC-2025-0323','WO-2025-0123','Sweatshirt','Finishing','Final',600,540,60,'Others','Passed','2025-05-21'],
  ['QC-2025-0322','WO-2025-0122','Track Pants','Cutting','In-Line',900,820,80,'Stitching Defect','Major Defect','2025-05-20'],
  ['QC-2025-0321','WO-2025-0121',"Kids T-Shirt",'Stitching','Final',400,360,40,'Fabric Defect','Passed','2025-05-20']
 ].map(q => ({inspectionId:q[0], woNumber:q[1], productStyle:q[2], department:q[3], inspectionType:q[4], inspectedQty:q[5], passedQty:q[6], defects:q[7], defectType:q[8], status:q[9], inspectionDate:new Date(q[10])}));
 await QCInspection.insertMany(inspections);
 const productionTracking = [
  ['JC-2025-056','WO-2025-0128',"Men's T-Shirt",'Cutting',1000,600,'In Progress','2025-05-22T10:30:00'],
  ['JC-2025-055','WO-2025-0127','Hoodie','Stitching',800,800,'Completed','2025-05-22T09:15:00'],
  ['JC-2025-054','WO-2025-0126',"Men's Polo",'Finishing',500,250,'In Progress','2025-05-22T11:20:00'],
  ['JC-2025-053','WO-2025-0125',"Women's Top",'Cutting',700,0,'Pending','2025-05-21T10:05:00'],
  ['JC-2025-052','WO-2025-0124','Denim Jacket','Stitching',300,150,'In Progress','2025-05-22T09:50:00'],
  ['JC-2025-051','WO-2025-0123','Sweatshirt','Finishing',600,600,'Completed','2025-05-22T09:30:00'],
  ['JC-2025-050','WO-2025-0122','Track Pants','Cutting',900,630,'In Progress','2025-05-22T11:10:00'],
  ['JC-2025-049','WO-2025-0121',"Kids T-Shirt",'Stitching',400,0,'Overdue','2025-05-22T10:00:00']
 ].map(p => ({jobCardNumber:p[0], woNumber:p[1], productStyle:p[2], department:p[3], targetQty:p[4], producedQty:p[5], status:p[6], lastUpdated:new Date(p[7])}));
 await ProductionTracking.insertMany(productionTracking);
 const production = [
  ['PRD-2025-056','WO-2025-0128',"Men's T-Shirt",'Cutting','Line 1',1000,600,12,'In Progress','Day','2025-05-22'],
  ['PRD-2025-055','WO-2025-0127','Hoodie','Stitching','Line 2',800,800,8,'Completed','Day','2025-05-22'],
  ['PRD-2025-054','WO-2025-0126',"Men's Polo",'Finishing','Line 3',500,250,16,'In Progress','Night','2025-05-22'],
  ['PRD-2025-053','WO-2025-0125',"Women's Top",'Cutting','Line 1',700,0,0,'Pending','Day','2025-05-22'],
  ['PRD-2025-052','WO-2025-0124','Denim Jacket','Stitching','Line 2',300,150,10,'In Progress','Night','2025-05-22'],
  ['PRD-2025-051','WO-2025-0123','Sweatshirt','Finishing','Line 3',600,600,14,'Completed','Day','2025-05-22'],
  ['PRD-2025-050','WO-2025-0122','Track Pants','Cutting','Line 1',900,630,22,'In Progress','Day','2025-05-21'],
  ['PRD-2025-049','WO-2025-0121',"Kids T-Shirt",'Stitching','Line 2',400,0,0,'Pending','Night','2025-05-21'],
  ['PRD-2025-048','WO-2025-0120','Printed Tee','Printing','Line 4',650,650,28,'Completed','Day','2025-05-20'],
  ['PRD-2025-047','WO-2025-0119','Embroidered Polo','Embroidery','Line 5',500,500,24,'Completed','Night','2025-05-19'],
  ['PRD-2025-046','WO-2025-0118','Cargo Shorts','Cutting','Line 1',750,750,20,'Completed','Day','2025-05-18'],
  ['PRD-2025-045','WO-2025-0117','Athletic Hoodie','Stitching','Line 2',900,900,30,'Completed','Night','2025-05-17'],
  ['PRD-2025-044','WO-2025-0116','Logo Sweatshirt','Printing','Line 4',600,600,18,'Completed','Day','2025-05-16'],
  ['PRD-2025-043','WO-2025-0115','Denim Overshirt','Finishing','Line 3',450,450,12,'Completed','Night','2025-05-15'],
  ['PRD-2025-042','WO-2025-0114','Kids Hoodie','Stitching','Line 2',600,600,34,'Rework / Rejected','Day','2025-05-14']
 ].map(p => ({productionId:p[0], woNumber:p[1], productStyle:p[2], department:p[3], lineMachine:p[4], targetQty:p[5], producedQty:p[6], rejectedQty:p[7], status:p[8], shift:p[9], productionDate:new Date(p[10])}));
 await Production.insertMany(production);
 const productionPlans = [
  ['WO-2025-0128',"Men's T-Shirt",'Cutting',1000,'2025-05-22','2025-05-25','High','In Progress',600,600,18,2.1,'2025-05-22'],
  ['WO-2025-0127','Hoodie','Stitching',800,'2025-05-18','2025-05-20','Medium','Completed',800,800,12,2.0,'2025-05-20'],
  ['WO-2025-0126',"Men's Polo",'Finishing',500,'2025-05-20','2025-05-24','Medium','In Progress',250,250,8,2.4,'2025-05-22'],
  ['WO-2025-0125',"Women's Top",'Cutting',700,'2025-05-24','2025-05-26','Low','Pending',0,0,0,0,'2025-05-21'],
  ['WO-2025-0124','Denim Jacket','Stitching',300,'2025-05-21','2025-05-23','High','In Progress',150,150,10,3.2,'2025-05-21'],
  ['WO-2025-0123','Sweatshirt','Finishing',600,'2025-05-17','2025-05-19','Medium','Completed',600,600,15,2.5,'2025-05-19'],
  ['WO-2025-0122','Track Pants','Cutting',900,'2025-05-23','2025-05-27','High','In Progress',450,450,20,2.7,'2025-05-20'],
  ['WO-2025-0121',"Kids T-Shirt",'Stitching',400,'2025-05-26','2025-05-28','Low','Pending',0,0,0,0,'2025-05-18']
 ].map(p => ({woNumber:p[0], productStyle:p[1], department:p[2], plannedQty:p[3], startDate:new Date(p[4]), endDate:new Date(p[5]), priority:p[6], status:p[7], completedQty:p[8], producedQty:p[9], rejectedQty:p[10], cycleDays:p[11], trendDate:new Date(p[12])}));
 await ProductionPlan.insertMany(productionPlans);
 const jobCards = [
  ['JC-2025-056','WO-2025-0128',"Men's T-Shirt",'Cutting','John Smith','2025-05-22','2025-05-25','High','In Progress',60,'2025-05-22'],
  ['JC-2025-055','WO-2025-0127','Hoodie','Stitching','Michael Brown','2025-05-18','2025-05-20','Medium','Completed',100,'2025-05-20'],
  ['JC-2025-054','WO-2025-0126',"Men's Polo",'Finishing','David Wilson','2025-05-20','2025-05-24','Medium','In Progress',50,'2025-05-22'],
  ['JC-2025-053','WO-2025-0125',"Women's Top",'Cutting','Sarah Johnson','2025-05-24','2025-05-26','Low','Pending',0,'2025-05-21'],
  ['JC-2025-052','WO-2025-0124','Denim Jacket','Stitching','Robert Lee','2025-05-21','2025-05-23','High','In Progress',40,'2025-05-21'],
  ['JC-2025-051','WO-2025-0123','Sweatshirt','Finishing','Emily Davis','2025-05-17','2025-05-19','Medium','Completed',100,'2025-05-19'],
  ['JC-2025-050','WO-2025-0122','Track Pants','Cutting','James Taylor','2025-05-23','2025-05-27','High','Overdue',70,'2025-05-20'],
  ['JC-2025-049','WO-2025-0121',"Kids T-Shirt",'Stitching','Olivia Martin','2025-05-26','2025-05-28','Low','Pending',0,'2025-05-18']
 ].map(j => ({jobCardNumber:j[0], woNumber:j[1], productStyle:j[2], department:j[3], assignedTo:j[4], startDate:new Date(j[5]), dueDate:new Date(j[6]), priority:j[7], status:j[8], progress:j[9], trendDate:new Date(j[10])}));
 await JobCard.insertMany(jobCards);
 const stockReturns = [
  ['RET-2025-0032','PO-2025-1024','',0,'2025-05-22',5,250,'m',45000,'Quality Issue','Approved'],
  ['RET-2025-0031','GRN-2025-0084','',2,'2025-05-20',3,120,'kg',12600,'Excess Stock','Approved'],
  ['RET-2025-0030','PO-2025-1023','',1,'2025-05-18',4,300,'m',33000,'Damaged Material','Pending'],
  ['RET-2025-0029','GRN-2025-0082','',4,'2025-05-17',2,80,'m',8400,'Wrong Item','Approved'],
  ['RET-2025-0028','PO-2025-1020','',3,'2025-05-16',6,600,'kg',78000,'Quality Issue','Approved'],
  ['RET-2025-0027','GRN-2025-0079','',7,'2025-05-15',2,100,'m',9500,'Excess Stock','Rejected'],
  ['RET-2025-0026','PO-2025-1019','',5,'2025-05-14',4,180,'m',18900,'Damaged Material','Pending'],
  ['RET-2025-0025','PO-2025-1018','',6,'2025-05-13',3,150,'m',15200,'Wrong Item','Approved']
 ].map(r => {
   const s = createdSuppliers[r[3]];
   return {returnNumber:r[0], poNumber:r[1].startsWith('PO') ? r[1] : undefined, grnNumber:r[1].startsWith('GRN') ? r[1] : undefined, supplier:s._id, supplierName:s.name, category:s.category, returnDate:new Date(r[4]), itemsCount:r[5], quantity:r[6], unit:r[7], returnValue:r[8], reason:r[9], status:r[10]};
 });
 await StockReturn.insertMany(stockReturns);
 await Activity.insertMany([
  {module:'suppliers',title:'New Supplier Added',description:'Navyam Industries added successfully',dateText:'22 May 2025, 10:30 AM',type:'success'},
  {module:'suppliers',title:'Supplier Updated',description:'ABC Textiles Ltd. details updated',dateText:'21 May 2025, 04:15 PM',type:'warning'},
  {module:'suppliers',title:'New Purchase Order',description:'PO-2025-1024 created for XYZ Mills',dateText:'21 May 2025, 11:20 AM',type:'purple'},
  {module:'purchase-orders',title:'PO-2025-1024 created',description:'22 May 2025, 10:30 AM',dateText:'22 May 2025, 10:30 AM',type:'success'},
  {module:'purchase-orders',title:'PO-2025-1023 partially received',description:'21 May 2025, 03:15 PM',dateText:'21 May 2025, 03:15 PM',type:'warning'},
  {module:'purchase-orders',title:'PO-2025-1021 completed',description:'20 May 2025, 11:45 AM',dateText:'20 May 2025, 11:45 AM',type:'success'},
  {module:'purchase-orders',title:'PO-2025-1019 cancelled',description:'17 May 2025, 02:20 PM',dateText:'17 May 2025, 02:20 PM',type:'danger'},
  {module:'good-receipts',title:'GRN-2025-0086 completed',description:'ABC Textiles Ltd. - 22 May 2025, 10:30 AM',dateText:'22 May 2025, 10:30 AM',type:'success'},
  {module:'good-receipts',title:'GRN-2025-0084 sent for QC',description:'PQR Threads - 20 May 2025, 03:15 PM',dateText:'20 May 2025, 03:15 PM',type:'warning'},
  {module:'good-receipts',title:'GRN-2025-0083 completed',description:'Dye Chem Pvt. Ltd. - 19 May 2025, 11:45 AM',dateText:'19 May 2025, 11:45 AM',type:'success'},
  {module:'good-receipts',title:'GRN-2025-0080 rejected',description:'Gujrat Traders - 16 May 2025, 02:20 PM',dateText:'16 May 2025, 02:20 PM',type:'danger'},
  {module:'stock-returns',title:'RET-2025-0032 approved',description:'ABC Textiles Ltd. - 22 May 2025, 11:20 AM',dateText:'22 May 2025, 11:20 AM',type:'success'},
  {module:'stock-returns',title:'RET-2025-0031 approved',description:'PQR Threads - 20 May 2025, 04:15 PM',dateText:'20 May 2025, 04:15 PM',type:'success'},
  {module:'stock-returns',title:'RET-2025-0030 submitted',description:'XYZ Mills - 18 May 2025, 10:30 AM',dateText:'18 May 2025, 10:30 AM',type:'warning'},
  {module:'stock-returns',title:'RET-2025-0027 rejected',description:'Navyam Industries - 15 May 2025, 02:45 PM',dateText:'15 May 2025, 02:45 PM',type:'danger'},
  {module:'manufacturing-overview',title:'WO-2025-0127 completed',description:'Hoodie - 800 pcs - 20 May 2025, 04:15 PM',dateText:'20 May 2025, 04:15 PM',type:'success'},
  {module:'manufacturing-overview',title:'WO-2025-0128 updated',description:"Men's T-Shirt - 600/1000 pcs - 22 May 2025, 11:20 AM",dateText:'22 May 2025, 11:20 AM',type:'purple'},
  {module:'manufacturing-overview',title:'New Work Order created',description:'WO-2025-0128 - 22 May 2025, 10:30 AM',dateText:'22 May 2025, 10:30 AM',type:'warning'},
  {module:'manufacturing-overview',title:'WO-2025-0121 overdue',description:"Kids T-Shirt - 18 May 2025, 09:00 AM",dateText:'18 May 2025, 09:00 AM',type:'danger'},
  {module:'qc-inspection',title:'QC-2025-0328 passed',description:"WO-2025-0128 - Men's T-Shirt - 920/1000 pcs - 22 May 2025, 10:30 AM",dateText:'22 May 2025, 10:30 AM',type:'success'},
  {module:'qc-inspection',title:'QC-2025-0327 passed',description:'WO-2025-0127 - Hoodie - 780/800 pcs - 22 May 2025, 09:15 AM',dateText:'22 May 2025, 09:15 AM',type:'purple'},
  {module:'qc-inspection',title:'QC-2025-0326 minor defects found',description:"WO-2025-0126 - Men's Polo - 430/500 pcs - 22 May 2025, 11:20 AM",dateText:'22 May 2025, 11:20 AM',type:'warning'},
  {module:'qc-inspection',title:'QC-2025-0322 major defects found',description:'WO-2025-0122 - Track Pants - 820/900 pcs - 20 May 2025, 04:20 PM',dateText:'20 May 2025, 04:20 PM',type:'danger'},
  {module:'production-tracking',title:'JC-2025-056 updated',description:"Men's T-Shirt - Cutting - 600/1000 pcs - 22 May 2025, 10:30 AM",dateText:'22 May 2025, 10:30 AM',type:'success'},
  {module:'production-tracking',title:'JC-2025-055 completed',description:'Hoodie - Stitching - 800/800 pcs - 22 May 2025, 09:15 AM',dateText:'22 May 2025, 09:15 AM',type:'purple'},
  {module:'production-tracking',title:'JC-2025-054 progress updated',description:"Men's Polo - Finishing - 250/500 pcs - 22 May 2025, 11:20 AM",dateText:'22 May 2025, 11:20 AM',type:'warning'},
  {module:'production-tracking',title:'JC-2025-053 created',description:"Women's Top - Cutting - 22 May 2025, 10:05 AM",dateText:'22 May 2025, 10:05 AM',type:'danger'},
  {module:'production',title:'PRD-2025-056 production started',description:"WO-2025-0128 - Men's T-Shirt - Cutting",dateText:'Today, 09:30 AM',type:'success'},
  {module:'production',title:'PRD-2025-055 completed',description:'WO-2025-0127 - Hoodie - Stitching',dateText:'Today, 09:15 AM',type:'purple'},
  {module:'production',title:'PRD-2025-054 production updated',description:"WO-2025-0126 - Men's Polo - Finishing",dateText:'Today, 08:45 AM',type:'warning'},
  {module:'production',title:'PRD-2025-053 marked as pending',description:"WO-2025-0125 - Women's Top - Cutting",dateText:'Yesterday, 05:20 PM',type:'danger'},
  {module:'production-planning',title:'WO-2025-0127 completed',description:'Hoodie - 800 pcs - 20 May 2025, 04:15 PM',dateText:'20 May 2025, 04:15 PM',type:'success'},
  {module:'production-planning',title:'WO-2025-0128 updated',description:"Men's T-Shirt - 600/1000 pcs - 22 May 2025, 11:20 AM",dateText:'22 May 2025, 11:20 AM',type:'purple'},
  {module:'production-planning',title:'New Work Order created',description:"Men's Polo - 22 May 2025, 10:30 AM",dateText:'22 May 2025, 10:30 AM',type:'warning'},
  {module:'production-planning',title:'WO-2025-0125 overdue',description:'Track Pants - 27 May 2025, 09:00 AM',dateText:'27 May 2025, 09:00 AM',type:'danger'},
  {module:'job-cards',title:'JC-2025-056 created',description:"WO-2025-0128 - Men's T-Shirt - Cutting",dateText:'Today, 10:30 AM',type:'success'},
  {module:'job-cards',title:'JC-2025-055 completed',description:'WO-2025-0127 - Hoodie - Stitching',dateText:'Today, 09:15 AM',type:'purple'},
  {module:'job-cards',title:'JC-2025-054 updated',description:"WO-2025-0126 - Men's Polo - Finishing",dateText:'Yesterday, 05:20 PM',type:'warning'},
  {module:'products',title:'New product added',description:'Kids T-Shirt (SKU: KTS-008) added',dateText:'Today, 10:30 AM',type:'success'},
  {module:'products',title:'Product updated',description:"Men's Polo (SKU: PL-003) updated",dateText:'Today, 09:15 AM',type:'purple'},
  {module:'products',title:'Variants updated',description:'Track Pants variants updated',dateText:'Yesterday, 04:20 PM',type:'warning'},
  {module:'products',title:'Product deactivated',description:'Track Pants (SKU: TRP-006) deactivated',dateText:'Yesterday, 02:10 PM',type:'danger'},
  {module:'product-categories',title:'New category added',description:'Accessories added by Admin',dateText:'Today, 10:30 AM',type:'success'},
  {module:'product-categories',title:'Category updated',description:'Polo Shirts updated by Admin',dateText:'Today, 09:15 AM',type:'purple'},
  {module:'product-categories',title:'Category activated',description:'Kids Wear activated by Admin',dateText:'Yesterday, 04:20 PM',type:'warning'},
  {module:'product-categories',title:'Category deactivated',description:'Innerwear deactivated by Admin',dateText:'Yesterday, 02:10 PM',type:'danger'},
  {module:'product-variants',title:'New variant added',description:"Men's T-Shirt (Size: M, Color: Black)",dateText:'Today, 10:30 AM',type:'success'},
  {module:'product-variants',title:'Variant updated',description:'Hoodie (Size: L, Color: Grey)',dateText:'Today, 09:15 AM',type:'purple'},
  {module:'product-variants',title:'Stock updated',description:'Denim Jacket (Size: M, Color: Blue)',dateText:'Yesterday, 04:20 PM',type:'warning'},
  {module:'product-variants',title:'Variant deactivated',description:'Denim Jacket (Size: L, Color: Blue)',dateText:'Yesterday, 02:10 PM',type:'danger'},
  {module:'product-attributes',title:'Attribute "Color" updated',description:'Dropdown values modified',dateText:'Today, 10:30 AM',type:'success'},
  {module:'product-attributes',title:'New attribute "GSM" added',description:'Numeric type attribute',dateText:'Today, 09:15 AM',type:'purple'},
  {module:'product-attributes',title:'Attribute "Brand" deactivated',description:'No longer in use',dateText:'Yesterday, 04:20 PM',type:'warning'},
  {module:'product-attributes',title:'Attribute "Season" updated',description:'Options updated',dateText:'Yesterday, 02:10 PM',type:'danger'},
  {module:'warehouse-overview',title:'Stock In completed',description:"Men's T-Shirt - 4,200 units received",dateText:'Today, 10:30 AM',type:'success'},
  {module:'warehouse-overview',title:'Stock Out completed',description:'Hoodie - 850 units shipped',dateText:'Today, 09:15 AM',type:'purple'},
  {module:'warehouse-overview',title:'Transfer completed',description:'500 units transferred to WH-003',dateText:'Yesterday, 04:20 PM',type:'warning'},
  {module:'warehouse-overview',title:'Stock Adjustment',description:'Size variation adjustment in WH-002',dateText:'Yesterday, 02:10 PM',type:'danger'}
 ]);
 console.log('Seed completed'); process.exit(0);
}
seed().catch(e=>{console.error(e);process.exit(1)});
