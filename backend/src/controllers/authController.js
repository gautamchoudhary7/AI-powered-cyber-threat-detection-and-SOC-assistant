const User = require('../models/User');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const {
  hashPassword,
  verifyPassword,
  verifyAgainstDummy,
  signToken,
} = require('../services/authService');

// Only these fields are ever sent to the client.
function toPublicUser(user) {
  return { id: String(user.id), name: user.name, email: user.email, role: user.role };
}

// POST /api/auth/register
// Everyone who registers becomes an "analyst". Admin must be granted separately (see `npm run set-role`).
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await User.create({ name, email, passwordHash, role: 'analyst' });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    throw err;
  }

  await audit.log({ actor: user.id, action: 'auth.register', resourceType: 'User', resourceId: String(user.id), ip: req.ip });
  res.status(201).json({ success: true, data: { user: toPublicUser(user), token: signToken(user) } });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // passwordHash is hidden by default, so we ask for it explicitly here.
  const user = await User.findOne({ email }).select('+passwordHash');

  let valid = false;
  if (user) {
    valid = await verifyPassword(password, user.passwordHash);
  } else {
    await verifyAgainstDummy(password);
  }

  // Same message for "no such email", "wrong password" and "disabled account".
  if (!user || !valid || !user.isActive) {
    await audit.log({ action: 'auth.login_failed', ip: req.ip });
    throw new HttpError(401, 'Invalid email or password');
  }

  await audit.log({ actor: user.id, action: 'auth.login', resourceType: 'User', resourceId: String(user.id), ip: req.ip });
  res.status(200).json({ success: true, data: { user: toPublicUser(user), token: signToken(user) } });
});

// GET /api/auth/me   (requires authenticate middleware)
const me = (req, res) => {
  res.status(200).json({ success: true, data: { user: toPublicUser(req.user) } });
};

module.exports = { register, login, me, toPublicUser };
