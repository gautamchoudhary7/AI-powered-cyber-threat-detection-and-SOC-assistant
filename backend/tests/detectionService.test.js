const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/models/Alert', () => ({ insertMany: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../src/models/DetectionJob', () => ({
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  find: jest.fn(),
}));
jest.mock('../src/services/mlClient', () => ({
  ...jest.requireActual('../src/services/mlClient'),
  predictBatch: jest.fn(),
}));

const Alert = require('../src/models/Alert');
const DetectionJob = require('../src/models/DetectionJob');
const config = require('../src/config');
const { predictBatch, MlError } = require('../src/services/mlClient');
const { readHeader, processJob, failStaleJobs, CsvProblem } = require('../src/services/detectionService');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-test-'));
let counter = 0;
function writeCsv(content) {
  const file = path.join(folder, `f${counter++}.csv`);
  fs.writeFileSync(file, content);
  return file;
}

// A fake ML service: a flow is an "attack" when dur > 1.
function fakeMl(records) {
  return {
    model_version: 'binary-test',
    category_model_version: 'multiclass-test',
    warnings: [],
    results: records.map((r, index) => {
      const attack = Number(r.dur) > 1;
      return {
        index,
        label: attack ? 'attack' : 'normal',
        is_attack: attack,
        attack_probability: attack ? 0.97 : 0.1,
        category: attack ? { label: 'DoS', confidence: 0.8 } : { label: 'Normal', confidence: 0.9 },
      };
    }),
  };
}

const JOB = { _id: 'j1', owner: 'u1', originalFileName: 'flows.csv' };
const lastUpdate = (status) => DetectionJob.updateOne.mock.calls.map((c) => c[1]).find((u) => u.status === status);

