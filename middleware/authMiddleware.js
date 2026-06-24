const User = require('../models/User');
const { verify } = require('../utils/authToken');

exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = verify(token);
    const user = await User.findById(payload.id).select('-passwordHash -salt');
    if (!user || user.status !== 'Active') {
      res.status(401);
      throw new Error('Not authorized');
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401);
    next(new Error(error.message || 'Not authorized'));
  }
};

exports.allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403);
    next(new Error('You do not have permission for this action'));
    return;
  }
  next();
};
