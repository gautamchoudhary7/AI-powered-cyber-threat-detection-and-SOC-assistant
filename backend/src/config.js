// Central place for configuration. Values come from environment variables (.env).
// Secrets have NO defaults: the server refuses to start without a proper JWT secret.
require('dotenv').config();
const os = require('os');
const path = require('path');
const { parseTrustProxy } = require('./utils/trustProxy');

const intFromEnv = (name, fallback) => {
  const parsed = parseInt(process.env[name] || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const config = {
  trustProxy: 0, // set by validateConfig() at start-up
  // CSV upload limits
  maxUploadMb: intFromEnv('MAX_UPLOAD_MB', 20),
  maxUploadRows: intFromEnv('MAX_UPLOAD_ROWS', 50000),
  mlBatchSize: Math.min(intFromEnv('ML_BATCH_SIZE', 500), 2000), // ML service accepts up to 5000
  maxConcurrentJobs: intFromEnv('MAX_CONCURRENT_JOBS', 2),
  uploadRateLimitMax: intFromEnv('UPLOAD_RATE_LIMIT_MAX', 10),
  // Uploaded files live here only while being processed, then are deleted.
  uploadDir: process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'soc-uploads'),

  // Number of reverse proxies in front of the server (0 = none). See utils/trustProxy.js.
  trustProxyInput: process.env.TRUST_PROXY,
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8001',
  // Shared secret the AI service requires (its INTERNAL_API_KEY). Sent only from this server, never to the browser.
  aiInternalKey: process.env.AI_INTERNAL_KEY || '',
  // Shared secret the ML service requires when it sets ML_INTERNAL_KEY. Empty = send nothing (local development).
  mlInternalKey: process.env.ML_INTERNAL_KEY || '',
  assistantRateLimitMax: intFromEnv('ASSISTANT_RATE_LIMIT_MAX', 20),
  // The agent only SUGGESTS actions; a person must approve each one. This switch turns scanning and approving off.
  agentEnabled: (process.env.AGENT_ENABLED || 'true').toLowerCase() !== 'false',
  agentProposalTtlDays: intFromEnv('AGENT_PROPOSAL_TTL_DAYS', 7),
  agentRateLimitMax: intFromEnv('AGENT_RATE_LIMIT_MAX', 30),
  // Lets an analyst choose to send an alert's raw row values (addresses, ports, ...) to the language model.
  // Set to "false" to turn that off for everyone.
  assistantAllowRowValues: (process.env.ASSISTANT_ALLOW_ROW_VALUES || 'true').toLowerCase() !== 'false',
  // "General chat" lets an analyst ask the language model anything, with no reference documents and no sources.
  // Its answers are unverified. Set to "false" to allow only the cited, document-based mode.
  assistantGeneralChat: (process.env.ASSISTANT_GENERAL_CHAT || 'true').toLowerCase() !== 'false',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/soc_assistant',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
};

// Called once at server start (not on import, so tests can set their own env).
function validateConfig() {
  const problems = [];
  if (!config.jwtSecret || config.jwtSecret.length < 32 || config.jwtSecret.startsWith('replace-with')) {
    problems.push(
      'JWT_SECRET is missing, too short (need 32+ characters) or still the placeholder. Set a real one in backend/.env.'
    );
  }
  if (!Number.isInteger(config.bcryptRounds) || config.bcryptRounds < 10 || config.bcryptRounds > 15) {
    problems.push('BCRYPT_ROUNDS must be a whole number between 10 and 15.');
  }
  try {
    config.trustProxy = parseTrustProxy(config.trustProxyInput);
  } catch (err) {
    problems.push(err.message);
  }
  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
  }
}

config.validateConfig = validateConfig;

module.exports = config;
