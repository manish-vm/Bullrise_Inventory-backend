const router = require('express').Router();
const c = require('../controllers/warehouseController');

router.get('/overview', c.getWarehouseOverview);
router.route('/').get(c.getWarehouses).post(c.createWarehouse);

module.exports = router;
