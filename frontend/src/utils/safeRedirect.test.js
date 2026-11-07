import { describe, it, expect } from 'vitest';
import { safeDestination, DEFAULT_DESTINATION } from './safeRedirect.js';

describe('safeDestination', () => {
  it.each(['/dashboard', '/alerts', '/alerts/64b7f0c2a1b2c3d4e5f60718', '/incidents/abc-123', '/reports/a_b.c~d', '/'])(
    'keeps the in-app path %s',
    (path) => expect(safeDestination(path)).toBe(path),
  );

  it.each([
    'https://evil.example', 'http://evil.example/x', '//evil.example', '/\\evil.example', '\\\\evil.example', '\\evil',
    'javascript:alert(1)', 'alerts', '', '/alerts?next=//evil', '/alerts#x', '/a b', '/%5Cevil.example', '/alerts/\t',
    '/\u202Eevil', '/' + 'a'.repeat(250),
  ])('falls back to the dashboard for %j', (path) => expect(safeDestination(path)).toBe(DEFAULT_DESTINATION));

  it.each([undefined, null, 5, {}, ['/alerts']])('falls back for non-text input %j', (value) => {
    expect(safeDestination(value)).toBe(DEFAULT_DESTINATION);
  });
});
