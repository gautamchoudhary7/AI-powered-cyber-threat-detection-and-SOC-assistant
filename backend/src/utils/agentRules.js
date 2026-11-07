// The "agent" brain. Pure functions: alerts and incidents in, SUGGESTIONS out. No database, no network, no AI.
//
// Why no language model decides anything here: alert text and CSV values can contain instructions meant to
// trick a model (prompt injection), and a model can be wrong. These rules are short, fixed and readable, so a
// person can check exactly why something was suggested. Nothing here changes anything; a human must approve
// each suggestion, and only three whitelisted actions exist (see agentActions.js).


const GROUP_MIN = 3; // this many similar alerts from one file become one suggested incident
const MAX_GROUP_ALERTS = 50; // alerts linked to one suggested incident (the incident API allows 100)
const MAX_SINGLE_PROPOSALS = 20; // single-alert suggestions per scan, highest score first
const MAX_PROPOSALS = 25; // per scan, so one scan can never flood the review list
const HIGH = ['critical', 'high'];

const id = (v) => String(v);

// File names come from users. Control characters and brackets are removed and the length is limited.
function safeLabel(value, max = 60) {
  const flat = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (flat.length > max ? `${flat.slice(0, max - 1)}…` : flat) || 'unnamed file';
}

const byScoreDesc = (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || id(a._id).localeCompare(id(b._id));

// Rule 1: several high-severity alerts of the same predicted category from the same file -> one incident.
// Rule 2: any other critical alert nobody has looked at -> mark it "investigating".
function proposeFromAlerts(alerts) {
  const fresh = (alerts || []).filter((a) => a.status === 'new' && HIGH.includes(a.severity));
  const groups = new Map();
  for (const a of fresh) {
    const key = `${a.jobId ? id(a.jobId) : 'nojob'}|${a.attackCategory || 'uncategorised'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  const proposals = [];
  const grouped = new Set();
  for (const [key, members] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (members.length < GROUP_MIN) continue;
    const sorted = [...members].sort(byScoreDesc).slice(0, MAX_GROUP_ALERTS);
    sorted.forEach((a) => grouped.add(id(a._id)));
    members.forEach((a) => grouped.add(id(a._id)));
    const category = members[0].attackCategory || 'uncategorised';
    const file = safeLabel(members[0].sourceFileName);
    const severity = members.some((a) => a.severity === 'critical') ? 'critical' : 'high';
    const title = `Review ${members.length} ${safeLabel(category, 40)} alerts from ${file}`.slice(0, 200);
    proposals.push({
      ruleId: 'group_high_severity',
      action: 'create_incident',
      params: { title, severity, alertIds: sorted.map((a) => id(a._id)) },
      summary: `Create an incident "${title}" with ${sorted.length} linked alerts (severity ${severity}).`,
      rationale:
        `${members.length} alerts with high or critical severity were predicted as "${safeLabel(category, 40)}" in the same file and nobody has looked at them yet. `
        + 'Grouping them in one incident makes them easier to review together. This is a suggestion from a fixed rule, based on model predictions that may be wrong.',
      evidence: { alertIds: sorted.map((a) => id(a._id)), incidentIds: [] },
      dedupeKey: `group:${key}`,
    });
  }

  const singles = fresh
    .filter((a) => a.severity === 'critical' && !grouped.has(id(a._id)))
    .sort(byScoreDesc)
    .slice(0, MAX_SINGLE_PROPOSALS);
  for (const a of singles) {
    proposals.push({
      ruleId: 'triage_critical',
      action: 'set_alert_status',
      params: { alertId: id(a._id), expectedStatus: 'new', newStatus: 'investigating' },
      summary: `Mark alert ${id(a._id).slice(-6)} (critical, ${safeLabel(a.attackCategory || 'no category', 40)}) as "investigating".`,
      rationale:
        'This alert has critical severity and is still marked "new". Marking it as investigating shows that someone is looking at it. '
        + 'Severity is a rule applied to the model\'s attack score, not a confirmed finding.',
      evidence: { alertIds: [id(a._id)], incidentIds: [] },
      dedupeKey: `triage:${id(a._id)}`,
    });
  }
  return proposals;
}

// Rule 3: an open incident whose linked alerts are all resolved or false positives -> suggest "contained".
// (Closing is left to a person; the suggestion stops one step before.)
function proposeFromIncidents(incidents, alertsById) {
  const lookup = alertsById instanceof Map ? alertsById : new Map(Object.entries(alertsById || {}));
  const proposals = [];
  for (const inc of incidents || []) {
    if (!['open', 'investigating'].includes(inc.status)) continue;
    const linked = (inc.alerts || []).map(id);
    if (linked.length === 0) continue;
    const alerts = linked.map((l) => lookup.get(l));
    if (alerts.some((a) => !a)) continue; // a linked alert is missing from the data: do not guess
    if (!alerts.every((a) => ['resolved', 'false_positive'].includes(a.status))) continue;
    proposals.push({
      ruleId: 'contain_when_alerts_done',
      action: 'set_incident_status',
      params: { incidentId: id(inc._id), expectedStatus: inc.status, newStatus: 'contained' },
      summary: `Mark incident "${safeLabel(inc.title, 80)}" as "contained" (all ${linked.length} linked alerts are resolved or false positives).`,
      rationale:
        `Every alert linked to this incident is now resolved or marked as a false positive, but the incident is still "${inc.status}". `
        + 'Check that nothing else is outstanding before you approve.',
      evidence: { alertIds: linked.slice(0, 100), incidentIds: [id(inc._id)] },
      dedupeKey: `contain:${id(inc._id)}`,
    });
  }
  return proposals;
}

// Combines the rules and applies the per-scan cap. Order: incidents first (closing the loop), then groups, then singles.
function buildProposals({ alerts, incidents, alertsById }) {
  const all = [...proposeFromIncidents(incidents, alertsById), ...proposeFromAlerts(alerts)];
  return { proposals: all.slice(0, MAX_PROPOSALS), truncated: all.length > MAX_PROPOSALS };
}

module.exports = {
  buildProposals, proposeFromAlerts, proposeFromIncidents, safeLabel,
  GROUP_MIN, MAX_PROPOSALS, MAX_SINGLE_PROPOSALS, MAX_GROUP_ALERTS,
};
