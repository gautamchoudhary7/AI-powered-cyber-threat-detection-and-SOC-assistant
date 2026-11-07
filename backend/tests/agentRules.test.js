const { buildProposals, proposeFromAlerts, proposeFromIncidents, safeLabel, GROUP_MIN, MAX_PROPOSALS } = require('../src/utils/agentRules');
const { validateAction, isKnownAction, ACTION_NAMES } = require('../src/utils/agentActions');

let n = 0;
const oid = () => (++n).toString(16).padStart(24, '0');
const alert = (over = {}) => ({
  _id: oid(), jobId: 'a'.repeat(24), status: 'new', severity: 'critical', attackCategory: 'DoS', confidence: 0.97, sourceFileName: 'f.csv', ...over,
});
const many = (k, over) => Array.from({ length: k }, () => alert(over));
const ruleIds = (ps) => ps.map((p) => p.ruleId);

describe('proposeFromAlerts: grouping', () => {
  it('suggests one incident for three or more high-severity alerts of the same category and file', () => {
    const ps = proposeFromAlerts(many(GROUP_MIN));
    expect(ruleIds(ps)).toEqual(['group_high_severity']);
    expect(ps[0].action).toBe('create_incident');
    expect(ps[0].params.alertIds.length).toBe(3);
    expect(ps[0].params.severity).toBe('critical');
    expect(ps[0].params.title).toBe('Review 3 DoS alerts from f.csv');
  });

  it('does not group fewer than three, different categories or different files', () => {
    expect(proposeFromAlerts(many(2)).filter((p) => p.ruleId === 'group_high_severity').length).toBe(0);
    const mixed = [alert({ attackCategory: 'DoS' }), alert({ attackCategory: 'Fuzzers' }), alert({ attackCategory: 'Exploits' })];
    expect(ruleIds(proposeFromAlerts(mixed)).includes('group_high_severity')).toBe(false);
    const files = [alert({ jobId: '1'.repeat(24) }), alert({ jobId: '2'.repeat(24) }), alert({ jobId: '3'.repeat(24) })];
    expect(ruleIds(proposeFromAlerts(files)).includes('group_high_severity')).toBe(false);
  });

  it('uses severity "high" when none of the grouped alerts is critical, and counts high alerts', () => {
    const ps = proposeFromAlerts(many(3, { severity: 'high' }));
    expect(ps[0].params.severity).toBe('high');
    expect(ps.length).toBe(1); // high alerts never get single-alert suggestions
  });

  it('ignores alerts that someone already looked at, and low or medium severity', () => {
    expect(proposeFromAlerts(many(5, { status: 'investigating' })).length).toBe(0);
    expect(proposeFromAlerts(many(5, { severity: 'medium' })).length).toBe(0);
  });

  it('does not suggest a second action for alerts that are already in a suggested incident', () => {
    const ps = proposeFromAlerts(many(4));
    expect(ruleIds(ps)).toEqual(['group_high_severity']);
  });

  it('links at most 50 alerts, highest score first', () => {
    const alerts = Array.from({ length: 60 }, (_, i) => alert({ confidence: i / 100 }));
    const p = proposeFromAlerts(alerts)[0];
    expect(p.params.alertIds.length).toBe(50);
    expect(p.summary.includes('50 linked alerts')).toBe(true);
    expect(p.rationale.includes('60 alerts')).toBe(true);
  });
});

describe('proposeFromAlerts: single critical alerts', () => {
  it('suggests marking lone critical alerts as investigating, and says what it expects the current status to be', () => {
    const a = alert();
    const ps = proposeFromAlerts([a, alert({ attackCategory: 'Fuzzers', jobId: 'b'.repeat(24) })]);
    expect(ruleIds(ps)).toEqual(['triage_critical', 'triage_critical']);
    expect(ps[0].params).toEqual({ alertId: ps[0].params.alertId, expectedStatus: 'new', newStatus: 'investigating' });
  });

  it('caps single suggestions at 20, highest score first', () => {
    const alerts = Array.from({ length: 30 }, (_, i) => alert({ jobId: oid(), confidence: 0.5 + i / 100 }));
    const ps = proposeFromAlerts(alerts);
    expect(ps.length).toBe(20);
    expect(ps[0].evidence.alertIds[0]).toBe(String(alerts[29]._id));
  });
});

describe('proposeFromIncidents', () => {
  const inc = (over = {}) => ({ _id: oid(), title: 'Scan', status: 'open', alerts: [], ...over });
  const map = (...as) => new Map(as.map((a) => [String(a._id), a]));

  it('suggests "contained" only when every linked alert is resolved or a false positive', () => {
    const a1 = alert({ status: 'resolved' });
    const a2 = alert({ status: 'false_positive' });
    const ps = proposeFromIncidents([inc({ alerts: [a1._id, a2._id] })], map(a1, a2));
    expect(ps.length).toBe(1);
    expect(ps[0].params.newStatus).toBe('contained');
    expect(ps[0].params.expectedStatus).toBe('open');
  });

  it('says nothing when an alert is still open, missing, or the incident is already contained or empty', () => {
    const done = alert({ status: 'resolved' });
    const open = alert({ status: 'investigating' });
    expect(proposeFromIncidents([inc({ alerts: [done._id, open._id] })], map(done, open)).length).toBe(0);
    expect(proposeFromIncidents([inc({ alerts: [done._id, oid()] })], map(done)).length).toBe(0);
    expect(proposeFromIncidents([inc({ alerts: [done._id], status: 'contained' })], map(done)).length).toBe(0);
    expect(proposeFromIncidents([inc({ alerts: [] })], map()).length).toBe(0);
  });
});

