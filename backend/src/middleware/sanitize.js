// Blocks NoSQL injection attempts such as {"email": {"$ne": null}}.
// MongoDB operators start with "$"; "." in a key can reach into nested fields.
// We reject the request outright instead of silently rewriting it.
const HttpError = require('../utils/httpError');

const MAX_DEPTH = 10;

function findForbiddenKey(value, depth = 0) {
  if (value === null || typeof value !== 'object') return null;
  if (depth > MAX_DEPTH) return '[too deeply nested]';
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) return key;
    const nested = findForbiddenKey(value[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function sanitizeRequest(req, res, next) {
  for (const part of [req.body, req.query, req.params]) {
    if (findForbiddenKey(part)) {
      // Do not echo the offending key back to the client.
      return next(new HttpError(400, 'Request contains forbidden characters in field names'));
    }
  }
  return next();
}

module.exports = { sanitizeRequest, findForbiddenKey };
