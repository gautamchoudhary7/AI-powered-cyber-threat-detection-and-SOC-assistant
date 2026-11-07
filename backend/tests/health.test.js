const request = require('supertest');

// Mock the ML client so the test does not need the ML service running.
jest.mock('../src/services/mlClient', () => ({
  getMlHealth: jest.fn(),
}));
const { getMlHealth } = require('../src/services/mlClient');
const createApp = require('../src/app');

const app = createApp();

describe('GET /api/health', () => {
  it('returns 200 and backend status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('backend');
    expect(res.body.data.status).toBe('ok');
    // No database connection is opened in tests, and the API says so honestly.
    expect(res.body.data.database).toBe('disconnected');
  });
});

describe('GET /api/health/ml', () => {
  it('reports reachable=true when the ML service answers', async () => {
    getMlHealth.mockResolvedValue({ reachable: true, status: 'ok', model_loaded: false });
    const res = await request(app).get('/api/health/ml');
    expect(res.status).toBe(200);
    expect(res.body.data.reachable).toBe(true);
    expect(res.body.data.model_loaded).toBe(false);
  });

  it('reports reachable=false (not fake success) when the ML service is down', async () => {
    getMlHealth.mockResolvedValue({ reachable: false, error: 'ML service is unreachable' });
    const res = await request(app).get('/api/health/ml');
    expect(res.status).toBe(200);
    expect(res.body.data.reachable).toBe(false);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
