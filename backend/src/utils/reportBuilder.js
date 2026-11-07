// Builds Markdown reports from data that is already stored. Pure functions: same input, same output,
// no database, no clock, no AI. Everything shown comes from real records, and the limits of the
// model are stated in every report so nobody mistakes a prediction for a confirmed attack.

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const ALERT_STATUS_ORDER = ['new', 'investigating', 'resolved', 'false_positive'];
const MAX_CONTENT_CHARS = 90000; // the Report model allows 100000; leave room for the notice

const STATUS_LABELS = {
  new: 'New', investigating: 'Investigating', resolved: 'Resolved', false_positive: 'False positive',
  open: 'Open', contained: 'Contained', closed: 'Closed',
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};

const LIMITATIONS = [
  '## Limitations',
  '',
  '- Alerts are **model predictions, not confirmed attacks**. Verify the underlying traffic before acting.',
  '- The attack score is the model\'s output between 0 and 1. It is **not a calibrated probability**.',
  '- Severity is a project rule based on the attack score (0.70, 0.85 and 0.95 thresholds). It is a sorting aid, not a risk assessment.',
  '- The attack category is the second model\'s best guess and can be wrong.',
  '- This report was assembled from stored records. No AI-written analysis is included.',
].join('\n');

// Anything that came from a user or a CSV is untrusted text. It is flattened to one line,
// pipes are escaped so it cannot break a table, and angle brackets are neutralised so the
// text stays inert if the Markdown is later rendered somewhere that allows HTML.
function mdCell(value, maxLength = 200) {
  if (value === null || value === undefined) return '';
  let text = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLength) text = `${text.slice(0, maxLength - 1)}…`;
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, "'");
}

// For multi-line free text (incident description, notes): keep line breaks, quote every line
// so it cannot be read as a heading or a table, and neutralise angle brackets.
function mdQuote(value, maxLength = 5000) {
  let text = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (text.length > maxLength) text = `${text.slice(0, maxLength - 1)}…`;
  if (!text) return '> (empty)';
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

const count = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'unknown');
const score = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(3) : 'n/a');
const label = (v) => STATUS_LABELS[v] || mdCell(v, 40);
const when = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? 'unknown' : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  return [head, divider, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function breakdown(order, counts, extraLabel) {
  const rows = order.map((key) => [label(key), count(counts[key] || 0)]);
  return table([extraLabel, 'Alerts'], rows);
}

function footer({ generatedAt, generatedBy }) {
  return `_Generated ${when(generatedAt)} by ${mdCell(generatedBy, 100) || 'unknown user'}._`;
}

function cap(markdown) {
  if (markdown.length <= MAX_CONTENT_CHARS) return markdown;
  return `${markdown.slice(0, MAX_CONTENT_CHARS)}\n\n_This report was cut short because it is very long._`;
}

// ---------------------------------------------------------------------------------------------

function buildDetectionSummary({ job, severityCounts = {}, statusCounts = {}, topAlerts = [], generatedAt, generatedBy }) {
  const total = job.totalRows ?? 0;
  const share = total > 0 ? `${Math.round((job.attackCount / total) * 1000) / 10}%` : 'n/a';
  const categories = [...(job.categoryCounts || [])].sort((a, b) => b.count - a.count);

  const parts = [];
  parts.push(`# Detection summary: ${mdCell(job.fileName, 120)}`);
  parts.push(footer({ generatedAt, generatedBy }));

  parts.push([
    '## Overview',
    '',
    table(['Item', 'Value'], [
      ['File', mdCell(job.fileName, 120)],
      ['Analysed', when(job.finishedAt || job.createdAt)],
      ['Detection model', mdCell(job.modelVersion) || 'unknown'],
      ['Category model', mdCell(job.categoryModelVersion) || 'none'],
      ['Rows analysed', count(job.totalRows)],
      ['Flagged by the model', `${count(job.attackCount)} (${share})`],
      ['Not flagged', count(job.normalCount)],
    ]),
  ].join('\n'));

  parts.push([
    '## Flagged rows by predicted category',
    '',
    categories.length === 0
      ? (job.attackCount === 0 ? 'The model flagged nothing in this file.' : 'No category information is available.')
      : table(['Category', 'Rows'], categories.map((c) => [mdCell(c.category, 60), count(c.count)])),
  ].join('\n'));

  parts.push(['## Stored alerts by severity', '', breakdown(SEVERITY_ORDER, severityCounts, 'Severity')].join('\n'));
  parts.push(['## Stored alerts by investigation status', '', breakdown(ALERT_STATUS_ORDER, statusCounts, 'Status')].join('\n'));

  parts.push([
    '## Highest-scoring alerts',
    '',
    topAlerts.length === 0
      ? 'There are no stored alerts for this analysis.'
      : table(
        ['Line', 'Severity', 'Score', 'Likely category', 'Status'],
        topAlerts.map((a) => [
          a.csvLine ?? 'n/a', label(a.severity), score(a.attackScore), mdCell(a.attackCategory, 60) || 'none', label(a.status),
        ])
      ),
    '',
    'Line numbers refer to the uploaded CSV file (the header is line 1).',
  ].join('\n'));

  if ((job.warnings || []).length > 0) {
    parts.push(['## Notes from the analysis', '', ...job.warnings.map((w) => `- ${mdCell(w, 300)}`)].join('\n'));
  }

  parts.push(LIMITATIONS);
  return cap(parts.join('\n\n'));
}

// ---------------------------------------------------------------------------------------------

function buildIncidentReport({ incident, alerts = [], generatedAt, generatedBy }) {
  const notes = incident.notes || [];
  const parts = [];
  parts.push(`# Incident report: ${mdCell(incident.title, 150)}`);
  parts.push(footer({ generatedAt, generatedBy }));

  parts.push([
    '## Summary',
    '',
    table(['Item', 'Value'], [
      ['Severity', label(incident.severity)],
      ['Status', label(incident.status)],
      ['Opened', when(incident.createdAt)],
      ['Last updated', when(incident.updatedAt)],
      ['Linked alerts', count(alerts.length)],
      ['Notes', count(notes.length)],
    ]),
  ].join('\n'));

  parts.push(['## Description', '', mdQuote(incident.description || '')].join('\n'));

  parts.push([
    '## Linked alerts',
    '',
    alerts.length === 0
      ? 'No alerts are linked to this incident.'
      : table(
        ['Severity', 'Score', 'Likely category', 'Status', 'Source'],
        alerts.map((a) => [
          label(a.severity), score(a.attackScore), mdCell(a.attackCategory, 60) || 'none', label(a.status),
          `${mdCell(a.sourceFileName, 80)}${a.csvLine ? `, line ${a.csvLine}` : ''}`,
        ])
      ),
  ].join('\n'));

  parts.push([
    '## Investigation notes',
    '',
    notes.length === 0
      ? 'No notes have been added.'
      : notes.map((n) => `**${mdCell(n.author, 80) || 'Unknown user'}**, ${when(n.createdAt)}\n\n${mdQuote(n.text)}`).join('\n\n'),
  ].join('\n'));

  parts.push(LIMITATIONS);
  return cap(parts.join('\n\n'));
}

module.exports = {
  buildDetectionSummary, buildIncidentReport, mdCell, mdQuote, MAX_CONTENT_CHARS, SEVERITY_ORDER, ALERT_STATUS_ORDER,
};
