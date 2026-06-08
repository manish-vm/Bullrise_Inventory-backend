const router = require('express').Router();
const c = require('../controllers/categoryController');
router.get('/stats', c.getCategoryStats);
router.route('/').get(c.getCategories).post(c.createCategory);
router.route('/:id').get(c.getCategory).put(c.updateCategory).delete(c.deleteCategory);
module.exports = router;
