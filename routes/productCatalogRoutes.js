const router = require('express').Router();
const c = require('../controllers/productCatalogController');
const { validateCreate, validateUpdate } = require('../middleware/validateRequest');
const v = require('../validation/schemas');

const schemaFor = (req) => ({
  categories: v.productCategory,
  variants: v.productVariant,
  attributes: v.productAttribute,
}[req.params.resource] || {});
const create = (req, res, next) => validateCreate(schemaFor(req))(req, res, next);
const update = (req, res, next) => validateUpdate(schemaFor(req))(req, res, next);

router.get('/:resource/stats', c.stats);
router.get('/:resource/activities', c.activities);
router.route('/:resource').get(c.list).post(create, c.create);
router.route('/:resource/:id').put(update, c.update).delete(c.remove);

module.exports = router;
