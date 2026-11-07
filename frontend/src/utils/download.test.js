import { describe, it, expect } from 'vitest';
import { safeFileName } from './download.js';

describe('safeFileName', () => {
  it('turns a title into a lowercase, dash-separated name', () => {
    expect(safeFileName('Detection summary: flows.csv')).toBe('detection-summary-flows-csv');
  });
  it('removes path characters and odd symbols', () => {
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileName('a<b>|c"d')).toBe('a-b-c-d');
  });
  it('falls back when nothing usable is left', () => {
    expect(safeFileName('???')).toBe('report');
    expect(safeFileName('', 'x')).toBe('x');
    expect(safeFileName(null)).toBe('report');
  });
  it('limits the length', () => {
    expect(safeFileName('a'.repeat(200)).length).toBe(60);
  });
});
