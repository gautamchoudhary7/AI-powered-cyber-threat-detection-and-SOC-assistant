const request = require('supertest');

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Alert', () => ({ countDocuments: jest.fn(), aggregate: jest.fn() }));
jest.mock('../src/models/DetectionJob', () => ({ aggregate: jest.fn() }));
jest.mock('../src/models/Incident', () => ({ countDocuments: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({ getMlHealth: jest.fn() }));

const User = require('../src/models/User');
const Alert = require('../src/models/Alert');
const DetectionJob = require('../src/models/DetectionJob');
const Incident = require('../src/models/Incident');
const createApp = require('../src/app');
const { loginAs } = require('./helpers');

const app = createApp();
const USER_ID = 'a'.repeat(24); // a real-looking ObjectId, because aggregations convert it

let auth;
beforeEach(() => {
  jest.resetAllMocks();
  auth = loginAs(User, { id: USER_ID });
});

describe('GET /api/dashboard/stats', () => {
  it('requires login', async () => {
    expect((await request(app).get('/api/dashboard/stats')).status).toBe(401);
  });

  it('returns totals and a category distribution, scoped to the analyst', async () => {
    DetectionJob.aggregate.mockResolvedValue([{ _id: null, rows: 1500, jobs: 3 }]);
    Alert.countDocuments.mockResolvedValueOnce(120).mockResolvedValueOnce(40);
    Incident.countDocuments.mockResolvedValue(2);
    Alert.aggregate.mockResolvedValue([{ _id: 'DoS', count: 70 }, { _id: null, count: 50 }]);

    const res = await request(app).get('/api/dashboard/stats').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalAnalyzedRecords: 1500,
      completedAnalyses: 3,
      totalAlerts: 120,
      highSeverityAlerts: 40,
      openIncidents: 2,
      categoryDistribution: [{ category: 'DoS', count: 70 }, { category: 'Uncategorised', count: 50 }],
    });
    expect(Alert.countDocuments.mock.calls[0][0]).toEqual({ createdBy: USER_ID });
    const jobMatch = DetectionJob.aggregate.mock.calls[0][0][0].$match;
    expect(String(jobMatch.owner)).toBe(USER_ID);
    expect(jobMatch.status).toBe('completed');
  });

  it('shows zeros, not errors, when nothing has been analysed yet', async () => {
    DetectionJob.aggregate.mockResolvedValue([]);
    Alert.countDocuments.mockResolvedValue(0);
    Incident.countDocuments.mockResolvedValue(0);
    Alert.aggregate.mockResolvedValue([]);
    const res = await request(app).get('/api/dashboard/stats').set(auth);
    expect(res.body.data).toMatchObject({ totalAnalyzedRecords: 0, totalAlerts: 0, categoryDistribution: [] });
  });

  it('lets admins see everyone (no owner filter)', async () => {
    const adminAuth = loginAs(User, { id: 'b'.repeat(24), role: 'admin' });
    DetectionJob.aggregate.mockResolvedValue([]);
    Alert.countDocuments.mockResolvedValue(0);
    Incident.countDocuments.mockResolvedValue(0);
    Alert.aggregate.mockResolvedValue([]);
    await request(app).get('/api/dashboard/stats').set(adminAuth);
    expect(DetectionJob.aggregate.mock.calls[0][0][0].$match).toEqual({ status: 'completed' });
    expect(Alert.countDocuments.mock.calls[0][0]).toEqual({});
  });

  it('answers 503 when the database is down', async () => {
    const err = new Error('down');
    err.name = 'MongoNetworkError';
    DetectionJob.aggregate.mockRejectedValue(err);
    Alert.countDocuments.mockResolvedValue(0);
    Incident.countDocuments.mockResolvedValue(0);
    Alert.aggregate.mockResolvedValue([]);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request(app).get('/api/dashboard/stats').set(auth)).status).toBe(503);
  });
});

describe('GET /api/dashboard/trends', () => {
  it('returns one entry per day, filling quiet days with zeros', async () => {
    const today = new Date().toISOString().slice(0, 10);
    Alert.aggregate.mockResolvedValue([{ _id: today, total: 5, high: 2 }]);
    const res = await request(app).get('/api/dashboard/trends?days=7').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.timezone).toBe('UTC');
    expect(res.body.data.series).toHaveLength(7);
    expect(res.body.data.series[6]).toEqual({ date: today, total: 5, high: 2 });
    expect(res.body.data.series[0].total).toBe(0);
  });

  it('defaults to 14 days', async () => {
    Alert.aggregate.mockResolvedValue([]);
    const res = await request(app).get('/api/dashboard/trends').set(auth);
    expect(res.body.data.days).toBe(14);
    expect(res.body.data.series).toHaveLength(14);
  });

  it.each(['days=0', 'days=8', 'days=abc', 'days=1000', 'other=1'])('rejects bad query %s', async (query) => {
    const res = await request(app).get(`/api/dashboard/trends?${query}`).set(auth);
    expect(res.status).toBe(400);
    expect(Alert.aggregate).not.toHaveBeenCalled();
  });
});
