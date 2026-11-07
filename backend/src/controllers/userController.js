const User = require('../models/User');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const { hashPassword, verifyPassword, signToken } = require('../services/authService');
const { toPublicUser } = require('./authController');

// PATCH /api/users/me   { name }
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user.id, { name: req.body.name }, { new: true, runValidators: true });
  if (!user) throw new HttpError(401, 'Invalid token');
  await audit.log({ actor: user.id, action: 'user.profile_updated', resourceType: 'User', resourceId: String(user.id), ip: req.ip, metadata: { fields: ['name'] } });
  res.status(200).json({ success: true, data: { user: toPublicUser(user) } });
});

// POST /api/users/me/password   { currentPassword, newPassword }
// A wrong current password returns 400, not 401: the frontend signs the user out on any 401,
// and mistyping a password should not log you out.
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // The hash is hidden by default, so it is requested explicitly.
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user) throw new HttpError(401, 'Invalid token');

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    await audit.log({ actor: user.id, action: 'user.password_change_failed', resourceType: 'User', resourceId: String(user.id), ip: req.ip });
    throw new HttpError(400, 'Current password is incorrect');
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new HttpError(400, 'Choose a new password that is different from the current one');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date(); // every older token stops working
  await user.save();

  await audit.log({ actor: user.id, action: 'user.password_changed', resourceType: 'User', resourceId: String(user.id), ip: req.ip });
  // This session continues with a fresh token; all other sessions are signed out.
  res.status(200).json({ success: true, data: { user: toPublicUser(user), token: signToken(user) } });
});

module.exports = { updateProfile, changePassword };
