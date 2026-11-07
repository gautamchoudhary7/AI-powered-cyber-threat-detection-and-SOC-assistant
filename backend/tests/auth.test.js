const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// No real database is used: the User model and audit log are replaced with mocks.
jest.mock('../src/models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../src/services/auditService', () => ({ log: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({ getMlHealth: jest.fn() }));

const User = require('../src/models/User');
const audit = require('../src/services/auditService');
const createApp = require('../src/app');
const { signToken } = require('../src/services/authService');
const { authenticate, requireRole } = require('../src/middleware/auth');
const errorHandler = require('../src/middleware/errorHandler');

const app = createApp();
const PASSWORD = 'Str0ngPassw0rd';

// Mimics Mongoose's User.findOne(...).select('+passwordHash')
const query = (value) => ({ select: jest.fn().mockResolvedValue(value) });
const makeUser = (overrides = {}) => ({
  id: 'u1',
  name: 'Asha Verma',
  email: 'asha@example.com',
  role: 'analyst',
  isActive: true,
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/auth/register', () => {
  const body = { name: 'Asha Verma', email: 'Asha@Example.com', password: PASSWORD };

  it('creates an analyst, hashes the password, and never returns the hash', async () => {
    User.create.mockImplementation(async (doc) => ({ id: 'u1', ...doc }));
    const res = await request(app).post('/api/auth/register').send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toEqual({
      id: 'u1',
      name: 'Asha Verma',
      email: 'asha@example.com', // lowercased
      role: 'analyst',
    });
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const saved = User.create.mock.calls[0][0];
    expect(saved.passwordHash).not.toBe(PASSWORD);
    expect(saved.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(saved.password).toBeUndefined();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.register' }));
  });

  it('rejects an attempt to choose a role (mass assignment)', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...body, role: 'admin' });
    expect(res.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects weak passwords', async () => {
    for (const password of ['short1', 'onlyletterspassword', '1234567890123']) {
      const res = await request(app).post('/api/auth/register').send({ ...body, password });
      expect(res.status).toBe(400);
    }
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid email and a missing name', async () => {
    let res = await request(app).post('/api/auth/register').send({ ...body, email: 'not-an-email' });
    expect(res.status).toBe(400);
    res = await request(app).post('/api/auth/register').send({ email: body.email, password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === 'name')).toBe(true);
  });

  it('returns 409 for a duplicate email', async () => {
    User.create.mockRejectedValue({ code: 11000 });
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
  });

  it('returns 503 (not a crash or a stack trace) when the database is down', async () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:27017');
    err.name = 'MongoNetworkError';
    User.create.mockRejectedValue(err);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  const body = { email: 'asha@example.com', password: PASSWORD };

  it('returns a token that identifies the user', async () => {
    User.findOne.mockReturnValue(query(makeUser()));
    const res = await request(app).post('/api/auth/login').send(body);

    expect(res.status).toBe(200);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'asha@example.com' });
    const payload = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(payload.sub).toBe('u1');
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('gives the same 401 message for a wrong password and an unknown email', async () => {
    User.findOne.mockReturnValue(query(makeUser()));
    const wrongPassword = await request(app).post('/api/auth/login').send({ ...body, password: 'Wrong-password-1' });

    User.findOne.mockReturnValue(query(null));
    const unknownEmail = await request(app).post('/api/auth/login').send(body);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login_failed' }));
  });

  it('rejects a deactivated account', async () => {
    User.findOne.mockReturnValue(query(makeUser({ isActive: false })));
    const res = await request(app).post('/api/auth/login').send(body);
    expect(res.status).toBe(401);
  });

  it('blocks NoSQL injection in the email field before touching the database', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: 'x' });
    expect(res.status).toBe(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('blocks NoSQL injection in the password field', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: body.email, password: { $gt: '' } });
    expect(res.status).toBe(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('returns 503 when the database is down', async () => {
    const err = new Error('server selection timed out');
    err.name = 'MongooseServerSelectionError';
    User.findOne.mockImplementation(() => ({ select: jest.fn().mockRejectedValue(err) }));
    const res = await request(app).post('/api/auth/login').send(body);
    expect(res.status).toBe(503);
  });

  it('rate limits repeated attempts with 429', async () => {
    const limitedApp = createApp({ authRateLimitMax: 2 });
    User.findOne.mockReturnValue(query(null));
    const statuses = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await request(limitedApp).post('/api/auth/login').send(body);
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 429]);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ role: 'admin' }, 'some-other-secret-some-other-secret', { subject: 'u1' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ role: 'analyst' }, process.env.JWT_SECRET, { subject: 'u1', expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Token expired');
  });

  it('rejects a valid token whose user no longer exists or is deactivated', async () => {
    const token = signToken({ id: 'u1', role: 'analyst' });
    User.findById.mockResolvedValue(null);
    let res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);

    User.findById.mockResolvedValue(makeUser({ isActive: false }));
    res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const token = signToken({ id: 'u1', role: 'analyst' });
    User.findById.mockResolvedValue(makeUser());
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('asha@example.com');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});

describe('role-based authorization (requireRole)', () => {
  const mini = express();
  mini.get('/admin-only', authenticate, requireRole('admin'), (req, res) => res.json({ ok: true }));
  mini.use(errorHandler);

  it('returns 403 for an analyst and 200 for an admin', async () => {
    User.findById.mockResolvedValue(makeUser({ role: 'analyst' }));
    const analystToken = signToken({ id: 'u1', role: 'analyst' });
    let res = await request(mini).get('/admin-only').set('Authorization', `Bearer ${analystToken}`);
    expect(res.status).toBe(403);

    User.findById.mockResolvedValue(makeUser({ id: 'u2', role: 'admin' }));
    const adminToken = signToken({ id: 'u2', role: 'admin' });
    res = await request(mini).get('/admin-only').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('uses the role stored in the database, not the role claimed inside the token', async () => {
    // Token claims admin, but the database says analyst: access must be denied.
    const token = signToken({ id: 'u1', role: 'admin' });
    User.findById.mockResolvedValue(makeUser({ role: 'analyst' }));
    const res = await request(mini).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
