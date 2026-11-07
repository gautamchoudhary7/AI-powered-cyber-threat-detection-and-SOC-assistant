// Pure helpers for the dashboard. No packages needed, so they are easy to test.
//
// All days are UTC days ("2026-10-31"). The database groups by UTC day, so the helper must match,
// otherwise alerts near midnight would land on the wrong bar.

const ALLOWED_RANGES = [7, 14, 30, 90];
const DEFAULT_RANGE = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const dayKey = (date) => date.toISOString().slice(0, 10);

// First moment included in a "last N days" window (today counts as one of the N days).
function rangeStart(days, now = new Date()) {
  return new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
}

// The database only returns days that HAD alerts. A chart needs every day, with zeros for quiet ones.
// rows: [{ _id: '2026-10-30', total: 4, high: 1 }]  ->  [{ date, total, high }] oldest first, length === days
function fillDailySeries(rows, days, now = new Date()) {
  const byDay = new Map((rows || []).map((r) => [r._id, r]));
  const start = rangeStart(days, now);
  const series = [];
  for (let i = 0; i < days; i += 1) {
    const key = dayKey(new Date(start.getTime() + i * DAY_MS));
    const row = byDay.get(key);
    series.push({ date: key, total: row ? row.total : 0, high: row ? row.high : 0 });
  }
  return series;
}

// rows: [{ _id: 'DoS' | null, count: 12 }]. Keeps the biggest `max` categories and folds the rest into "Other".
// Alerts with no category are shown as "Uncategorised" (never dropped, so the numbers still add up).
function topCategories(rows, max = 6) {
  const merged = new Map();
  for (const r of rows || []) {
    const name = r._id ? String(r._id) : 'Uncategorised';
    merged.set(name, (merged.get(name) || 0) + r.count);
  }
  const sorted = [...merged].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max);
  const otherCount = sorted.slice(max).reduce((sum, c) => sum + c.count, 0);
  return [...head, { category: 'Other', count: otherCount }];
}

module.exports = { ALLOWED_RANGES, DEFAULT_RANGE, startOfUtcDay, rangeStart, fillDailySeries, topCategories };
