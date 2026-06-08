const router = require('express').Router();
const c = require('../controllers/manufacturingController');

router.get('/overview', c.getOverview);
router.get('/production-planning', c.getProductionPlanning);
router.get('/job-cards', c.getJobCards);
router.get('/qc-inspection', c.getQCInspection);
router.get('/production-tracking', c.getProductionTracking);

module.exports = router;
