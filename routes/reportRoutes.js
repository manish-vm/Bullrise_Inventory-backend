const router = require('express').Router();
const c = require('../controllers/reportController');

router.get('/summary', c.summary);
router.get('/transactions', c.transactions);
router.get('/cost-tracking', c.costTracking);
router.get('/purchase-details', c.purchaseDetails);

module.exports = router;
