const router = require('express').Router();
const c = require('../controllers/stockReturnController');

router.get('/stats', c.getStockReturnStats);
router.get('/activities', c.getStockReturnActivities);
router.route('/').get(c.getStockReturns).post(c.createStockReturn);
router.route('/:id').get(c.getStockReturn).put(c.updateStockReturn).delete(c.deleteStockReturn);

module.exports = router;
