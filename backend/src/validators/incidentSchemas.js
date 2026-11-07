const { z } = require('zod');
const { SEVERITIES, INCIDENT_STATUSES } = require('../constants');
const { objectId } = require('./detectionSchemas');

const title = z.string({ invalid_type_error: 'Title must be text' }).trim().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters');
const description = z.string({ invalid_type_error: 'Description must be text' }).trim().max(5000, 'Description must be at most 5000 characters');

const createIncidentSchema = z
  .object({
    title: title,
    description: description.optional(),
    severity: z.enum(SEVERITIES).optional(),
    alertIds: z.array(objectId).max(100, 'Link at most 100 alerts').optional(),
  })
  .strict();

// Only these fields can be changed. Linked alerts, owner and notes cannot be edited through this route.
const updateIncidentSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    severity: z.enum(SEVERITIES).optional(),
    status: z.enum(INCIDENT_STATUSES).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change' });

const noteSchema = z
  .object({ text: z.string({ required_error: 'Note text is required', invalid_type_error: 'Note must be text' }).trim().min(1, 'Note cannot be empty').max(5000, 'Note must be at most 5000 characters') })
  .strict();

const incidentQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(INCIDENT_STATUSES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

module.exports = { createIncidentSchema, updateIncidentSchema, noteSchema, incidentQuerySchema };
