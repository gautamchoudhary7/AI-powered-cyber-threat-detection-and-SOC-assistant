const express = require('express');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { createReportSchema } = require('../validators/reportSchemas');
const controller = require('../controllers/reportController');

function createReportRouter() {
  const router = express.Router();
  router.use(authenticate);
  router.post('/', validate(createReportSchema), controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.getOne);
  return router;
}

module.exports = createReportRouter;
