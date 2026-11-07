const express = require('express');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { uploadCsv } = require('../middleware/upload');
const { predictSchema } = require('../validators/detectionSchemas');
const controller = require('../controllers/detectionController');

// Every route here requires a logged-in user. The upload limiter is stricter than the global one.
function createDetectionRouter({ uploadLimiter }) {
  const router = express.Router();
  router.use(authenticate);
  router.post('/upload', uploadLimiter, uploadCsv, controller.upload);
  router.post('/predict', validate(predictSchema), controller.predict);
  router.get('/jobs/:id', controller.getJob);
  router.get('/jobs/:id/report.csv', controller.downloadReport);
  return router;
}

module.exports = createDetectionRouter;
