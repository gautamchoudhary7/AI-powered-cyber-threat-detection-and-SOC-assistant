const {
  severityFromScore,
  safeDisplayName,
  escapeCsvCell,
  checkHeaders,
  looksBinary,
  normalizeCell,
} = require('../src/utils/detectionHelpers');

describe('severityFromScore', () => {
  it('maps score bands to severity and rank', () => {
    expect(severityFromScore(0.99)).toEqual({ severity: 'critical', rank: 4 });
    expect(severityFromScore(0.95)).toEqual({ severity: 'critical', rank: 4 });
    expect(severityFromScore(0.9)).toEqual({ severity: 'high', rank: 3 });
    expect(severityFromScore(0.7)).toEqual({ severity: 'medium', rank: 2 });
    expect(severityFromScore(0.51)).toEqual({ severity: 'low', rank: 1 });
  });
  it('treats missing or invalid scores as the lowest severity', () => {
    expect(severityFromScore(undefined)).toEqual({ severity: 'low', rank: 1 });
    expect(severityFromScore(NaN)).toEqual({ severity: 'low', rank: 1 });
    expect(severityFromScore(null)).toEqual({ severity: 'low', rank: 1 });
  });
});

describe('safeDisplayName', () => {
  it('removes folders so a name can never act as a path', () => {
    expect(safeDisplayName('../../etc/passwd.csv')).toBe('passwd.csv');
    expect(safeDisplayName('C:\\Users\\me\\flows.csv')).toBe('flows.csv');
  });
  it('removes control characters and limits the length', () => {
    expect(safeDisplayName('a\u0000b\nc.csv')).toBe('abc.csv');
    expect(safeDisplayName('x'.repeat(400) + '.csv').length).toBe(255);
  });
  it('falls back to a default for empty names', () => {
    expect(safeDisplayName('')).toBe('upload.csv');
    expect(safeDisplayName(undefined)).toBe('upload.csv');
  });
});

describe('escapeCsvCell', () => {
  it('neutralises spreadsheet formulas', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+cmd')).toBe("'+cmd");
    expect(escapeCsvCell('-5')).toBe("'-5");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
  it('quotes cells that contain commas, quotes or line breaks', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });
  it('leaves normal values alone and turns empty values into nothing', () => {
    expect(escapeCsvCell('DoS')).toBe('DoS');
    expect(escapeCsvCell(0.97)).toBe('0.97');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('checkHeaders', () => {
  const required = ['dur', 'proto', 'rate'];

  it('accepts a header that has every required column, in any order, plus extras', () => {
    const r = checkHeaders(['rate', 'id', 'proto', 'dur', 'label'], required);
    expect(r.ok).toBe(true);
    expect(r.ignoredCount).toBe(2);
  });
  it('lists missing columns', () => {
    const r = checkHeaders(['dur', 'proto'], required);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['rate']);
    expect(r.totalMissing).toBe(1);
  });
  it('rejects duplicate and empty column names', () => {
    expect(checkHeaders(['dur', 'dur', 'proto', 'rate'], required).duplicates).toEqual(['dur']);
    expect(checkHeaders(['dur', 'proto', 'rate', ''], required).ok).toBe(false);
  });
  it('refuses column names that are special in JavaScript objects', () => {
    for (const bad of ['__proto__', 'constructor', 'prototype', ' __proto__ ']) {
      const r = checkHeaders(['dur', 'proto', 'rate', bad], required);
      expect(r.ok).toBe(false);
      expect(r.unsafe.length).toBe(1);
    }
    expect(checkHeaders(['dur', 'proto', 'rate', 'protocol'], required).unsafe).toEqual([]);
  });
  it('trims spaces around names but is otherwise exact (case matters)', () => {
    expect(checkHeaders([' dur ', 'proto', 'rate'], required).ok).toBe(true);
    expect(checkHeaders(['Dur', 'proto', 'rate'], required).missing).toEqual(['dur']);
  });
  it('caps how many missing names are listed', () => {
    const many = Array.from({ length: 80 }, (_, i) => `c${i}`);
    const r = checkHeaders([], many);
    expect(r.missing.length).toBe(50);
    expect(r.totalMissing).toBe(80);
  });
});

describe('looksBinary and normalizeCell', () => {
  it('detects NUL bytes', () => {
    expect(looksBinary(Buffer.from([0x50, 0x4b, 0x00, 0x04]))).toBe(true);
    expect(looksBinary(Buffer.from('a,b\n1,2\n'))).toBe(false);
  });
  it('turns empty cells into null and trims text', () => {
    expect(normalizeCell('')).toBeNull();
    expect(normalizeCell('   ')).toBeNull();
    expect(normalizeCell(undefined)).toBeNull();
    expect(normalizeCell(' 0.5 ')).toBe('0.5');
    expect(normalizeCell('tcp')).toBe('tcp');
  });
});
