// Small pure functions used by the detection workflow. No packages needed, so they are easy to test.
const path = require('path');

const MAX_LISTED = 50;

// Severity is a RULE OF THIS PROJECT based on the model's attack score, not a fact from the model.
// The scores are not calibrated probabilities, so treat the bands as a way to sort alerts, nothing more.
const SEVERITY_BANDS = [
  { min: 0.95, severity: 'critical', rank: 4 },
  { min: 0.85, severity: 'high', rank: 3 },
  { min: 0.7, severity: 'medium', rank: 2 },
  { min: 0, severity: 'low', rank: 1 },
];

function severityFromScore(score) {
  const value = Number.isFinite(score) ? score : 0;
  const band = SEVERITY_BANDS.find((b) => value >= b.min) || SEVERITY_BANDS[SEVERITY_BANDS.length - 1];
  return { severity: band.severity, rank: band.rank };
}

// A file name from the browser is only ever DISPLAY text. Strip any folders and control characters.
function safeDisplayName(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'upload.csv').slice(0, 255);
}

// Spreadsheet programs run text that starts with = + - @ as a formula (CSV injection).
// A leading apostrophe makes them show it as plain text.
function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

// Compares the CSV header with the columns the model needs.
// Column names that are special in JavaScript objects. A CSV parser builds one object per row from the header, so a
// column called "__proto__" could tamper with that object. No real flow data uses these names, so they are refused.
const UNSAFE_COLUMN_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

function checkHeaders(headers, required) {
  const cleaned = headers.map((h) => String(h).trim());
  const seen = new Set();
  const duplicates = new Set();
  for (const h of cleaned) {
    if (seen.has(h)) duplicates.add(h);
    seen.add(h);
  }
  const missing = required.filter((c) => !seen.has(c));
  const emptyNames = cleaned.filter((h) => h === '').length;
  const unsafe = [...new Set(cleaned.filter((h) => UNSAFE_COLUMN_NAMES.has(h)))];
  const ignored = cleaned.filter((h) => h !== '' && !required.includes(h));
  return {
    ok: missing.length === 0 && duplicates.size === 0 && emptyNames === 0 && unsafe.length === 0,
    missing: missing.slice(0, MAX_LISTED),
    totalMissing: missing.length,
    duplicates: [...duplicates].slice(0, MAX_LISTED),
    emptyNames,
    unsafe,
    ignoredCount: ignored.length,
  };
}

// Text files never contain NUL bytes; spreadsheets, images and executables almost always do.
function looksBinary(buffer) {
  return buffer.includes(0);
}

// CSV cells are text. The ML service wants numbers as numbers or null for empty cells.
function normalizeCell(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

module.exports = {
  severityFromScore,
  safeDisplayName,
  escapeCsvCell,
  checkHeaders,
  looksBinary,
  normalizeCell,
  MAX_LISTED,
};
