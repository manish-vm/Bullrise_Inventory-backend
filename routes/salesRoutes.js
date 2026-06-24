const router = require('express').Router();
const c = require('../controllers/salesController');
const { validateCreate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/stats', c.stats);
router.route('/').get(c.list).post(validateCreate(v.sale), c.create);
router.patch('/:id/status', validateCreate(v.saleStatus), c.updateStatus);

module.exports = router;
