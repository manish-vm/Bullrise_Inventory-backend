const router = require('express').Router();
const c = require('../controllers/supplierController');
router.get('/stats', c.getSupplierStats);
router.get('/activities', c.getSupplierActivities);
router.route('/').get(c.getSuppliers).post(c.createSupplier);
router.route('/:id').get(c.getSupplier).put(c.updateSupplier).delete(c.deleteSupplier);
module.exports = router;
