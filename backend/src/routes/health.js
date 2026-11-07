const express = require('express');
const mongoose = require('mongoose');
const { getMlHealth } = require('../services/mlClient');

const router = express.Router();

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

// GET /api/health  -> is the backend itself running, and is MongoDB connected?
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: 'backend',
      status: 'ok',
      database: DB_STATES[mongoose.connection.readyState] || 'unknown',
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /api/health/ml  -> can the backend reach the ML service?
// Returns 200 even if the ML service is down, so the dashboard can show the status
// honestly instead of failing. The "reachable" field tells the truth.
router.get('/ml', async (req, res) => {
  const ml = await getMlHealth();
  res.status(200).json({ success: true, data: { service: 'ml-service', ...ml } });
});

module.exports = router;
