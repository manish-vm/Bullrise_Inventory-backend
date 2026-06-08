const router = require('express').Router();
const c = require('../controllers/productionController');

router.get('/', c.getProduction);

module.exports = router;
