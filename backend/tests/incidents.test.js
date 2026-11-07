const request = require('supertest');

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Alert', () => ({ countDocuments: jest.fn(), find: jest.fn() }));
jest.mock('../src/models/Incident', () => ({
  create: jest.fn(), find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn(), findOneAndUpdate: jest.fn(),
}));
jest.mock('../src/services/auditService', () => ({ log: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({ getMlHealth: jest.fn() }));

const User = require('../src/models/User');
const Alert = require('../src/models/Alert');
const Incident = require('../src/models/Incident');
const audit = require('../src/services/auditService');
const createApp = require('../src/app');
const { loginAs } = require('./helpers');

const app = createApp();
const ID = 'd'.repeat(24);
const ALERT_A = 'a'.repeat(24);
const ALERT_B = 'b'.repeat(24);

const incidentDoc = (over = {}) => ({
  _id: ID, id: ID, title: 'Suspicious scan', description: 'x', severity: 'medium', status: 'open',
  alerts: [], notes: [], createdAt: new Date(), updatedAt: new Date(), save: jest.fn().mockResolvedValue(), ...over,
});

let auth;
beforeEach(() => {
  jest.resetAllMocks();
  auth = loginAs(User);
});

describe('POST /api/incidents', () => {
  const body = { title: 'Suspicious scan', description: 'Seen in flows.csv', severity: 'high', alertIds: [ALERT_A, ALERT_B] };

  it('requires login', async () => {
    expect((await request(app).post('/api/incidents').send(body)).status).toBe(401);
  });

  it('creates an incident linked to alerts the user can see, and audits it', async () => {
    Alert.countDocuments.mockResolvedValue(2);
    Incident.create.mockImplementation(async (doc) => incidentDoc({ ...doc }));
    const res = await request(app).post('/api/incidents').set(auth).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.incident).toMatchObject({ title: 'Suspicious scan', severity: 'high', status: 'open', alertCount: 2 });
    expect(Incident.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 'u1', alerts: [ALERT_A, ALERT_B] }));
    expect(Alert.countDocuments.mock.calls[0][0]).toMatchObject({ createdBy: 'u1' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'incident.created' }));
  });

  it('defaults severity to medium and works without alerts', async () => {
    Incident.create.mockImplementation(async (doc) => incidentDoc({ ...doc }));
    const res = await request(app).post('/api/incidents').set(auth).send({ title: 'Manual incident' });
    expect(res.status).toBe(201);
    expect(res.body.data.incident.severity).toBe('medium');
    expect(Alert.countDocuments).not.toHaveBeenCalled();
  });

  it('removes duplicate alert ids before checking them', async () => {
    Alert.countDocuments.mockResolvedValue(1);
    Incident.create.mockImplementation(async (doc) => incidentDoc({ ...doc }));
    const res = await request(app).post('/api/incidents').set(auth).send({ title: 'Dup test', alertIds: [ALERT_A, ALERT_A] });
    expect(res.status).toBe(201);
    expect(Incident.create.mock.calls[0][0].alerts).toEqual([ALERT_A]);
  });

  it('refuses to link alerts the user cannot see', async () => {
    Alert.countDocuments.mockResolvedValue(1); // only one of the two is theirs
    const res = await request(app).post('/api/incidents').set(auth).send(body);
    expect(res.status).toBe(400);
    expect(Incident.create).not.toHaveBeenCalled();
  });

  it.each([
    [{}], [{ title: 'ab' }], [{ title: 'x'.repeat(201) }], [{ title: 'Valid title', severity: 'urgent' }],
    [{ title: 'Valid title', alertIds: ['not-an-id'] }], [{ title: 'Valid title', status: 'closed' }],
    [{ title: 'Valid title', createdBy: ALERT_A }], [{ title: { $ne: null } }],
  ])('rejects invalid body %#', async (payload) => {
    const res = await request(app).post('/api/incidents').set(auth).send(payload);
    expect(res.status).toBe(400);
    expect(Incident.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/incidents', () => {
  function mockList(items, total = items.length) {
    const chain = { sort: jest.fn(() => chain), skip: jest.fn(() => chain), limit: jest.fn(() => chain), lean: jest.fn().mockResolvedValue(items) };
    Incident.find.mockReturnValue(chain);
    Incident.countDocuments.mockResolvedValue(total);
  }

  it("lists the analyst's own incidents with pagination", async () => {
    mockList([incidentDoc({ alerts: [ALERT_A] })], 31);
    const res = await request(app).get('/api/incidents?status=open&severity=medium&page=2&limit=10').set(auth);
    expect(res.status).toBe(200);
    expect(Incident.find).toHaveBeenCalledWith({ createdBy: 'u1', status: 'open', severity: 'medium' });
    expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 31, pages: 4 });
    expect(res.body.data[0]).toMatchObject({ id: ID, alertCount: 1, status: 'open' });
  });

  it('shows admins every incident', async () => {
    mockList([]);
    await request(app).get('/api/incidents').set(loginAs(User, { id: 'admin1', role: 'admin' }));
    expect(Incident.find).toHaveBeenCalledWith({});
  });

  it.each(['status=maybe', 'limit=500', 'page=0', 'unknown=1'])('rejects bad query %s', async (query) => {
    expect((await request(app).get(`/api/incidents?${query}`).set(auth)).status).toBe(400);
  });
});

