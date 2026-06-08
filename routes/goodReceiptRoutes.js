const router = require('express').Router();
const c = require('../controllers/goodReceiptController');

router.get('/stats', c.getGoodReceiptStats);
router.get('/activities', c.getGoodReceiptActivities);
router.route('/').get(c.getGoodReceipts).post(c.createGoodReceipt);
router.route('/:id').get(c.getGoodReceipt).put(c.updateGoodReceipt).delete(c.deleteGoodReceipt);

module.exports = router;
