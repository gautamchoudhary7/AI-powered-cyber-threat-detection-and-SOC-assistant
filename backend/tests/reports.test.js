const request = require('supertest');

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Alert', () => ({ aggregate: jest.fn(), find: jest.fn() }));
jest.mock('../src/models/DetectionJob', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Incident', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/Report', () => ({ create: jest.fn(), find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ log: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({ getMlHealth: jest.fn() }));

const User = require('../src/models/User');
const Alert = require('../src/models/Alert');
const DetectionJob = require('../src/models/DetectionJob');
const Incident = require('../src/models/Incident');
const Report = require('../src/models/Report');
const audit = require('../src/services/auditService');
const createApp = require('../src/app');
const { loginAs } = require('./helpers');

const app = createApp();
const JOB = 'c'.repeat(24);
const INC = 'd'.repeat(24);
const REP = 'e'.repeat(24);

// Mongoose queries are chains (.sort().limit()...). This fakes a chain that ends in `result`.
const chain = (result) => {
  const q = {};
  ['select', 'sort', 'skip', 'limit', 'populate', 'lean'].forEach((m) => { q[m] = jest.fn(() => q); });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const jobDoc = (over = {}) => ({
  _id: JOB, id: JOB, owner: 'u1', status: 'completed', originalFileName: 'flows.csv', totalRows: 100, attackCount: 10,
  normalCount: 90, categoryCounts: [{ category: 'DoS', count: 10 }], modelVersion: 'v1', warnings: [],
  createdAt: new Date(), finishedAt: new Date(), ...over,
});
const savedReport = (doc) => ({ _id: REP, id: REP, createdAt: new Date(), ...doc });

let auth;
beforeEach(() => {
  jest.resetAllMocks();
  auth = loginAs(User);
  Report.create.mockImplementation(async (doc) => savedReport(doc));
});

describe('POST /api/reports (detection summary)', () => {
  const body = { type: 'detection_summary', jobId: JOB };

  beforeEach(() => {
    DetectionJob.findById.mockResolvedValue(jobDoc());
    Alert.aggregate.mockResolvedValue([{ _id: 'high', count: 4 }]);
    Alert.find.mockReturnValue(chain([{ severity: 'high', status: 'new', attackCategory: 'DoS', confidence: 0.9, rowIndex: 7 }]));
  });

  it('requires login', async () => {
    expect((await request(app).post('/api/reports').send(body)).status).toBe(401);
  });

  it('builds the report on the server from stored data, saves it and audits it', async () => {
    const res = await request(app).post('/api/reports').set(auth).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.report).toMatchObject({ type: 'detection_summary', relatedJob: JOB });
    expect(res.body.data.report.content).toBeUndefined(); // metadata only; read it with GET /:id
    const saved = Report.create.mock.calls[0][0];
    expect(saved.content).toContain('# Detection summary: flows.csv');
    expect(saved.content).toContain('| High | 4 |');
    expect(saved.content).toContain('| 9 | High | 0.900 | DoS | New |'); // CSV line = row index + 2
    expect(saved.createdBy).toBe('u1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'report.created', resourceType: 'Report' }));
  });

  it('does not accept report text from the client', async () => {
    const res = await request(app).post('/api/reports').set(auth).send({ ...body, content: 'I am official' });
    expect(res.status).toBe(400);
    expect(Report.create).not.toHaveBeenCalled();
  });

  it('rejects unknown types and malformed ids', async () => {
    expect((await request(app).post('/api/reports').set(auth).send({ type: 'other', jobId: JOB })).status).toBe(400);
    expect((await request(app).post('/api/reports').set(auth).send({ type: 'detection_summary', jobId: 'nope' })).status).toBe(400);
  });

  it('returns 404 for another user\'s job, the same as a missing one', async () => {
    DetectionJob.findById.mockResolvedValue(jobDoc({ owner: 'someone-else' }));
    const res = await request(app).post('/api/reports').set(auth).send(body);
    expect(res.status).toBe(404);
    expect(Report.create).not.toHaveBeenCalled();
  });

  it('lets an admin report on any job', async () => {
    DetectionJob.findById.mockResolvedValue(jobDoc({ owner: 'someone-else' }));
    const adminAuth = loginAs(User, { role: 'admin' });
    expect((await request(app).post('/api/reports').set(adminAuth).send(body)).status).toBe(201);
  });

  it('refuses a job that is not finished', async () => {
    DetectionJob.findById.mockResolvedValue(jobDoc({ status: 'processing' }));
    const res = await request(app).post('/api/reports').set(auth).send(body);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/reports (incident)', () => {
  const body = { type: 'incident', incidentId: INC };
  const incident = (over = {}) => ({
    _id: INC, id: INC, title: 'Suspicious scan', description: 'x', severity: 'high', status: 'open', alerts: [],
    notes: [{ text: 'note', author: { name: 'Asha' }, createdAt: new Date() }], createdAt: new Date(), updatedAt: new Date(), ...over,
  });

  it('builds an incident report scoped to the user', async () => {
    Incident.findOne.mockReturnValue(chain(incident()));
    const res = await request(app).post('/api/reports').set(auth).send(body);
    expect(res.status).toBe(201);
    expect(Incident.findOne.mock.calls[0][0]).toMatchObject({ _id: INC, createdBy: 'u1' });
    expect(Report.create.mock.calls[0][0]).toMatchObject({ type: 'incident', relatedIncident: INC });
    expect(Report.create.mock.calls[0][0].content).toContain('# Incident report: Suspicious scan');
  });

  it('includes linked alerts', async () => {
    Incident.findOne.mockReturnValue(chain(incident({ alerts: ['a'.repeat(24)] })));
    Alert.find.mockReturnValue(chain([{ severity: 'critical', status: 'new', attackCategory: 'DoS', confidence: 0.97, sourceFileName: 'f.csv', rowIndex: 3 }]));
    await request(app).post('/api/reports').set(auth).send(body);
    expect(Report.create.mock.calls[0][0].content).toContain('f.csv, line 5');
  });

  it('returns 404 for an incident the user cannot see', async () => {
    Incident.findOne.mockReturnValue(chain(null));
    expect((await request(app).post('/api/reports').set(auth).send(body)).status).toBe(404);
    expect(Report.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/reports', () => {
  it('lists the user\'s own reports without content', async () => {
    Report.find.mockReturnValue(chain([{ _id: REP, title: 'T', type: 'incident', createdAt: new Date() }]));
    Report.countDocuments.mockResolvedValue(1);
    const res = await request(app).get('/api/reports?type=incident').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].content).toBeUndefined();
    expect(Report.find.mock.calls[0][0]).toMatchObject({ createdBy: 'u1', type: 'incident' });
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it('lets an admin list everyone\'s reports', async () => {
    Report.find.mockReturnValue(chain([]));
    Report.countDocuments.mockResolvedValue(0);
    await request(app).get('/api/reports').set(loginAs(User, { role: 'admin' }));
    expect(Report.find.mock.calls[0][0].createdBy).toBeUndefined();
  });

  it('rejects an invalid query', async () => {
    expect((await request(app).get('/api/reports?limit=9999').set(auth)).status).toBe(400);
  });
});

describe('GET /api/reports/:id', () => {
  it('returns the content to its owner', async () => {
    Report.findOne.mockResolvedValue({ _id: REP, title: 'T', type: 'incident', content: '# hello', createdAt: new Date() });
    const res = await request(app).get(`/api/reports/${REP}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.report.content).toBe('# hello');
    expect(Report.findOne.mock.calls[0][0]).toMatchObject({ _id: REP, createdBy: 'u1' });
  });

  it('returns 404 for someone else\'s report and for a bad id', async () => {
    Report.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/reports/${REP}`).set(auth)).status).toBe(404);
    expect((await request(app).get('/api/reports/not-an-id').set(auth)).status).toBe(404);
  });
});
