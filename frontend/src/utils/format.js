// Small pure helpers shared by the pages. No React in here, so they are easy to test.

// This is only a hint for the user. The server enforces the real limit (MAX_UPLOAD_MB in backend/.env).
export const MAX_UPLOAD_MB = 20;

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Quick checks before uploading, to save the user a round trip. The server checks everything again.
export function validateCsvFile(file) {
  const errors = [];
  if (!file) return { ok: false, errors: ['Choose a CSV file first.'] };
  if (!/\.csv$/i.test(file.name || '')) errors.push('The file name must end with .csv.');
  if (file.size === 0) errors.push('The file is empty.');
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    errors.push(`The file is ${formatBytes(file.size)}. The limit is ${MAX_UPLOAD_MB} MB.`);
  }
  return { ok: errors.length === 0, errors };
}

// The message to show for a failed API call. Server messages are written to be shown to users.
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const fromServer = err?.response?.data?.error?.message;
  if (fromServer) return fromServer;
  if (err?.code === 'ECONNABORTED') return 'The request took too long. Please try again.';
  if (err && !err.response) return 'Cannot reach the server. Check that the backend is running.';
  return fallback;
}

// Turns the server's "details" (a list of field problems, or an object of lists) into readable lines.
export function describeDetails(details) {
  if (!details) return [];
  if (Array.isArray(details)) {
    return details.map((d) => (d.field ? `${d.field}: ${d.message}` : String(d.message ?? d))).slice(0, 20);
  }
  if (typeof details !== 'object') return [];
  const lines = [];
  if (details.missingColumns?.length) {
    const extra = details.totalMissing > details.missingColumns.length ? ` (${details.totalMissing} missing in total)` : '';
    lines.push(`Missing columns: ${details.missingColumns.join(', ')}${extra}`);
  }
  if (details.duplicateColumns?.length) lines.push(`Duplicate columns: ${details.duplicateColumns.join(', ')}`);
  if (details.emptyColumnNames > 0) lines.push(`${details.emptyColumnNames} column(s) have no name in the header row.`);
  return lines;
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

// The model's attack score is not a calibrated probability, so it is shown as a plain 0 to 1 number.
export function formatScore(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'n/a';
}

export function formatCount(value) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : '0';
}
