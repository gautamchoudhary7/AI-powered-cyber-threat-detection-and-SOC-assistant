// Turns an alert or an incident into "case data" for the assistant. Pure functions, no database.
// Only fields that help explain the case are sent. Incident notes are NOT sent (they may hold sensitive details).
// An alert's raw row values (addresses, ports, ...) are sent ONLY when the caller asks for them.
// Values here still come from CSV files and users, so the AI service treats them as untrusted data.

const MAX_RECORD_FIELDS = 50;
const MAX_ALERTS_IN_INCIDENT = 3;

const present = (fields) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== ''));

function alertSections(alert, label = 'Alert', includeRowValues = false) {
  const sections = [{
    label,
    fields: present({
      severity: alert.severity,
      status: alert.status,
      predicted_label: alert.predictedLabel,
      likely_category: alert.attackCategory,
      attack_score: alert.confidence,
      category_score: alert.categoryConfidence,
      model_version: alert.modelVersion,
      source_file: alert.sourceFileName,
      csv_line: typeof alert.rowIndex === 'number' ? alert.rowIndex + 2 : undefined,
    }),
  }];
  const record = alert.record && typeof alert.record === 'object' && !Array.isArray(alert.record) ? alert.record : null;
  if (includeRowValues && record) {
    const entries = Object.entries(record)
      .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
      .slice(0, MAX_RECORD_FIELDS);
    if (entries.length) sections.push({ label: `${label} flow record`, fields: Object.fromEntries(entries) });
  }
  return sections;
}

// -> { caseData, hint }
function buildAlertContext(alert, { includeRowValues = false } = {}) {
  return { caseData: alertSections(alert, 'Alert', includeRowValues), hint: alert.attackCategory || undefined };
}

// -> { caseData, hint }. Includes at most three linked alerts, highest score first.
function buildIncidentContext(incident, alerts = []) {
  const caseData = [{
    label: 'Incident',
    fields: present({
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      description: incident.description,
      linked_alerts: alerts.length,
    }),
  }];
  const top = [...alerts].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, MAX_ALERTS_IN_INCIDENT);
  top.forEach((a, i) => {
    caseData.push({ label: `Alert ${i + 1}`, fields: alertSections(a)[0].fields });
  });
  const categories = [...new Set(top.map((a) => a.attackCategory).filter(Boolean))];
  return { caseData, hint: categories.join(' ') || undefined };
}

module.exports = { buildAlertContext, buildIncidentContext, MAX_RECORD_FIELDS, MAX_ALERTS_IN_INCIDENT };
