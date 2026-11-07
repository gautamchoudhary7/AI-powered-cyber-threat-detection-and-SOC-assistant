// Shared allowed values, so models and validators never drift apart.
module.exports = {
  ROLES: ['analyst', 'admin'],
  SEVERITIES: ['low', 'medium', 'high', 'critical'],
  ALERT_STATUSES: ['new', 'investigating', 'resolved', 'false_positive'],
  INCIDENT_STATUSES: ['open', 'investigating', 'contained', 'closed'],
  REPORT_TYPES: ['detection_summary', 'incident'],
  AGENT_STATUSES: ['pending', 'approved', 'executed', 'failed', 'rejected', 'expired'],
};
