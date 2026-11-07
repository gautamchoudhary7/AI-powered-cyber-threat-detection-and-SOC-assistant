const mongoose = require('mongoose');
const { ROLES } = require('../constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    // select:false means queries do NOT return the hash unless asked explicitly.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'analyst' },
    isActive: { type: Boolean, default: true },
    // Set when the password changes. Tokens issued before this moment are rejected (see middleware/auth.js).
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

// Safety net: even if a User is accidentally sent to a client, the hash is removed.
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