beforeEach(() => {
  jest.resetAllMocks();
  config.mlBatchSize = 2;
  config.maxUploadRows = 1000;
  DetectionJob.findByIdAndUpdate.mockResolvedValue(JOB);
  predictBatch.mockImplementation(async (records) => fakeMl(records));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('processJob', () => {
  it('streams the file in batches, saves alerts only for attacks, and completes the job', async () => {
    const file = writeCsv('dur,proto,label\n0.5,tcp,0\n2.0,udp,1\n,tcp,0\n3.0,icmp,1\n0.1,tcp,0\n');
    await processJob('j1', file, ['dur', 'proto']);

    expect(predictBatch).toHaveBeenCalledTimes(3); // 2 + 2 + 1 rows
    const firstBatch = predictBatch.mock.calls[0][0];
    expect(firstBatch[0]).toEqual({ dur: '0.5', proto: 'tcp' }); // extra "label" column is not sent
    expect(predictBatch.mock.calls[1][0][0]).toEqual({ dur: null, proto: 'tcp' }); // empty cell -> null

    const saved = Alert.insertMany.mock.calls.flatMap((c) => c[0]);
    expect(saved.map((a) => a.rowIndex)).toEqual([1, 3]); // zero-based data rows
    expect(saved[0]).toMatchObject({
      jobId: 'j1', createdBy: 'u1', predictedLabel: 'attack', attackCategory: 'DoS',
      confidence: 0.97, severity: 'critical', severityRank: 4, modelVersion: 'binary-test',
    });

    expect(lastUpdate('completed')).toMatchObject({
      totalRows: 5, processedRows: 5, attackCount: 2, normalCount: 3,
      categoryCounts: [{ category: 'DoS', count: 2 }],
      modelVersion: 'binary-test', categoryModelVersion: 'multiclass-test',
    });
    expect(fs.existsSync(file)).toBe(false); // the uploaded file is always deleted
  });

  it('fails cleanly and removes partial alerts when the ML service goes away mid-job', async () => {
    predictBatch.mockResolvedValueOnce(fakeMl([{ dur: 2 }, { dur: 2 }])).mockRejectedValue(new MlError('unreachable', 'down'));
    const file = writeCsv('dur,proto\n2,tcp\n2,tcp\n2,tcp\n2,tcp\n');
    await processJob('j1', file, ['dur', 'proto']);

    expect(Alert.deleteMany).toHaveBeenCalledWith({ jobId: 'j1' });
    const failed = lastUpdate('failed');
    expect(failed.errorMessage).toMatch(/unreachable/);
    expect(failed.attackCount).toBe(0);
    expect(lastUpdate('completed')).toBeUndefined();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('turns an ML "invalid values" error into a message with the real CSV line number', async () => {
    predictBatch.mockRejectedValue(
      new MlError('invalid_records', 'bad', { code: 'invalid_values', details: { count: 1, examples: [{ row: 1, column: 'dur', value: 'abc' }] } })
    );
    const file = writeCsv('dur,proto\n1,tcp\nabc,tcp\n');
    await processJob('j1', file, ['dur', 'proto']);
    expect(lastUpdate('failed').errorMessage).toMatch(/line 3.*"dur".*"abc"/);
  });

  it('fails a file that has a header but no data', async () => {
    const file = writeCsv('dur,proto\n');
    await processJob('j1', file, ['dur', 'proto']);
    expect(lastUpdate('failed').errorMessage).toMatch(/no data rows/);
    expect(predictBatch).not.toHaveBeenCalled();
  });

  it('enforces the row limit', async () => {
    config.maxUploadRows = 3;
    const file = writeCsv('dur,proto\n1,a\n1,a\n1,a\n1,a\n');
    await processJob('j1', file, ['dur', 'proto']);
    expect(lastUpdate('failed').errorMessage).toMatch(/more than 3 data rows/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('rejects rows with the wrong number of columns without crashing', async () => {
    const file = writeCsv('dur,proto\n1,tcp\n2\n');
    await processJob('j1', file, ['dur', 'proto']);
    expect(lastUpdate('failed').errorMessage).toMatch(/not valid CSV/);
  });

  it('never shows internal error text to users', async () => {
    predictBatch.mockRejectedValue(new TypeError('secret internal detail /var/app/x.js'));
    const file = writeCsv('dur,proto\n1,tcp\n');
    await processJob('j1', file, ['dur', 'proto']);
    expect(lastUpdate('failed').errorMessage).not.toMatch(/secret|\/var/);
  });

  it('refuses a response with the wrong number of predictions', async () => {
    predictBatch.mockResolvedValue({ model_version: 'x', results: [] });
    const file = writeCsv('dur,proto\n1,tcp\n');
    await processJob('j1', file, ['dur', 'proto']);
    expect(lastUpdate('failed')).toBeDefined();
    expect(Alert.insertMany).not.toHaveBeenCalled();
  });
});

describe('readHeader', () => {
  it('returns trimmed column names and ignores a byte-order mark', async () => {
    const file = writeCsv('﻿dur, proto ,rate\n1,tcp,2\n');
    expect(await readHeader(file)).toEqual(['dur', 'proto', 'rate']);
  });

  it('rejects empty files and binary files with a clear message', async () => {
    await expect(readHeader(writeCsv(''))).rejects.toThrow(CsvProblem);
    const binary = path.join(folder, 'bin.csv');
    fs.writeFileSync(binary, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01]));
    await expect(readHeader(binary)).rejects.toThrow(/not a text CSV/);
  });
});

describe('failStaleJobs', () => {
  it('marks unfinished jobs from a previous run as failed and removes their alerts', async () => {
    DetectionJob.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: 'a' }, { _id: 'b' }]) });
    expect(await failStaleJobs()).toBe(2);
    expect(Alert.deleteMany).toHaveBeenCalled();
    expect(DetectionJob.updateMany.mock.calls[0][1]).toMatchObject({ status: 'failed' });
  });

  it('does nothing when there are none', async () => {
    DetectionJob.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    expect(await failStaleJobs()).toBe(0);
    expect(DetectionJob.updateMany).not.toHaveBeenCalled();
  });
});
