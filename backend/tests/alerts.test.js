const request = require('supertest');

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Alert', () => ({ find: jest.fn(), countDocuments: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ log: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({ getMlHealth: jest.fn() }));

const User = require('../src/models/User');
const Alert = require('../src/models/Alert');
const audit = require('../src/services/auditService');
const createApp = require('../src/app');
const { loginAs } = require('./helpers');

const app = createApp();
const ID = 'b'.repeat(24);

const alertDoc = (over = {}) => ({
  _id: ID, jobId: 'c'.repeat(24), sourceFileName: 'f.csv', rowIndex: 7, predictedLabel: 'attack',
  attackCategory: 'DoS', confidence: 0.97, severity: 'critical', status: 'new', modelVersion: 'v1',
  record: { dur: '2' }, createdAt: new Date(), updatedAt: new Date(), ...over,
});

// Mimics Alert.find().sort().skip().limit().lean()
function mockList(items, total = items.length) {
  const chain = { sort: jest.fn(() => chain), skip: jest.fn(() => chain), limit: jest.fn(() => chain), lean: jest.fn().mockResolvedValue(items) };
  Alert.find.mockReturnValue(chain);
  Alert.countDocuments.mockResolvedValue(total);
  return chain;
}

let auth;
beforeEach(() => {
  jest.resetAllMocks();
  auth = loginAs(User);
});

describe('GET /api/alerts', () => {
  it('requires login', async () => {
    expect((await request(app).get('/api/alerts')).status).toBe(401);
  });

  it("limits analysts to their own alerts but lets admins see everyone's", async () => {
    mockList([]);
    await request(app).get('/api/alerts').set(auth);
    expect(Alert.find).toHaveBeenLastCalledWith({ createdBy: 'u1' });

    const adminAuth = loginAs(User, { id: 'admin1', role: 'admin' });
    await request(app).get('/api/alerts').set(adminAuth);
    expect(Alert.find).toHaveBeenLastCalledWith({});
  });

  it('applies filters, sorting and pagination, and reports totals', async () => {
    const chain = mockList([alertDoc()], 45);
    const res = await request(app)
      .get(`/api/alerts?severity=critical&status=new&category=DoS&page=2&limit=20&sortBy=severity&order=asc&jobId=${'c'.repeat(24)}`)
      .set(auth);
    expect(res.status).toBe(200);
    expect(Alert.find).toHaveBeenCalledWith({ createdBy: 'u1', severity: 'critical', status: 'new', attackCategory: 'DoS', jobId: 'c'.repeat(24) });
    expect(chain.sort).toHaveBeenCalledWith({ severityRank: 1, _id: 1 });
    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(res.body.pagination).toEqual({ page: 2, limit: 20, total: 45, pages: 3 });
    expect(res.body.data[0]).toMatchObject({ id: ID, csvLine: 9, attackScore: 0.97, severity: 'critical' });
    expect(res.body.data[0].record).toBeUndefined(); // raw record only on the detail view
  });

  it.each(['limit=1000', 'page=0', 'severity=urgent', 'sortBy=password', 'jobId=nope', 'unknown=1', 'order=sideways'])(
    'rejects bad query %s',
    async (query) => {
      const res = await request(app).get(`/api/alerts?${query}`).set(auth);
      expect(res.status).toBe(400);
      expect(Alert.find).not.toHaveBeenCalled();
    }
  );

  it('blocks NoSQL operators in the query string', async () => {
    const res = await request(app).get('/api/alerts?severity[$ne]=low').set(auth);
    expect(res.status).toBe(400);
    expect(Alert.find).not.toHaveBeenCalled();
  });
});

describe('GET /api/alerts/:id', () => {
  it('returns the alert including its record, scoped to the user', async () => {
    Alert.findOne.mockResolvedValue({ toObject: () => alertDoc() });
    const res = await request(app).get(`/api/alerts/${ID}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.alert.record).toEqual({ dur: '2' });
    expect(Alert.findOne).toHaveBeenCalledWith({ _id: ID, createdBy: 'u1' });
  });

  it('returns 404 when not found or not yours, and for malformed ids', async () => {
    Alert.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/alerts/${ID}`).set(auth)).status).toBe(404);
    expect((await request(app).get('/api/alerts/xyz').set(auth)).status).toBe(404);
  });
});

describe('PATCH /api/alerts/:id/status', () => {
  const doc = () => {
    const d = alertDoc();
    return { ...d, id: ID, save: jest.fn().mockResolvedValue(), toObject() { return { ...d, status: this.status }; } };
  };

  it('changes the status and writes an audit entry', async () => {
    const found = doc();
    Alert.findOne.mockResolvedValue(found);
    const res = await request(app).patch(`/api/alerts/${ID}/status`).set(auth).send({ status: 'investigating' });
    expect(res.status).toBe(200);
    expect(found.save).toHaveBeenCalled();
    expect(res.body.data.alert.status).toBe('investigating');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'alert.status_changed', metadata: { from: 'new', to: 'investigating' } }));
  });

  it.each([[{ status: 'deleted' }], [{}], [{ status: 'resolved', severity: 'low' }], [{ status: { $ne: 'x' } }]])(
    'rejects invalid body %#',
    async (payload) => {
      const res = await request(app).patch(`/api/alerts/${ID}/status`).set(auth).send(payload);
      expect(res.status).toBe(400);
      expect(Alert.findOne).not.toHaveBeenCalled();
    }
  );

  it('returns 404 for an alert that is not yours', async () => {
    Alert.findOne.mockResolvedValue(null);
    expect((await request(app).patch(`/api/alerts/${ID}/status`).set(auth).send({ status: 'resolved' })).status).toBe(404);
  });
});
