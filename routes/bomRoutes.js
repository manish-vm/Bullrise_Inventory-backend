const router = require('express').Router();
const c = require('../controllers/bomController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/stats', c.stats);
router.get('/activities', c.activities);
router.route('/').get(c.list).post(validateCreate(v.bom), c.create);
router.patch('/:id/approve', c.approve);
router.route('/:id').get(c.get).put(validateUpdate(v.bom), c.update).delete(c.remove);

module.exports = router;
