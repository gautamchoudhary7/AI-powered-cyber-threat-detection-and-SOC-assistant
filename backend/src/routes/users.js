const express = require('express');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { updateProfileSchema, changePasswordSchema } = require('../validators/userSchemas');
const controller = require('../controllers/userController');

// `limiter` is the stricter auth limiter: checking a current password is a guessing target too.
function createUserRouter({ limiter }) {
  const router = express.Router();
  router.use(authenticate);
  router.patch('/me', validate(updateProfileSchema), controller.updateProfile);
  router.post('/me/password', limiter, validate(changePasswordSchema), controller.changePassword);
  return router;
}

module.exports = createUserRouter;
