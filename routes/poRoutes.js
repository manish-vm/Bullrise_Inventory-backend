const router = require('express').Router();
const c = require('../controllers/poController');
router.get('/stats', c.getPurchaseOrderStats);
router.get('/activities', c.getPurchaseOrderActivities);
router.route('/').get(c.getPurchaseOrders).post(c.createPurchaseOrder);
router.route('/:id').get(c.getPurchaseOrder).put(c.updatePurchaseOrder).delete(c.deletePurchaseOrder);
module.exports = router;
