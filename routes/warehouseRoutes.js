const router = require('express').Router();
const c = require('../controllers/warehouseController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/overview', c.getWarehouseOverview);
router.route('/').get(c.getWarehouses).post(validateCreate(v.warehouse), c.createWarehouse);
router.route('/:id').get(c.getWarehouse).put(validateUpdate(v.warehouse), c.updateWarehouse);

module.exports = router;
