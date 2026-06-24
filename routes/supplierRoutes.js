const router = require('express').Router();
const c = require('../controllers/supplierController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');
router.get('/stats', c.getSupplierStats);
router.get('/activities', c.getSupplierActivities);
router.route('/').get(c.getSuppliers).post(validateCreate(v.supplier), c.createSupplier);
router.route('/:id').get(c.getSupplier).put(validateUpdate(v.supplier), c.updateSupplier).delete(c.deleteSupplier);
module.exports = router;
