const router = require('express').Router();
const c = require('../controllers/poController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');
router.get('/stats', c.getPurchaseOrderStats);
router.get('/activities', c.getPurchaseOrderActivities);
router.route('/').get(c.getPurchaseOrders).post(validateCreate(v.purchaseOrder), c.createPurchaseOrder);
router.route('/:id').get(c.getPurchaseOrder).put(validateUpdate(v.purchaseOrder), c.updatePurchaseOrder).delete(c.deletePurchaseOrder);
module.exports = router;
