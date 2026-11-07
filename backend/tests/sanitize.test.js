const { sanitizeRequest, findForbiddenKey } = require('../src/middleware/sanitize');

describe('findForbiddenKey', () => {
  it('returns null for ordinary data', () => {
    expect(findForbiddenKey({ email: 'a@b.com', nested: { list: [1, 2, { ok: true }] } })).toBeNull();
    expect(findForbiddenKey(null)).toBeNull();
    expect(findForbiddenKey('text')).toBeNull();
  });

  it('finds MongoDB operators at any depth', () => {
    expect(findForbiddenKey({ email: { $ne: null } })).toBe('$ne');
    expect(findForbiddenKey({ a: { b: [{ $where: 'x' }] } })).toBe('$where');
  });

  it('finds dotted keys', () => {
    expect(findForbiddenKey({ 'profile.role': 'admin' })).toBe('profile.role');
  });

  it('stops on absurdly deep objects', () => {
    let deep = { v: 1 };
    for (let i = 0; i < 30; i += 1) deep = { n: deep };
    expect(findForbiddenKey(deep)).toBe('[too deeply nested]');
  });
});

describe('sanitizeRequest middleware', () => {
  it('calls next() with a 400 error for bad query strings', () => {
    const next = jest.fn();
    sanitizeRequest({ body: {}, query: { id: { $gt: '' } }, params: {} }, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).not.toContain('$gt'); // the key is not echoed back
  });

  it('calls next() with no error for clean requests', () => {
    const next = jest.fn();
    sanitizeRequest({ body: { a: 1 }, query: { page: '2' }, params: {} }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
