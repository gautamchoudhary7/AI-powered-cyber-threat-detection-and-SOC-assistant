const mongoose = require('mongoose');

// Append-only record of important actions (logins, status changes, agent actions).
// Never store passwords, tokens or other secrets in `metadata`.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // empty for failed logins
    action: { type: String, required: true, trim: true, maxlength: 100 },
    resourceType: { type: String, maxlength: 50 },
    resourceId: { type: String, maxlength: 100 },
    ip: { type: String, maxlength: 64 },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
