const { buildAlertContext, buildIncidentContext, MAX_ALERTS_IN_INCIDENT } = require('../src/utils/assistantContext');

const alert = (over = {}) => ({
  severity: 'high', status: 'new', predictedLabel: 'attack', attackCategory: 'DoS', confidence: 0.9, categoryConfidence: 0.6,
  modelVersion: 'v1', sourceFileName: 'f.csv', rowIndex: 7, record: { srcip: '10.0.0.5', dport: 80, nested: { a: 1 }, list: [1] }, ...over,
});
const labels = (ctx) => ctx.caseData.map((s) => s.label);

describe('buildAlertContext', () => {
  it('does not include raw row values unless asked', () => {
    const ctx = buildAlertContext(alert());
    expect(labels(ctx)).toEqual(['Alert']);
    expect(JSON.stringify(ctx).includes('10.0.0.5')).toBe(false);
  });

  it('includes plain row values when asked, and leaves out nested ones', () => {
    const ctx = buildAlertContext(alert(), { includeRowValues: true });
    expect(labels(ctx)).toEqual(['Alert', 'Alert flow record']);
    expect(ctx.caseData[1].fields).toEqual({ srcip: '10.0.0.5', dport: 80 });
  });

  it('describes the alert with the CSV line number and uses the category as the search hint', () => {
    const ctx = buildAlertContext(alert());
    expect(ctx.caseData[0].fields.csv_line).toBe(9);
    expect(ctx.caseData[0].fields.attack_score).toBe(0.9);
    expect(ctx.hint).toBe('DoS');
  });

  it('skips empty fields and caps the number of row values', () => {
    const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`c${i}`, i]));
    const ctx = buildAlertContext(alert({ attackCategory: undefined, record: many }), { includeRowValues: true });
    expect('likely_category' in ctx.caseData[0].fields).toBe(false);
    expect(Object.keys(ctx.caseData[1].fields).length).toBe(50);
    expect(ctx.hint).toBe(undefined);
  });

  it('copes with an alert that has no stored row', () => {
    expect(labels(buildAlertContext(alert({ record: undefined }), { includeRowValues: true }))).toEqual(['Alert']);
  });
});

describe('buildIncidentContext', () => {
  const incident = { title: 'Scan', severity: 'high', status: 'open', description: 'seen', notes: [{ text: 'SECRET NOTE' }] };

  it('never sends notes or row values', () => {
    const ctx = buildIncidentContext(incident, [alert()]);
    const text = JSON.stringify(ctx);
    expect(text.includes('SECRET NOTE')).toBe(false);
    expect(text.includes('10.0.0.5')).toBe(false);
  });

  it('sends at most three linked alerts, highest score first', () => {
    const alerts = [0.1, 0.9, 0.5, 0.7, 0.3].map((c, i) => alert({ confidence: c, rowIndex: i }));
    const ctx = buildIncidentContext(incident, alerts);
    expect(labels(ctx)).toEqual(['Incident', 'Alert 1', 'Alert 2', 'Alert 3']);
    expect(MAX_ALERTS_IN_INCIDENT).toBe(3);
    expect(ctx.caseData.slice(1).map((s) => s.fields.attack_score)).toEqual([0.9, 0.7, 0.5]);
    expect(ctx.caseData[0].fields.linked_alerts).toBe(5);
  });

  it('collects distinct categories as the search hint', () => {
    const ctx = buildIncidentContext(incident, [alert({ attackCategory: 'DoS' }), alert({ attackCategory: 'Fuzzers' }), alert({ attackCategory: 'DoS' })]);
    expect(ctx.hint).toBe('DoS Fuzzers');
  });

  it('works for an incident with no alerts', () => {
    const ctx = buildIncidentContext(incident, []);
    expect(labels(ctx)).toEqual(['Incident']);
    expect(ctx.hint).toBe(undefined);
  });
});
