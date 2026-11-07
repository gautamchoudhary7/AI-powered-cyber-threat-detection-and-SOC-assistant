// Password hashing and JWT helpers.
// We use bcryptjs: the same bcrypt algorithm, written in pure JavaScript, so it installs
// on any computer without needing a C++ compiler (the "bcrypt" package sometimes fails on Windows).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');

const ALGORITHM = 'HS256';

function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Used when the email does not exist, so a failed login takes about as long as a real one.
// This makes it harder to discover which emails are registered by measuring response time.
let dummyHash;
async function verifyAgainstDummy(password) {
  if (!dummyHash) dummyHash = await bcrypt.hash('dummy-password-for-timing', config.bcryptRounds);
  await bcrypt.compare(password, dummyHash);
}

function signToken(user) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: String(user.id),
    expiresIn: config.jwtExpiresIn,
    algorithm: ALGORITHM,
  });
}

// Throws if the token is invalid or expired. Only HS256 is accepted (blocks "alg: none" tricks).
function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: [ALGORITHM] });
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy, signToken, verifyToken };
