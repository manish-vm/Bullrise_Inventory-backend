const router = require('express').Router();
const c = require('../controllers/customerReturnController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/stats', c.stats);
router.route('/').get(c.list).post(validateCreate(v.customerReturn), c.create);
router.patch('/:id/process', validateUpdate(v.customerReturnProcess), c.process);

module.exports = router;
