// These tests check the Mongoose schemas WITHOUT a database: validateSync() only
// looks at the rules (required fields, allowed values, number ranges).
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Alert = require('../src/models/Alert');
const Incident = require('../src/models/Incident');
const Report = require('../src/models/Report');
const AuditLog = require('../src/models/AuditLog');

const id = () => new mongoose.Types.ObjectId();
const failedFields = (doc) => Object.keys((doc.validateSync() || { errors: {} }).errors);

describe('User model', () => {
  const valid = { name: 'Asha Verma', email: 'asha@example.com', passwordHash: 'hash' };

  it('accepts a valid user and defaults to analyst, active', () => {
    const user = new User(valid);
    expect(user.validateSync()).toBeUndefined();
    expect(user.role).toBe('analyst');
    expect(user.isActive).toBe(true);
  });

  it('rejects a bad email, a bad role and a missing name', () => {
    expect(failedFields(new User({ ...valid, email: 'nope' }))).toContain('email');
    expect(failedFields(new User({ ...valid, role: 'superuser' }))).toContain('role');
    expect(failedFields(new User({ email: valid.email, passwordHash: 'h' }))).toContain('name');
  });

  it('never includes passwordHash in JSON output', () => {
    const json = new User(valid).toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.email).toBe('asha@example.com');
  });
});

describe('Alert model', () => {
  const valid = { predictedLabel: 'DoS', severity: 'high', createdBy: id() };

  it('accepts a valid alert with status "new" by default', () => {
    const alert = new Alert(valid);
    expect(alert.validateSync()).toBeUndefined();
    expect(alert.status).toBe('new');
  });

  it('rejects an unknown severity and out-of-range confidence', () => {
    expect(failedFields(new Alert({ ...valid, severity: 'urgent' }))).toContain('severity');
    expect(failedFields(new Alert({ ...valid, confidence: 1.5 }))).toContain('confidence');
    expect(failedFields(new Alert({ ...valid, confidence: -0.1 }))).toContain('confidence');
  });

  it('allows an empty confidence (null) for models without a meaningful score', () => {
    expect(new Alert(valid).confidence).toBeNull();
  });
});

describe('Incident model', () => {
  it('defaults to status "open" and requires a title', () => {
    const incident = new Incident({ title: 'Suspicious scan', createdBy: id() });
    expect(incident.validateSync()).toBeUndefined();
    expect(incident.status).toBe('open');
    expect(failedFields(new Incident({ createdBy: id() }))).toContain('title');
  });

  it('rejects an unknown status and empty notes', () => {
    expect(failedFields(new Incident({ title: 'abc', status: 'maybe', createdBy: id() }))).toContain('status');
    const withNote = new Incident({ title: 'abc', createdBy: id(), notes: [{ author: id(), text: '' }] });
    expect(failedFields(withNote).join(',')).toContain('notes');
  });
});

describe('Report model', () => {
  it('requires title, type and content', () => {
    const fields = failedFields(new Report({ createdBy: id() }));
    expect(fields).toEqual(expect.arrayContaining(['title', 'type', 'content']));
  });

  it('rejects an unknown report type', () => {
    const report = new Report({ title: 'Weekly', type: 'gossip', content: 'x', createdBy: id() });
    expect(failedFields(report)).toContain('type');
  });
});

describe('AuditLog model', () => {
  it('requires an action but not an actor (failed logins have none)', () => {
    expect(failedFields(new AuditLog({}))).toContain('action');
    expect(new AuditLog({ action: 'auth.login_failed', ip: '127.0.0.1' }).validateSync()).toBeUndefined();
  });
});
