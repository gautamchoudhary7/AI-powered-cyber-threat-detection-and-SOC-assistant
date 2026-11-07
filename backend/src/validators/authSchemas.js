const { z } = require('zod');

// bcrypt only uses the first 72 bytes of a password, so we cap the length at 72.
const password = z
  .string({ required_error: 'Password is required', invalid_type_error: 'Password must be text' })
  .min(10, 'Password must be at least 10 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one number');

const email = z
  .string({ required_error: 'Email is required', invalid_type_error: 'Email must be text' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .email('Enter a valid email address');

// .strict() rejects unknown fields. This is what stops someone sending {"role": "admin"} at registration.
const registerSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required', invalid_type_error: 'Name must be text' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name must be at most 80 characters'),
    email,
    password,
  })
  .strict();

const loginSchema = z
  .object({
    email,
    // Login does not re-check strength rules; it only needs a bounded string.
    password: z
      .string({ required_error: 'Password is required', invalid_type_error: 'Password must be text' })
      .min(1, 'Password is required')
      .max(72, 'Password must be at most 72 characters'),
  })
  .strict();

module.exports = { registerSchema, loginSchema, password };
