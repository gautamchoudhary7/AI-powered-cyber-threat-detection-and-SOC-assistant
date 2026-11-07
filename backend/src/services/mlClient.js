// Client for the Python ML service.
// It never invents results: every failure becomes an MlError that says what really went wrong.
const axios = require('axios');
const config = require('../config');

class MlError extends Error {
  // kind: 'unreachable' | 'not_configured' | 'invalid_records' | 'too_many_records' | 'error'
  constructor(kind, message, details) {
    super(message);
    this.name = 'MlError';
    this.kind = kind;
    this.details = details;
  }
}

async function getMlHealth() {
  try {
    const res = await axios.get(`${config.mlServiceUrl}/health`, { timeout: 3000 });
    return { reachable: true, ...res.data };
  } catch (err) {
    return { reachable: false, error: 'ML service is unreachable' };
  }
}

// Turns an axios failure into an MlError.
function toMlError(err) {
  if (!err.response) {
    return new MlError('unreachable', 'The ML service is unreachable.');
  }
  const { status, data } = err.response;
  const code = data && data.error && data.error.code;
  const details = data && data.error && data.error.details;
  if (status === 503 && code === 'detection_not_configured') {
    return new MlError('not_configured', 'Detection is not configured: no trained model is available.');
  }
  if (status === 422 && (code === 'missing_columns' || code === 'invalid_values' || code === 'invalid_record')) {
    return new MlError('invalid_records', (data.error && data.error.message) || 'Records were rejected.', { code, details });
  }
  if (status === 413) return new MlError('too_many_records', 'Too many records in one request.');
  return new MlError('error', `The ML service returned an error (HTTP ${status}).`);
}

// What the trained detector needs: its version and the feature columns it was trained on.
async function getModelInfo() {
  try {
    const res = await axios.get(`${config.mlServiceUrl}/model/info`, { timeout: 5000 });
    const detector = res.data && res.data.detector;
    const schema = detector && detector.schema;
    if (!detector || !schema || !Array.isArray(schema.numeric) || !Array.isArray(schema.categorical)) {
      throw new MlError('error', 'The ML service returned model information in an unexpected format.');
    }
    return {
      modelVersion: detector.model_version,
      categoryModelVersion: res.data.category_model ? res.data.category_model.model_version : null,
      numeric: schema.numeric,
      categorical: schema.categorical,
    };
  } catch (err) {
    throw err instanceof MlError ? err : toMlError(err);
  }
}

// Sends records ({column: value}) and returns the ML service response unchanged.
async function predictBatch(records) {
  try {
    const res = await axios.post(`${config.mlServiceUrl}/predict`, { records }, { timeout: 60000 });
    return res.data;
  } catch (err) {
    throw toMlError(err);
  }
}

module.exports = { getMlHealth, getModelInfo, predictBatch, MlError };
