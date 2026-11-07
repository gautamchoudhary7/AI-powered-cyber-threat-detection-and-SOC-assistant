const express = require('express');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { emptyBodySchema, rejectSchema } = require('../validators/agentSchemas');
const controller = require('../controllers/agentController');

// `limiter` caps how often scans and decisions can happen. Suggestions never run on their own: approving is a deliberate request.
function createAgentRouter({ limiter }) {
  const router = express.Router();
  router.use(authenticate);
  router.get('/status', controller.status);
  router.post('/scan', limiter, validate(emptyBodySchema), controller.scan);
  router.get('/proposals', controller.list);
  router.get('/proposals/:id', controller.getOne);
  router.post('/proposals/:id/approve', limiter, validate(emptyBodySchema), controller.approve);
  router.post('/proposals/:id/reject', limiter, validate(rejectSchema), controller.reject);
  return router;
}

module.exports = createAgentRouter;
