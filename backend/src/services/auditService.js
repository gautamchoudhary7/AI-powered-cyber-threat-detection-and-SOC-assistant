const AuditLog = require('../models/AuditLog');

// Records an important action. If writing the log fails we print a short warning
// but do NOT fail the user's request. Never pass passwords or tokens in `metadata`.
async function log({ actor, action, resourceType, resourceId, ip, metadata }) {
  try {
    await AuditLog.create({ actor, action, resourceType, resourceId, ip, metadata });
  } catch (err) {
    console.error('Audit log write failed:', err.name);
  }
}

module.exports = { log };
