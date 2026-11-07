const { z } = require('zod');
const { AGENT_STATUSES } = require('../constants');

// Scan and approve take no input at all: the server decides what to suggest and what a suggestion does.
// .strict() makes any extra field an error, so a client cannot try to pass its own action or parameters.
const emptyBodySchema = z.object({}).strict();

const rejectSchema = z
  .object({ reason: z.string({ invalid_type_error: 'Reason must be text' }).trim().max(300, 'Reason must be at most 300 characters').optional() })
  .strict();

const proposalQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(AGENT_STATUSES).optional(),
  })
  .strict();

module.exports = { emptyBodySchema, rejectSchema, proposalQuerySchema };
