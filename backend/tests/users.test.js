const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/User', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ log: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({ getMlHealth: jest.fn() }));

const User = require('../src/models/User');
const audit = require('../src/services/auditService');
const config = require('../src/config');
const createApp = require('../src/app');
const { hashPassword, signToken } = require('../src/services/authService');
const { makeUser } = require('./helpers');

const app = createApp({ authRateLimitMax: 1000 });
const OLD = 'OldPassword123';
const NEW = 'NewPassword456';

// User.findById is called twice per request: once without .select (login check in the middleware)
// and once with .select('+passwordHash') in the controller. This returns something that works for both.
function mockUser(over = {}, hash) {
  const plain = makeUser(over);
  const withHash = { ...plain, passwordHash: hash, save: jest.fn().mockResolvedValue() };
  User.findById.mockImplementation((id) => {
    if (id !== plain.id) return Promise.resolve(null);
    const q = Promise.resolve(plain);
    q.select = jest.fn(() => Promise.resolve(withHash));
    return q;
  });
  return { plain, withHash, auth: { Authorization: `Bearer ${signToken(plain)}` } };
}

beforeEach(() => jest.resetAllMocks());

describe('PATCH /api/users/me', () => {
  it('requires login', async () => {
    expect((await request(app).patch('/api/users/me').send({ name: 'New Name' })).status).toBe(401);
  });

  it('changes the name and audits it', async () => {
    const { auth } = mockUser();
    User.findByIdAndUpdate.mockResolvedValue({ id: 'u1', name: 'New Name', email: 'asha@example.com', role: 'analyst' });
    const res = await request(app).patch('/api/users/me').set(auth).send({ name: '  New Name ' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ name: 'New Name', role: 'analyst' });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u1', { name: 'New Name' }, expect.objectContaining({ new: true, runValidators: true }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.profile_updated' }));
  });

  it('cannot be used to change the role, email or active status', async () => {
    const { auth } = mockUser();
    for (const extra of [{ role: 'admin' }, { email: 'x@example.com' }, { isActive: false }]) {
      const res = await request(app).patch('/api/users/me').set(auth).send({ name: 'New Name', ...extra });
      expect(res.status).toBe(400);
    }
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a name that is too short', async () => {
    const { auth } = mockUser();
    expect((await request(app).patch('/api/users/me').set(auth).send({ name: 'A' })).status).toBe(400);
  });
});

describe('POST /api/users/me/password', () => {
  let hash;
  beforeAll(async () => { hash = await hashPassword(OLD); });

  it('requires login', async () => {
    expect((await request(app).post('/api/users/me/password').send({ currentPassword: OLD, newPassword: NEW })).status).toBe(401);
  });

  it('changes the password, stores a new hash, records the time and returns a fresh token', async () => {
    const { auth, withHash } = mockUser({}, hash);
    const res = await request(app).post('/api/users/me/password').set(auth).send({ currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(withHash.passwordHash).not.toBe(hash);
    expect(withHash.passwordHash).not.toContain(NEW); // only a hash is stored
    expect(withHash.passwordChangedAt).toBeInstanceOf(Date);
    expect(withHash.save).toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.password_changed' }));
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(NEW); // never logged
  });

  it('returns 400 (not 401) for a wrong current password, and changes nothing', async () => {
    const { auth, withHash } = mockUser({}, hash);
    const res = await request(app).post('/api/users/me/password').set(auth).send({ currentPassword: 'WrongPassword1', newPassword: NEW });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Current password is incorrect');
    expect(withHash.save).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.password_change_failed' }));
  });

  it('rejects a new password equal to the current one', async () => {
    const { auth, withHash } = mockUser({}, hash);
    const res = await request(app).post('/api/users/me/password').set(auth).send({ currentPassword: OLD, newPassword: OLD });
    expect(res.status).toBe(400);
    expect(withHash.save).not.toHaveBeenCalled();
  });

  it('applies the normal password rules to the new password', async () => {
    const { auth } = mockUser({}, hash);
    for (const newPassword of ['short1', 'onlylettersnonumber', '1234567890123']) {
      const res = await request(app).post('/api/users/me/password').set(auth).send({ currentPassword: OLD, newPassword });
      expect(res.status).toBe(400);
    }
  });

  it('rejects unknown fields', async () => {
    const { auth } = mockUser({}, hash);
    const res = await request(app).post('/api/users/me/password').set(auth).send({ currentPassword: OLD, newPassword: NEW, role: 'admin' });
    expect(res.status).toBe(400);
  });
});

describe('sessions after a password change', () => {
  const tokenIssuedAt = (user, iat) =>
    jwt.sign({ role: user.role, iat }, config.jwtSecret, { subject: user.id, algorithm: 'HS256', expiresIn: '1h' });
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it('rejects a token issued before the password was changed', async () => {
    const { plain } = mockUser({ passwordChangedAt: new Date() });
    const stale = tokenIssuedAt(plain, nowSeconds() - 600);
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${stale}` });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/password was changed/i);
  });

  it('accepts a token issued after the change', async () => {
    const { plain } = mockUser({ passwordChangedAt: new Date(Date.now() - 600000) });
    const fresh = tokenIssuedAt(plain, nowSeconds());
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${fresh}` })).status).toBe(200);
  });

  it('keeps working for users who never changed their password', async () => {
    const { auth } = mockUser();
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(200);
  });
});
