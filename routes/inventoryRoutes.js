const router = require('express').Router();
const c = require('../controllers/inventoryController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/raw-material-stock/stats', c.rawMaterialStats);
router.get('/raw-material-stock', c.listRawMaterialStock);
router.post('/raw-material-stock/repair-completed-grns', c.repairCompletedGrnStock);
router.get('/material-batches', c.listBatches);
router.get('/stock-movements/stats', c.movementStats);
router.get('/stock-movements/:id', c.getMovement);
router.get('/stock-movements', c.listMovements);
router.get('/finished-goods-stock/stats', c.finishedGoodsStats);
router.get('/finished-goods-stock', c.listFinishedGoods);
router.route('/finished-goods-stock/:id')
  .put(validateUpdate(v.finishedGoodsStock), c.updateFinishedGoods)
  .patch(validateUpdate(v.finishedGoodsStock), c.updateFinishedGoods);
router.get('/barcode-labels/stats', c.barcodeLabelStats);
router.patch('/barcode-labels/mark-printed', validateCreate(v.barcodePrinted), c.markBarcodePrinted);
router.route('/barcode-labels').get(c.listBarcodeLabels).post(validateCreate(v.barcodeLabel), c.createBarcodeLabel);
router.put('/barcode-labels/:id', validateUpdate(v.barcodeLabel), c.updateBarcodeLabel);
router.route('/warehouse-locations').get(c.listLocations).post(validateCreate(v.location), c.createLocation);
router.route('/warehouse-locations/:id').put(validateUpdate(v.location), c.updateLocation).delete(c.deleteLocation);
router.post('/stock-in', validateCreate(v.stockTransaction), c.stockIn);
router.post('/stock-out', validateCreate(v.stockTransaction), c.stockOut);
router.post('/stock-transfers', validateCreate(v.stockTransfer), c.transferStock);
router.post('/stock-adjustments', validateCreate(v.stockTransaction), c.adjustStock);

module.exports = router;
