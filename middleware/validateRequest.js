const mongoose = require('mongoose');

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isEmpty = (value) => value === undefined || value === null || value === '';

const validators = {
  string(value, rule) {
    if (isEmpty(value)) return true;
    if (typeof value !== 'string') return 'must be a string';
    if (rule.min && value.trim().length < rule.min) return `must be at least ${rule.min} characters`;
    if (rule.max && value.trim().length > rule.max) return `must be at most ${rule.max} characters`;
    if (rule.pattern && !rule.pattern.test(value)) return 'has an invalid format';
    return true;
  },
  number(value, rule) {
    if (isEmpty(value)) return true;
    if (typeof Number(value) !== 'number' || Number.isNaN(Number(value))) return 'must be a number';
    if (rule.min !== undefined && Number(value) < rule.min) return `must be at least ${rule.min}`;
    if (rule.max !== undefined && Number(value) > rule.max) return `must be at most ${rule.max}`;
    return true;
  },
  boolean(value) {
    if (isEmpty(value)) return true;
    if (typeof value !== 'boolean') return 'must be true or false';
    return true;
  },
  date(value) {
    if (isEmpty(value)) return true;
    if (Number.isNaN(new Date(value).getTime())) return 'must be a valid date';
    return true;
  },
  objectId(value) {
    if (isEmpty(value)) return true;
    if (!mongoose.Types.ObjectId.isValid(value)) return 'must be a valid id';
    return true;
  },
  array(value, rule) {
    if (isEmpty(value)) return true;
    if (!Array.isArray(value)) return 'must be an array';
    if (rule.min && value.length < rule.min) return `must include at least ${rule.min} item(s)`;
    if (rule.of) {
      if (rule.of.value) {
        const itemErrors = value.flatMap((item, index) => {
          const result = validators[rule.of.value.type || 'string']?.(item, rule.of.value);
          return result === true ? [] : [{ field: String(index), message: result || 'is invalid' }];
        });
        if (itemErrors.length) return itemErrors;
        return true;
      }
      const itemErrors = value.flatMap((item, index) => validateObject(item, rule.of, { partial: false }, `${index}.`));
      if (itemErrors.length) return itemErrors;
    }
    return true;
  },
  object(value, rule) {
    if (isEmpty(value)) return true;
    if (!isPlainObject(value)) return 'must be an object';
    if (rule.fields) return validateObject(value, rule.fields, { partial: false });
    return true;
  },
};

function validateObject(body, schema, options = {}, prefix = '') {
  const errors = [];
  Object.entries(schema).forEach(([field, rule]) => {
    const value = body[field];
    const path = `${prefix}${field}`;
    if (!options.partial && rule.required && isEmpty(value)) {
      errors.push({ field: path, message: 'is required' });
      return;
    }
    if (isEmpty(value)) return;
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push({ field: path, message: `must be one of: ${rule.enum.join(', ')}` });
      return;
    }
    const validate = validators[rule.type || 'string'];
    if (!validate) return;
    const result = validate(value, rule);
    if (Array.isArray(result)) errors.push(...result.map((error) => ({ ...error, field: `${path}.${error.field}` })));
    if (typeof result === 'string') errors.push({ field: path, message: result });
  });
  return errors;
}

const validate = (schema, options = {}) => (req, res, next) => {
  const errors = validateObject(req.body || {}, schema, options);
  if (errors.length) {
    res.status(400).json({ success: false, message: 'Validation failed', errors });
    return;
  }
  next();
};

const validateCreate = (schema) => validate(schema);
const validateUpdate = (schema) => validate(schema, { partial: true });

module.exports = { validateCreate, validateUpdate };
