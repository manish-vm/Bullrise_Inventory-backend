const router = require('express').Router();
const c = require('../controllers/categoryController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');
router.get('/stats', c.getCategoryStats);
router.route('/').get(c.getCategories).post(validateCreate(v.materialCategory), c.createCategory);
router.route('/:id').get(c.getCategory).put(validateUpdate(v.materialCategory), c.updateCategory).delete(c.deleteCategory);
module.exports = router;
