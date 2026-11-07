const fs = require('fs');
const request = require('supertest');

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/DetectionJob', () => ({ create: jest.fn(), findById: jest.fn() }));
jest.mock('../src/models/Alert', () => ({ find: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ log: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({
  ...jest.requireActual('../src/services/mlClient'),
  getModelInfo: jest.fn(),
  predictBatch: jest.fn(),
}));
jest.mock('../src/services/detectionService', () => ({
  ...jest.requireActual('../src/services/detectionService'),
  readHeader: jest.fn(),
  processJob: jest.fn(),
  isBusy: jest.fn(),
}));

const User = require('../src/models/User');
const DetectionJob = require('../src/models/DetectionJob');
const Alert = require('../src/models/Alert');
const { getModelInfo, predictBatch, MlError } = require('../src/services/mlClient');
const service = require('../src/services/detectionService');
const createApp = require('../src/app');
const { loginAs } = require('./helpers');

const app = createApp();
const uploadDir = process.env.UPLOAD_DIR;
const filesInUploadDir = () => fs.readdirSync(uploadDir);
const csv = (text = 'dur,proto\n1,tcp\n') => Buffer.from(text);
const MODEL = { modelVersion: 'binary-test', categoryModelVersion: null, numeric: ['dur'], categorical: ['proto'] };

let auth;
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  for (const f of filesInUploadDir()) fs.unlinkSync(`${uploadDir}/${f}`);
  auth = loginAs(User);
  service.isBusy.mockReturnValue(false);
  getModelInfo.mockResolvedValue(MODEL);
  service.readHeader.mockResolvedValue(['dur', 'proto']);
  service.processJob.mockResolvedValue();
  DetectionJob.create.mockImplementation(async (doc) => ({ id: 'j1', ...doc, status: 'queued', processedRows: 0, createdAt: new Date() }));
});

describe('POST /api/detection/upload', () => {
  const send = (buf = csv(), name = 'flows.csv', type = 'text/csv') =>
    request(app).post('/api/detection/upload').set(auth).attach('file', buf, { filename: name, contentType: type });

  it('requires login', async () => {
    const res = await request(app).post('/api/detection/upload').attach('file', csv(), 'flows.csv');
    expect(res.status).toBe(401);
    expect(filesInUploadDir()).toEqual([]);
  });

  it('accepts a valid file with 202 and hands it to the background job', async () => {
    const res = await send();
    expect(res.status).toBe(202);
    expect(res.body.data.job).toMatchObject({ id: 'j1', status: 'queued', fileName: 'flows.csv' });
    const [jobId, filePath, required] = service.processJob.mock.calls[0];
    expect(jobId).toBe('j1');
    expect(required).toEqual(['dur', 'proto']);
    expect(filePath.startsWith(uploadDir)).toBe(true);
    expect(filePath).not.toContain('flows'); // stored under a random name, never the user's name
  });

  it('rejects a request with no file', async () => {
    const res = await request(app).post('/api/detection/upload').set(auth);
    expect(res.status).toBe(400);
  });

  it.each([['data.txt', 'text/plain'], ['data.csv.exe', 'application/octet-stream'], ['data.csv', 'image/png']])(
    'rejects %s sent as %s',
    async (name, type) => {
      const res = await send(csv(), name, type);
      expect(res.status).toBe(400);
      expect(filesInUploadDir()).toEqual([]);
    }
  );

  it('rejects an oversized file with 413 and leaves nothing on disk', async () => {
    const big = Buffer.alloc(1.5 * 1024 * 1024, 'a'); // limit is 1 MB in tests
    const res = await send(big);
    expect(res.status).toBe(413);
    expect(filesInUploadDir()).toEqual([]);
  });

  it('is refused with 429 when the server is busy, before any model call', async () => {
    service.isBusy.mockReturnValue(true);
    const res = await send();
    expect(res.status).toBe(429);
    expect(getModelInfo).not.toHaveBeenCalled();
  });

  it('answers 503 and deletes the file when no model is configured', async () => {
    getModelInfo.mockRejectedValue(new MlError('not_configured', 'x'));
    const res = await send();
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/not configured/i);
    expect(DetectionJob.create).not.toHaveBeenCalled();
    expect(filesInUploadDir()).toEqual([]);
  });

  it('answers 503 when the ML service cannot be reached', async () => {
    getModelInfo.mockRejectedValue(new MlError('unreachable', 'x'));
    const res = await send();
    expect(res.status).toBe(503);
    expect(filesInUploadDir()).toEqual([]);
  });

  it('answers 400 with the missing column names when the header does not match', async () => {
    service.readHeader.mockResolvedValue(['dur']);
    const res = await send();
    expect(res.status).toBe(400);
    expect(res.body.error.details.missingColumns).toEqual(['proto']);
    expect(service.processJob).not.toHaveBeenCalled();
    expect(filesInUploadDir()).toEqual([]);
  });

  it('answers 400 for a file that is not text', async () => {
    service.readHeader.mockRejectedValue(new service.CsvProblem('The file is not a text CSV file.'));
    const res = await send();
    expect(res.status).toBe(400);
    expect(filesInUploadDir()).toEqual([]);
  });

  it('answers 503 and cleans up when the database is down', async () => {
    const err = new Error('down');
    err.name = 'MongoNetworkError';
    DetectionJob.create.mockRejectedValue(err);
    const res = await send();
    expect(res.status).toBe(503);
    expect(filesInUploadDir()).toEqual([]);
  });

  it('rejects extra form fields', async () => {
    const res = await request(app).post('/api/detection/upload').set(auth).field('role', 'admin').attach('file', csv(), 'flows.csv');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/detection/predict', () => {
  const body = { records: [{ dur: 1, proto: 'tcp' }] };

  it('requires login', async () => {
    expect((await request(app).post('/api/detection/predict').send(body)).status).toBe(401);
  });

  it('returns the ML result', async () => {
    predictBatch.mockResolvedValue({ model_version: 'v1', results: [{ label: 'normal' }] });
    const res = await request(app).post('/api/detection/predict').set(auth).send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.model_version).toBe('v1');
  });

  it('maps ML failures to honest HTTP errors', async () => {
    predictBatch.mockRejectedValue(new MlError('not_configured', 'x'));
    expect((await request(app).post('/api/detection/predict').set(auth).send(body)).status).toBe(503);
    predictBatch.mockRejectedValue(new MlError('unreachable', 'x'));
    expect((await request(app).post('/api/detection/predict').set(auth).send(body)).status).toBe(503);
    predictBatch.mockRejectedValue(new MlError('invalid_records', 'bad', { code: 'missing_columns', details: { missing_columns: ['dur'] } }));
    const res = await request(app).post('/api/detection/predict').set(auth).send(body);
    expect(res.status).toBe(422);
  });

  it.each([
    [{}],
    [{ records: [] }],
    [{ records: 'x' }],
    [{ records: [{ dur: { nested: 1 } }] }],
    [{ records: [{ dur: [1] }] }],
    [{ records: Array.from({ length: 101 }, () => ({ dur: 1 })) }],
    [{ records: [{ dur: 1 }], extra: true }],
  ])('rejects invalid body %#', async (payload) => {
    const res = await request(app).post('/api/detection/predict').set(auth).send(payload);
    expect(res.status).toBe(400);
    expect(predictBatch).not.toHaveBeenCalled();
  });
});