describe('buildProposals', () => {
  it('caps the total per scan and says it was cut', () => {
    const alerts = Array.from({ length: 30 }, () => alert({ jobId: oid() }));
    const out = buildProposals({ alerts, incidents: [], alertsById: new Map() });
    expect(out.proposals.length).toBe(MAX_PROPOSALS > 20 ? 20 : MAX_PROPOSALS);
    const more = Array.from({ length: 30 }, () => alert({ jobId: oid() }));
    const groups = Array.from({ length: 30 }, () => many(3, { jobId: oid() })).flat();
    const big = buildProposals({ alerts: [...more, ...groups], incidents: [], alertsById: new Map() });
    expect(big.proposals.length).toBe(MAX_PROPOSALS);
    expect(big.truncated).toBe(true);
  });

  it('is deterministic and gives every suggestion a unique dedupe key', () => {
    const alerts = [...many(3), ...Array.from({ length: 5 }, () => alert({ jobId: oid() }))];
    const a = buildProposals({ alerts, incidents: [], alertsById: new Map() });
    const b = buildProposals({ alerts, incidents: [], alertsById: new Map() });
    expect(a).toEqual(b);
    const keys = a.proposals.map((p) => p.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only ever proposes whitelisted actions with valid parameters', () => {
    const alerts = [...many(3), alert({ jobId: oid() })];
    const done = alert({ status: 'resolved' });
    const out = buildProposals({ alerts, incidents: [{ _id: oid(), title: 'x', status: 'open', alerts: [done._id] }], alertsById: new Map([[String(done._id), done]]) });
    expect(out.proposals.length).toBe(3);
    out.proposals.forEach((p) => {
      expect(isKnownAction(p.action)).toBe(true);
      expect(validateAction(p.action, p.params).ok).toBe(true);
    });
  });
});

describe('safeLabel', () => {
  it('removes control characters and angle brackets and limits length', () => {
    expect(safeLabel('a\nb<script>')).toBe('a b script');
    expect(safeLabel('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
    expect(safeLabel('')).toBe('unnamed file');
    expect(safeLabel(null)).toBe('unnamed file');
  });

  it('keeps a hostile file name out of the suggestion title', () => {
    const p = proposeFromAlerts(many(3, { sourceFileName: 'x\n<img src=x onerror=1>.csv' }))[0];
    expect(p.params.title.includes('<')).toBe(false);
    expect(p.params.title.includes('\n')).toBe(false);
    expect(validateAction('create_incident', p.params).ok).toBe(true);
  });
});

describe('validateAction (the whitelist)', () => {
  const A = 'a'.repeat(24);
  const good = {
    create_incident: { title: 'Review things', severity: 'high', alertIds: [A] },
    set_alert_status: { alertId: A, expectedStatus: 'new', newStatus: 'investigating' },
    set_incident_status: { incidentId: A, expectedStatus: 'open', newStatus: 'contained' },
  };

  it('knows exactly three actions', () => {
    expect(ACTION_NAMES).toEqual(['create_incident', 'set_alert_status', 'set_incident_status']);
  });

  it('accepts correct parameters for each', () => {
    for (const [action, params] of Object.entries(good)) expect(validateAction(action, params).ok).toBe(true);
  });

  it('refuses anything that is not on the list, including prototype tricks', () => {
    for (const name of ['delete_alert', 'run_command', 'block_ip', '__proto__', 'constructor', 'toString', '', null, undefined, 42]) {
      expect(validateAction(name, {}).ok).toBe(false);
    }
  });

  it('refuses extra, missing or wrongly typed parameters', () => {
    expect(validateAction('set_alert_status', { ...good.set_alert_status, role: 'admin' }).ok).toBe(false);
    expect(validateAction('set_alert_status', { alertId: A, newStatus: 'resolved' }).ok).toBe(false);
    expect(validateAction('set_alert_status', { ...good.set_alert_status, alertId: { $ne: null } }).ok).toBe(false);
    expect(validateAction('set_alert_status', { ...good.set_alert_status, newStatus: 'deleted' }).ok).toBe(false);
    expect(validateAction('create_incident', { ...good.create_incident, alertIds: [] }).ok).toBe(false);
    expect(validateAction('create_incident', { ...good.create_incident, alertIds: [A, A] }).ok).toBe(false);
    expect(validateAction('create_incident', { ...good.create_incident, alertIds: Array.from({ length: 101 }, (_, i) => i.toString(16).padStart(24, '0')) }).ok).toBe(false);
    expect(validateAction('create_incident', { ...good.create_incident, title: 'ab' }).ok).toBe(false);
    expect(validateAction('create_incident', { ...good.create_incident, title: 'bad\ntitle' }).ok).toBe(false);
    expect(validateAction('create_incident', { ...good.create_incident, title: ' padded ' }).ok).toBe(false);
    expect(validateAction('set_alert_status', null).ok).toBe(false);
    expect(validateAction('set_alert_status', [A]).ok).toBe(false);
  });

  it('refuses a "change" to the same status', () => {
    expect(validateAction('set_alert_status', { ...good.set_alert_status, newStatus: 'new' }).ok).toBe(false);
    expect(validateAction('set_incident_status', { ...good.set_incident_status, newStatus: 'open' }).ok).toBe(false);
  });

  it('returns a copy, so the caller cannot change the checked value afterwards', () => {
    const r = validateAction('set_alert_status', good.set_alert_status);
    r.params.newStatus = 'resolved';
    expect(good.set_alert_status.newStatus).toBe('investigating');
  });
});