describe('GET /api/incidents/:id', () => {
  it('returns linked alerts and notes with author names', async () => {
    const doc = incidentDoc({
      alerts: [ALERT_A],
      notes: [{ _id: 'n1', text: 'Checked firewall logs', author: { name: 'Asha' }, createdAt: new Date() }],
    });
    Incident.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(doc) });
    Alert.find.mockReturnValue({
      select: () => ({ lean: async () => [{ _id: ALERT_A, severity: 'critical', status: 'new', attackCategory: 'DoS', confidence: 0.97, sourceFileName: 'f.csv', rowIndex: 7 }] }),
    });
    const res = await request(app).get(`/api/incidents/${ID}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.incident.alerts[0]).toMatchObject({ id: ALERT_A, csvLine: 9, attackCategory: 'DoS' });
    expect(res.body.data.incident.notes[0]).toMatchObject({ text: 'Checked firewall logs', author: 'Asha' });
    expect(Incident.findOne).toHaveBeenCalledWith({ _id: ID, createdBy: 'u1' });
  });

  it('returns 404 for someone else’s incident and for malformed ids', async () => {
    Incident.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    expect((await request(app).get(`/api/incidents/${ID}`).set(auth)).status).toBe(404);
    expect((await request(app).get('/api/incidents/xyz').set(auth)).status).toBe(404);
  });
});

describe('PATCH /api/incidents/:id', () => {
  it('updates allowed fields and records a status change in the audit log', async () => {
    const doc = incidentDoc();
    Incident.findOne.mockResolvedValue(doc);
    const res = await request(app).patch(`/api/incidents/${ID}`).set(auth).send({ status: 'contained', severity: 'high' });
    expect(res.status).toBe(200);
    expect(doc.status).toBe('contained');
    expect(doc.severity).toBe('high');
    expect(doc.save).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'incident.status_changed' }));
  });

  it('uses a different audit action when the status did not change', async () => {
    Incident.findOne.mockResolvedValue(incidentDoc());
    await request(app).patch(`/api/incidents/${ID}`).set(auth).send({ title: 'Renamed incident' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'incident.updated' }));
  });

  it.each([[{}], [{ status: 'deleted' }], [{ createdBy: ALERT_A }], [{ alerts: [] }], [{ notes: [] }], [{ title: 'ab' }]])(
    'rejects invalid body %#',
    async (payload) => {
      const res = await request(app).patch(`/api/incidents/${ID}`).set(auth).send(payload);
      expect(res.status).toBe(400);
      expect(Incident.findOne).not.toHaveBeenCalled();
    }
  );

  it('returns 404 when the incident is not yours', async () => {
    Incident.findOne.mockResolvedValue(null);
    expect((await request(app).patch(`/api/incidents/${ID}`).set(auth).send({ status: 'closed' })).status).toBe(404);
  });
});

describe('POST /api/incidents/:id/notes', () => {
  it('adds a note atomically, attributed to the logged-in user, without logging its text', async () => {
    const note = { _id: 'n2', text: 'Blocked the source IP at the firewall', createdAt: new Date(), toObject() { return { ...this }; } };
    Incident.findOneAndUpdate.mockResolvedValue(incidentDoc({ id: ID, notes: [note] }));
    const res = await request(app).post(`/api/incidents/${ID}/notes`).set(auth).send({ text: ' Blocked the source IP at the firewall ' });
    expect(res.status).toBe(201);
    expect(res.body.data.note).toMatchObject({ text: 'Blocked the source IP at the firewall', author: 'Asha Verma' });
    const [filter, update] = Incident.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: ID, createdBy: 'u1' });
    expect(update.$push.notes).toEqual({ author: 'u1', text: 'Blocked the source IP at the firewall' });
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('firewall');
  });

  it.each([[{}], [{ text: '' }], [{ text: '   ' }], [{ text: 'x'.repeat(5001) }], [{ text: 'ok', author: 'someone' }], [{ text: { $ne: 1 } }]])(
    'rejects invalid note %#',
    async (payload) => {
      expect((await request(app).post(`/api/incidents/${ID}/notes`).set(auth).send(payload)).status).toBe(400);
      expect(Incident.findOneAndUpdate).not.toHaveBeenCalled();
    }
  );

  it('returns 404 for an incident that is not yours', async () => {
    Incident.findOneAndUpdate.mockResolvedValue(null);
    expect((await request(app).post(`/api/incidents/${ID}/notes`).set(auth).send({ text: 'hello' })).status).toBe(404);
  });
});
