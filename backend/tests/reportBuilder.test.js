const {
  buildDetectionSummary, buildIncidentReport, mdCell, mdQuote, MAX_CONTENT_CHARS,
} = require('../src/utils/reportBuilder');

const has = (text, part) => text.includes(part);
const AT = new Date('2026-11-01T02:30:00Z');

const job = (over = {}) => ({
  fileName: 'flows.csv', totalRows: 1000, attackCount: 250, normalCount: 750,
  categoryCounts: [{ category: 'Fuzzers', count: 50 }, { category: 'DoS', count: 200 }],
  modelVersion: 'binary-v1', categoryModelVersion: 'multi-v1', warnings: [],
  createdAt: new Date('2026-11-01T01:00:00Z'), finishedAt: new Date('2026-11-01T01:05:00Z'), ...over,
});

describe('mdCell', () => {
  it('escapes pipes so a value cannot break a table', () => {
    expect(mdCell('a|b')).toBe('a\\|b');
  });
  it('flattens line breaks and control characters to one line', () => {
    expect(mdCell('a\nb\r\nc\u0000d')).toBe('a b c d');
  });
  it('neutralises angle brackets and backticks', () => {
    expect(mdCell('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
    expect(mdCell('`code`')).toBe("'code'");
  });
  it('shortens long text and handles missing values', () => {
    expect(mdCell('x'.repeat(300), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(mdCell(null)).toBe('');
    expect(mdCell(undefined)).toBe('');
  });
});

describe('mdQuote', () => {
  it('keeps line breaks but quotes each line so it cannot become a heading', () => {
    expect(mdQuote('# not a heading\nsecond')).toBe('> # not a heading\n> second');
  });
  it('shows a placeholder for empty text and neutralises tags', () => {
    expect(mdQuote('   ')).toBe('> (empty)');
    expect(mdQuote('<b>x</b>')).toBe('> &lt;b&gt;x&lt;/b&gt;');
  });
});

describe('buildDetectionSummary', () => {
  const input = () => ({
    job: job(),
    severityCounts: { critical: 5, high: 45, medium: 100, low: 100 },
    statusCounts: { new: 240, resolved: 10 },
    topAlerts: [{ severity: 'critical', status: 'new', attackCategory: 'DoS', attackScore: 0.987654, csvLine: 9 }],
    generatedAt: AT, generatedBy: 'Asha Verma',
  });

  it('is deterministic: the same input gives the same text', () => {
    expect(buildDetectionSummary(input())).toBe(buildDetectionSummary(input()));
  });

  it('reports the real numbers and the generation details', () => {
    const md = buildDetectionSummary(input());
    expect(has(md, '# Detection summary: flows.csv')).toBe(true);
    expect(has(md, '| Rows analysed | 1,000 |')).toBe(true);
    expect(has(md, '| Flagged by the model | 250 (25%) |')).toBe(true);
    expect(has(md, '| Critical | 5 |')).toBe(true);
    expect(has(md, '| Resolved | 10 |')).toBe(true);
    expect(has(md, '| 9 | Critical | 0.988 | DoS | New |')).toBe(true);
    expect(has(md, 'Generated 2026-11-01 02:30 UTC by Asha Verma.')).toBe(true);
  });

  it('lists categories largest first', () => {
    const md = buildDetectionSummary(input());
    expect(md.indexOf('| DoS | 200 |') < md.indexOf('| Fuzzers | 50 |')).toBe(true);
  });

  it('always states the limits of the model', () => {
    const md = buildDetectionSummary(input());
    expect(has(md, 'not confirmed attacks')).toBe(true);
    expect(has(md, 'not a calibrated probability')).toBe(true);
  });

  it('says so when nothing was flagged or stored', () => {
    const md = buildDetectionSummary({ ...input(), job: job({ attackCount: 0, normalCount: 1000, categoryCounts: [] }), topAlerts: [], severityCounts: {}, statusCounts: {} });
    expect(has(md, 'The model flagged nothing in this file.')).toBe(true);
    expect(has(md, 'There are no stored alerts for this analysis.')).toBe(true);
    expect(has(md, '| Low | 0 |')).toBe(true);
  });

  it('does not divide by zero when the row count is unknown', () => {
    const md = buildDetectionSummary({ ...input(), job: job({ totalRows: 0, attackCount: 0 }) });
    expect(has(md, '(n/a)')).toBe(true);
  });

  it('keeps a hostile file name from breaking the table or injecting HTML', () => {
    const md = buildDetectionSummary({ ...input(), job: job({ fileName: 'a|b<img src=x>.csv' }) });
    expect(has(md, '| File | a\\|b&lt;img src=x&gt;.csv |')).toBe(true);
    expect(has(md, '<img')).toBe(false);
  });

  it('includes analysis warnings when there are some', () => {
    const md = buildDetectionSummary({ ...input(), job: job({ warnings: ['3 rows skipped'] }) });
    expect(has(md, '## Notes from the analysis')).toBe(true);
    expect(has(md, '- 3 rows skipped')).toBe(true);
  });
});

describe('buildIncidentReport', () => {
  const incident = (over = {}) => ({
    title: 'Suspicious scan', description: 'Seen in flows.csv\n# fake heading', severity: 'high', status: 'contained',
    createdAt: new Date('2026-11-01T01:00:00Z'), updatedAt: new Date('2026-11-01T02:00:00Z'),
    notes: [{ author: 'Asha', text: 'Blocked the host', createdAt: new Date('2026-11-01T01:30:00Z') }], ...over,
  });
  const alerts = [{ severity: 'critical', status: 'investigating', attackCategory: 'DoS', attackScore: 0.97, sourceFileName: 'f.csv', csvLine: 9 }];

  it('contains the incident fields, linked alerts and notes', () => {
    const md = buildIncidentReport({ incident: incident(), alerts, generatedAt: AT, generatedBy: 'Asha' });
    expect(has(md, '# Incident report: Suspicious scan')).toBe(true);
    expect(has(md, '| Status | Contained |')).toBe(true);
    expect(has(md, '| Critical | 0.970 | DoS | Investigating | f.csv, line 9 |')).toBe(true);
    expect(has(md, '**Asha**, 2026-11-01 01:30 UTC')).toBe(true);
    expect(has(md, '> Blocked the host')).toBe(true);
  });

  it('quotes the description so it cannot create headings', () => {
    const md = buildIncidentReport({ incident: incident(), alerts, generatedAt: AT, generatedBy: 'Asha' });
    expect(has(md, '> # fake heading')).toBe(true);
    expect(has(md, '\n# fake heading')).toBe(false);
  });

  it('handles an incident with no alerts and no notes', () => {
    const md = buildIncidentReport({ incident: incident({ notes: [] }), alerts: [], generatedAt: AT, generatedBy: 'Asha' });
    expect(has(md, 'No alerts are linked to this incident.')).toBe(true);
    expect(has(md, 'No notes have been added.')).toBe(true);
  });

  it('stays below the stored size limit even with huge notes', () => {
    const notes = Array.from({ length: 200 }, (_, i) => ({ author: 'A', text: 'x'.repeat(5000), createdAt: AT, i }));
    const md = buildIncidentReport({ incident: incident({ notes }), alerts: [], generatedAt: AT, generatedBy: 'Asha' });
    expect(md.length < MAX_CONTENT_CHARS + 200).toBe(true);
    expect(has(md, 'cut short')).toBe(true);
  });
});
