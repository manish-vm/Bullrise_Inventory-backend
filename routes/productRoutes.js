const router = require('express').Router();
const c = require('../controllers/productController');

router.get('/stats', c.getProductStats);
router.get('/activities', c.getProductActivities);
router.route('/').get(c.getProducts).post(c.createProduct);
router.route('/:id').get(c.getProduct).put(c.updateProduct).delete(c.deleteProduct);

module.exports = router;
