const router = require('express').Router();
const c = require('../controllers/enterpriseInventoryController');

router.get('/analytics', c.analytics);
router.get('/vendors/performance', c.vendorPerformance);
router.get('/material-requests/stats', c.materialRequestStats);
router.route('/material-requests').get(c.listMaterialRequests).post(c.createMaterialRequest);
router.patch('/material-requests/:id/approve', c.approveMaterialRequest);
router.patch('/material-requests/:id/issue', c.issueMaterialRequest);
router.route('/warehouse-transfers').get(c.listTransfers).post(c.createTransfer);
router.patch('/warehouse-transfers/:id/status', c.updateTransferStatus);
router.route('/serials').get(c.serials).post(c.createSerial);

module.exports = router;
