const { z } = require('zod');
const { REPORT_TYPES } = require('../constants');
const { objectId } = require('./detectionSchemas');

const title = z.string({ invalid_type_error: 'Title must be text' }).trim().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters');

// The report body is never sent by the client. It is always built on the server from stored data,
// so a user cannot save arbitrary text as an official-looking report.
const createReportSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('detection_summary'), jobId: objectId, title: title.optional() }).strict(),
  z.object({ type: z.literal('incident'), incidentId: objectId, title: title.optional() }).strict(),
]);

const reportQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(REPORT_TYPES).optional(),
  })
  .strict();

module.exports = { createReportSchema, reportQuerySchema };
