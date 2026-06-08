const router = require('express').Router();
const c = require('../controllers/productCatalogController');

router.get('/:resource/stats', c.stats);
router.get('/:resource/activities', c.activities);
router.route('/:resource').get(c.list).post(c.create);
router.route('/:resource/:id').put(c.update).delete(c.remove);

module.exports = router;
