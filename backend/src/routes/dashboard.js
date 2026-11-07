const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/dashboardController');

const router = express.Router();
router.use(authenticate);
router.get('/stats', controller.stats);
router.get('/trends', controller.trends);

module.exports = router;