describe('GET /api/detection/jobs/:id', () => {
  const job = (owner = 'u1', status = 'completed') => ({
    id: 'a'.repeat(24), owner, status, originalFileName: 'f.csv', processedRows: 3, totalRows: 3,
    attackCount: 1, normalCount: 2, categoryCounts: [{ category: 'DoS', count: 1 }], warnings: [],
  });
  const url = `/api/detection/jobs/${'a'.repeat(24)}`;

  it('requires login', async () => {
    expect((await request(app).get(url)).status).toBe(401);
  });

  it('shows the owner their job', async () => {
    DetectionJob.findById.mockResolvedValue(job('u1'));
    const res = await request(app).get(url).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.job).toMatchObject({ status: 'completed', attackCount: 1, categoryCounts: [{ category: 'DoS', count: 1 }] });
  });

  it("hides another user's job behind a 404", async () => {
    DetectionJob.findById.mockResolvedValue(job('someone-else'));
    expect((await request(app).get(url).set(auth)).status).toBe(404);
  });

  it('lets an admin see any job', async () => {
    const adminAuth = loginAs(User, { id: 'admin1', role: 'admin' });
    DetectionJob.findById.mockResolvedValue(job('someone-else'));
    expect((await request(app).get(url).set(adminAuth)).status).toBe(200);
  });

  it('returns 404 for malformed ids without querying the database', async () => {
    const res = await request(app).get('/api/detection/jobs/not-an-id').set(auth);
    expect(res.status).toBe(404);
    expect(DetectionJob.findById).not.toHaveBeenCalled();
  });
});

describe('GET /api/detection/jobs/:id/report.csv', () => {
  const url = `/api/detection/jobs/${'a'.repeat(24)}/report.csv`;
  const mockAlerts = (rows) =>
    Alert.find.mockReturnValue({
      sort: () => ({ lean: () => ({ cursor: () => (async function* gen() { yield* rows; })() }) }),
    });

  it('is refused until the job has completed', async () => {
    DetectionJob.findById.mockResolvedValue({ id: 'j', owner: 'u1', status: 'processing' });
    expect((await request(app).get(url).set(auth)).status).toBe(409);
  });

  it('streams a CSV and neutralises spreadsheet formulas', async () => {
    DetectionJob.findById.mockResolvedValue({ id: 'j1', _id: 'j1', owner: 'u1', status: 'completed' });
    mockAlerts([
      { rowIndex: 4, predictedLabel: 'attack', attackCategory: '=HYPERLINK("http://evil")', confidence: 0.97, severity: 'critical', status: 'new', modelVersion: 'v1' },
    ]);
    const res = await request(app).get(url).set(auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="detection-report-j1\.csv"/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('csv_line,row_index,predicted_label,attack_category,attack_score,severity,status,model_version');
    expect(lines[1].startsWith('6,4,attack,"\'=HYPERLINK(""http://evil"")",0.97,critical,new,v1')).toBe(true);
  });

  it("does not export someone else's job", async () => {
    DetectionJob.findById.mockResolvedValue({ id: 'j1', owner: 'other', status: 'completed' });
    expect((await request(app).get(url).set(auth)).status).toBe(404);
  });
});
