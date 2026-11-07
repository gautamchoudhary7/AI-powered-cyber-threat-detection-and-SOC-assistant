const express = require('express');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { registerSchema, loginSchema } = require('../validators/authSchemas');
const { register, login, me } = require('../controllers/authController');

// `limiter` is a stricter rate limiter (login/register are brute-force targets).
function createAuthRouter({ limiter }) {
  const router = express.Router();
  router.post('/register', limiter, validate(registerSchema), register);
  router.post('/login', limiter, validate(loginSchema), login);
  router.get('/me', authenticate, me);
  return router;
}

module.exports = createAuthRouter;
