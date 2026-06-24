const router = require('express').Router();
const c = require('../controllers/goodReceiptController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/stats', c.getGoodReceiptStats);
router.get('/activities', c.getGoodReceiptActivities);
router.route('/').get(c.getGoodReceipts).post(validateCreate(v.goodReceipt), c.createGoodReceipt);
router.patch('/:id/approve', validateUpdate(v.goodReceiptApproval), c.approveGoodReceipt);
router.route('/:id').get(c.getGoodReceipt).put(validateUpdate(v.goodReceipt), c.updateGoodReceipt).delete(c.deleteGoodReceipt);

module.exports = router;
