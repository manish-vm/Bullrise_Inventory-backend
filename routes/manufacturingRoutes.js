const router = require('express').Router();
const c = require('../controllers/manufacturingController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.get('/overview', c.getOverview);
router.post('/work-orders', validateCreate(v.workOrder), c.createWorkOrder);
router.route('/work-orders/:id').get(c.getWorkOrder).put(validateUpdate(v.workOrder), c.updateWorkOrder).delete(c.deleteWorkOrder);
router.get('/production-planning', c.getProductionPlanning);
router.get('/job-cards', c.getJobCards);
router.get('/stages/:stage', c.getStageManagement);
router.get('/damage/stats', c.getProductionDamageStats);
router.get('/damage', c.getProductionDamage);
router.get('/qc-inspection', c.getQCInspection);
router.post('/qc-inspection', validateCreate(v.qcInspection), c.createQCInspection);
router.route('/qc-inspection/:id').get(c.getQCInspectionById).put(validateUpdate(v.qcInspection), c.updateQCInspection).delete(c.deleteQCInspection);
router.get('/production-tracking', c.getProductionTracking);
router.post('/production-tracking/import', c.importProductionTracking);
router.put('/production-tracking/:id', c.updateProductionTracking);
router.patch('/work-orders/:id/approve', c.approveWorkOrder);
router.patch('/work-orders/:id/start', c.startWorkOrder);
router.post('/work-orders/:id/job-cards/generate', c.generateStageJobCards);
router.patch('/job-cards/:id/stage', validateUpdate(v.stageUpdate), c.updateJobCardStage);
router.patch('/job-cards/:id/complete-stage', validateUpdate(v.stageUpdate), c.completeJobCardStage);
router.patch('/qc-inspection/:id/post-stock', validateUpdate(v.qcPostStock), c.postQCToStock);

module.exports = router;
