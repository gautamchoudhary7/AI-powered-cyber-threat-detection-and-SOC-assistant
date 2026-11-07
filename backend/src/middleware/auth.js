const User = require('../models/User');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../services/authService');

// Requires "Authorization: Bearer <token>". On success, req.user is the current user from the database.
// We reload the user on every request so a deactivated account loses access immediately.
const authenticate = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Authentication required');
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw new HttpError(401, err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new HttpError(401, 'Invalid token');
  }

  // Changing the password signs out every older session. JWT "iat" is in whole seconds, so a token
  // issued in the same second as the change is still accepted (a window of under one second).
  if (user.passwordChangedAt && payload.iat < Math.floor(new Date(user.passwordChangedAt).getTime() / 1000)) {
    throw new HttpError(401, 'Your password was changed. Please sign in again.');
  }

  req.user = user;
  next();
});

// Use after authenticate: requireRole('admin') allows only admins.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to do this'));
    }
    return next();
  };
}

module.exports = { authenticate, requireRole };
