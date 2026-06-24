const router = require('express').Router();
const c = require('../controllers/authController');
const { allowRoles, protect } = require('../middleware/authMiddleware');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

router.post('/login', validateCreate(v.login), c.login);
router.get('/me', protect, c.me);
router.get('/users/stats', protect, allowRoles('Super Admin', 'Admin'), c.userStats);
router.route('/users')
  .get(protect, allowRoles('Super Admin', 'Admin'), c.listUsers)
  .post(protect, allowRoles('Super Admin'), validateCreate(v.userCreate), c.createUser);
router.route('/users/:id')
  .get(protect, allowRoles('Super Admin', 'Admin'), c.getUser)
  .put(protect, allowRoles('Super Admin'), validateUpdate(v.userUpdate), c.updateUser);

module.exports = router;
