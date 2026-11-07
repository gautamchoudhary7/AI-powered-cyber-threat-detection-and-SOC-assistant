const { z } = require('zod');
const { ALLOWED_RANGES, DEFAULT_RANGE } = require('../utils/dashboardHelpers');

const trendsQuerySchema = z
  .object({
    days: z.coerce
      .number()
      .refine((n) => ALLOWED_RANGES.includes(n), { message: `days must be one of ${ALLOWED_RANGES.join(', ')}` })
      .default(DEFAULT_RANGE),
  })
  .strict();

module.exports = { trendsQuerySchema };
