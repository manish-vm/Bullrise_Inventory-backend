const router = require('express').Router();
const c = require('../controllers/stockReturnController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/stats', c.getStockReturnStats);
router.get('/activities', c.getStockReturnActivities);
router.route('/').get(c.getStockReturns).post(validateCreate(v.stockReturn), c.createStockReturn);
router.route('/:id').get(c.getStockReturn).put(validateUpdate(v.stockReturn), c.updateStockReturn).delete(c.deleteStockReturn);

module.exports = router;
