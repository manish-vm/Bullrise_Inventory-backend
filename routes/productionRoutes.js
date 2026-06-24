const router = require('express').Router();
const c = require('../controllers/productionController');

router.get('/', c.getProduction);
router.post('/', c.createProduction);
router.put('/:id', c.updateProduction);

module.exports = router;
