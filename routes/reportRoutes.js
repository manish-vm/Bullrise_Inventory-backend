const router = require('express').Router();
const c = require('../controllers/reportController');

router.get('/summary', c.summary);
router.get('/transactions', c.transactions);

module.exports = router;
