const { z } = require('zod');
const { objectId } = require('./detectionSchemas');

// The user may point the question at ONE alert or ONE incident. The server loads that record itself
// (checking the user is allowed to see it); the client never sends case data directly.
const askSchema = z
  .object({
    question: z
      .string({ required_error: 'Question is required', invalid_type_error: 'Question must be text' })
      .trim()
      .min(3, 'Question must be at least 3 characters')
      .max(500, 'Question must be at most 500 characters'),
    alertId: objectId.optional(),
    incidentId: objectId.optional(),
    // Off unless the analyst ticks the box. Only meaningful for a question about one alert.
    includeRowValues: z.boolean({ invalid_type_error: 'includeRowValues must be true or false' }).optional(),
  })
  .strict()
  .refine((b) => !(b.alertId && b.incidentId), { message: 'Choose either an alert or an incident, not both' })
  .refine((b) => !b.includeRowValues || Boolean(b.alertId), { message: 'Row values can only be included when asking about an alert', path: ['includeRowValues'] });

// General chat: just a question. There is deliberately no alertId, incidentId or row data here, so nothing from the
// user's own records can reach the language model through this route.
const chatSchema = z
  .object({
    question: z
      .string({ required_error: 'Question is required', invalid_type_error: 'Question must be text' })
      .trim()
      .min(3, 'Question must be at least 3 characters')
      .max(1000, 'Question must be at most 1000 characters'),
  })
  .strict();

module.exports = { askSchema, chatSchema };
