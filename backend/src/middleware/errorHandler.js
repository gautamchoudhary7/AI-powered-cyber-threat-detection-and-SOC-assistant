const HttpError = require('../utils/httpError');

// Names of errors that mean "the database cannot be reached right now".
const DB_UNAVAILABLE = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNotConnectedError',
]);

function isDbUnavailable(err) {
  if (DB_UNAVAILABLE.has(err.name)) return true;
  // Mongoose waits ~10 s for a lost connection, then throws this.
  return err.name === 'MongooseError' && /buffering timed out/i.test(err.message || '');
}

// Central error handler. Clients only ever see safe messages, never stack traces.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    const error = { message: err.message };
    if (err.details) error.details = err.details;
    return res.status(err.status).json({ success: false, error });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: { message: 'Invalid JSON body' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { message: 'Request body too large' } });
  }
  if (isDbUnavailable(err)) {
    console.error('Database unavailable:', err.name);
    return res.status(503).json({ success: false, error: { message: 'Database is unavailable. Try again later.' } });
  }
  console.error('Unhandled error:', err.name, err.message);
  return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
}

module.exports = errorHandler;
