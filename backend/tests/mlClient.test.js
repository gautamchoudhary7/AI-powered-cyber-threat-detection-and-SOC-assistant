jest.mock('axios');
const axios = require('axios');
const config = require('../src/config');
const { getMlHealth, getModelInfo, predictBatch } = require('../src/services/mlClient');

const failure = (status, code) => ({ response: { status, data: { error: { code, message: 'msg' } } } });
const info = { data: { detector: { model_version: 'v1', schema: { numeric: ['dur'], categorical: ['proto'] } }, category_model: null } };

beforeEach(() => {
  jest.resetAllMocks();
  config.mlInternalKey = 'shared-secret-value';
});

describe('shared secret for the ML service', () => {
  it('sends it in the x-internal-key header on every call, never in the URL', async () => {
    axios.get.mockResolvedValueOnce({ data: { status: 'ok' } }).mockResolvedValueOnce(info);
    axios.post.mockResolvedValue({ data: { results: [] } });
    await getMlHealth();
    await getModelInfo();
    await predictBatch([{ dur: 1 }]);
    const calls = [...axios.get.mock.calls, ...axios.post.mock.calls];
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      const options = call[call.length - 1];
      expect(options.headers['x-internal-key']).toBe('shared-secret-value');
      expect(call[0].includes('shared-secret-value')).toBe(false);
    }
  });

  it('sends no header at all when no key is configured (local development)', async () => {
    config.mlInternalKey = '';
    axios.post.mockResolvedValue({ data: { results: [] } });
    await predictBatch([{ dur: 1 }]);
    expect(axios.post.mock.calls[0][2].headers).toEqual({});
  });

  it.each([[403, 'forbidden'], [503, 'access_not_configured']])('explains a refused key (HTTP %s)', async (status, code) => {
    axios.post.mockRejectedValue(failure(status, code));
    await expect(predictBatch([{ dur: 1 }])).rejects.toThrow(/ML_INTERNAL_KEY/);
  });

  it('still reports a model that is not trained as "not_configured"', async () => {
    axios.post.mockRejectedValue(failure(503, 'detection_not_configured'));
    await expect(predictBatch([{ dur: 1 }])).rejects.toMatchObject({ name: 'MlError', kind: 'not_configured' });
  });
});
