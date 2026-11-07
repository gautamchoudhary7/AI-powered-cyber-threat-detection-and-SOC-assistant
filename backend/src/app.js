// Builds the Express app. Kept separate from server.js so tests can import it
// without opening a network port.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const HttpError = require('./utils/httpError');
const { sanitizeRequest } = require('./middleware/sanitize');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const createAuthRouter = require('./routes/auth');
const createDetectionRouter = require('./routes/detection');
const alertRoutes = require('./routes/alerts');
const dashboardRoutes = require('./routes/dashboard');
const createIncidentRouter = require('./routes/incidents');
const createReportRouter = require('./routes/reports');
const createUserRouter = require('./routes/users');
const createAssistantRouter = require('./routes/assistant');
const createAgentRouter = require('./routes/agent');

function createApp(options = {}) {
  const authRateLimitMax = options.authRateLimitMax || config.authRateLimitMax;
  const app = express();

  app.disable('x-powered-by');
  // Only when a reverse proxy really sits in front (TRUST_PROXY=1). Otherwise rate limits and audit IPs break.
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin })); // only our frontend may call the API from a browser
  app.use(express.json({ limit: '100kb' }));
  app.use(sanitizeRequest); // blocks NoSQL operators like $ne in body, query and params
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Stricter limit for login/register to slow down password guessing.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.')),
  });

  // Uploads are expensive (disk, CPU, ML calls), so each IP gets only a few per 15 minutes.
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: options.uploadRateLimitMax || config.uploadRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'Too many uploads. Please wait a few minutes and try again.')),
  });

  // Each assistant question may use language-model quota, so the limit is strict.
  const assistantLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: options.assistantRateLimitMax || config.assistantRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'Too many assistant questions. Please wait a few minutes and try again.')),
  });

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', createAuthRouter({ limiter: authLimiter }));
  app.use('/api/detection', createDetectionRouter({ uploadLimiter }));
  app.use('/api/alerts', alertRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/incidents', createIncidentRouter());
  app.use('/api/reports', createReportRouter());
  app.use('/api/users', createUserRouter({ limiter: authLimiter }));
  const agentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: options.agentRateLimitMax || config.agentRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'Too many agent requests. Please wait a few minutes and try again.')),
  });
  app.use('/api/assistant', createAssistantRouter({ limiter: assistantLimiter }));
  app.use('/api/agent', createAgentRouter({ limiter: agentLimiter }));

  // Unknown route -> consistent JSON 404
  app.use((req, res) => {
    res.status(404).json({ success: false, error: { message: 'Route not found' } });
  });

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
