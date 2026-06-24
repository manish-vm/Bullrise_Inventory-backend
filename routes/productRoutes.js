const router = require('express').Router();
const c = require('../controllers/productController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/stats', c.getProductStats);
router.get('/activities', c.getProductActivities);
router.route('/').get(c.getProducts).post(validateCreate(v.product), c.createProduct);
router.route('/:id').get(c.getProduct).put(validateUpdate(v.product), c.updateProduct).delete(c.deleteProduct);

module.exports = router;
