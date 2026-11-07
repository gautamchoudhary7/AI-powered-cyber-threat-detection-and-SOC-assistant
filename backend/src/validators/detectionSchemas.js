const { z } = require('zod');
const { SEVERITIES, ALERT_STATUSES } = require('../constants');

// Direct prediction is for small interactive checks. Bulk analysis goes through CSV upload.
// (The whole request body is also limited to 100 KB by the app.)
const MAX_DIRECT_RECORDS = 100;

const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);

const predictSchema = z
  .object({
    records: z
      .array(z.record(scalar), { required_error: 'records is required', invalid_type_error: 'records must be a list' })
      .min(1, 'Send at least one record')
      .max(MAX_DIRECT_RECORDS, `Send at most ${MAX_DIRECT_RECORDS} records per request`),
  })
  .strict();

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

const alertQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    severity: z.enum(SEVERITIES).optional(),
    status: z.enum(ALERT_STATUSES).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    jobId: objectId.optional(),
    sortBy: z.enum(['createdAt', 'severity', 'confidence']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

const alertStatusSchema = z.object({ status: z.enum(ALERT_STATUSES) }).strict();

module.exports = { predictSchema, alertQuerySchema, alertStatusSchema, objectId, MAX_DIRECT_RECORDS };
