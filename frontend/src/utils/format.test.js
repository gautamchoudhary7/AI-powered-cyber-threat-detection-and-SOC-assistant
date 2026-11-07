import { formatBytes, validateCsvFile, apiErrorMessage, describeDetails, formatScore, formatCount, MAX_UPLOAD_MB } from './format.js';

const file = (name, size) => ({ name, size });

describe('formatBytes', () => {
  it('uses B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('returns an empty string for nonsense', () => {
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(-1)).toBe('');
  });
});

describe('validateCsvFile', () => {
  it('accepts a normal csv, any letter case', () => {
    expect(validateCsvFile(file('flows.csv', 1000))).toEqual({ ok: true, errors: [] });
    expect(validateCsvFile(file('FLOWS.CSV', 1000)).ok).toBe(true);
  });
  it('asks for a file when none is chosen', () => {
    expect(validateCsvFile(null).ok).toBe(false);
  });
  it('rejects a wrong extension, an empty file and an oversized file, and says why', () => {
    expect(validateCsvFile(file('flows.xlsx', 1000)).errors[0]).toMatch(/\.csv/);
    expect(validateCsvFile(file('flows.csv', 0)).errors[0]).toMatch(/empty/);
    const big = validateCsvFile(file('flows.csv', (MAX_UPLOAD_MB + 1) * 1024 * 1024));
    expect(big.ok).toBe(false);
    expect(big.errors[0]).toMatch(/limit/);
  });
  it('reports every problem at once', () => {
    expect(validateCsvFile(file('x.txt', 0)).errors.length).toBe(2);
  });
});

describe('apiErrorMessage', () => {
  it('prefers the message written by the server', () => {
    expect(apiErrorMessage({ response: { data: { error: { message: 'Invalid email or password' } } } })).toBe('Invalid email or password');
  });
  it('explains network failures and timeouts', () => {
    expect(apiErrorMessage({ message: 'Network Error' })).toMatch(/Cannot reach the server/);
    expect(apiErrorMessage({ code: 'ECONNABORTED' })).toMatch(/too long/);
  });
  it('falls back for anything else', () => {
    expect(apiErrorMessage({ response: { data: {} } }, 'Fallback')).toBe('Fallback');
  });
});

describe('describeDetails', () => {
  it('formats validation problems', () => {
    expect(describeDetails([{ field: 'email', message: 'Enter a valid email address' }])).toEqual(['email: Enter a valid email address']);
  });
  it('formats CSV header problems', () => {
    const lines = describeDetails({ missingColumns: ['dur', 'rate'], totalMissing: 5, duplicateColumns: ['proto'], emptyColumnNames: 1 });
    expect(lines[0]).toBe('Missing columns: dur, rate (5 missing in total)');
    expect(lines[1]).toBe('Duplicate columns: proto');
    expect(lines[2]).toMatch(/1 column\(s\) have no name/);
  });
  it('returns nothing for empty input', () => {
    expect(describeDetails(null)).toEqual([]);
    expect(describeDetails('text')).toEqual([]);
  });
});

describe('formatScore and formatCount', () => {
  it('shows three decimals, or n/a when there is no score', () => {
    expect(formatScore(0.97)).toBe('0.970');
    expect(formatScore(null)).toBe('n/a');
  });
  it('adds thousands separators', () => {
    expect(formatCount(12345)).toBe('12,345');
    expect(formatCount(undefined)).toBe('0');
  });
});
