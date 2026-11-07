const express = require('express');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { askSchema, chatSchema } = require('../validators/assistantSchemas');
const controller = require('../controllers/assistantController');

// `limiter` is a strict per-IP limit: every question can spend language-model quota.
function createAssistantRouter({ limiter }) {
  const router = express.Router();
  router.use(authenticate);
  router.get('/status', controller.status);
  router.post('/ask', limiter, validate(askSchema), controller.askQuestion);
  router.post('/chat', limiter, validate(chatSchema), controller.chatQuestion);
  return router;
}

module.exports = createAssistantRouter;
