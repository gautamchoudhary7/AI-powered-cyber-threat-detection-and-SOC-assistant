const express = require('express');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { alertStatusSchema } = require('../validators/detectionSchemas');
const controller = require('../controllers/alertController');

const router = express.Router();
router.use(authenticate);
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.patch('/:id/status', validate(alertStatusSchema), controller.updateStatus);

module.exports = router;
