const { z } = require('zod');
const { password } = require('./authSchemas');

// Only the name can be edited. Email, role and active status are deliberately not changeable here
// (.strict() rejects them), so this route can never be used to make yourself an admin.
const updateProfileSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required', invalid_type_error: 'Name must be text' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name must be at most 80 characters'),
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Current password is required', invalid_type_error: 'Current password must be text' })
      .min(1, 'Current password is required')
      .max(72, 'Current password must be at most 72 characters'),
    newPassword: password,
  })
  .strict();

module.exports = { updateProfileSchema, changePasswordSchema };
