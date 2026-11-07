const { parseTrustProxy } = require('../src/utils/trustProxy');

describe('parseTrustProxy', () => {
  it('treats unset, empty and 0 as "no proxy"', () => {
    for (const v of [undefined, null, '', '  ', '0']) expect(parseTrustProxy(v)).toBe(0);
  });

  it('accepts an exact number of proxies', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('rejects values that are too easy to forge or are not a count', () => {
    for (const v of ['true', 'false', 'loopback', '10.0.0.1', '-1', '1.5', '100', '1,2']) {
      let message = '';
      try {
        parseTrustProxy(v);
      } catch (err) {
        message = err.message;
      }
      expect(message.includes('TRUST_PROXY')).toBe(true);
    }
  });
});
