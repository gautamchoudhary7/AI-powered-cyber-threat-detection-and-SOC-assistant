const HttpError = require('../utils/httpError');

// validate(schema) checks req.body against a zod schema.
// On success req.body is replaced by the cleaned data (trimmed, lowercased, unknown fields rejected).
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new HttpError(400, 'Validation failed', details));
    }
    req.body = result.data;
    return next();
  };
}

module.exports = validate;
