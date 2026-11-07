jest.mock('axios');
const axios = require('axios');
const config = require('../src/config');
const { ask, chat, getAiHealth, AiError } = require('../src/services/aiClient');

const failure = (status, message) => ({ response: { status, data: { success: false, error: { message } } } });

beforeEach(() => {
  jest.resetAllMocks();
  config.aiInternalKey = 'shared-secret-value';
  config.assistantAllowRowValues = true;
  config.assistantGeneralChat = true;
});

describe('ask', () => {
  it('sends the shared secret in a header and returns the service data', async () => {
    axios.post.mockResolvedValue({ data: { data: { answer: 'ok' } } });
    expect(await ask({ question: 'q' })).toEqual({ answer: 'ok' });
    const [url, body, options] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/assistant\/ask$/);
    expect(body).toEqual({ question: 'q' });
    expect(options.headers['x-internal-key']).toBe('shared-secret-value');
    expect(url.includes('shared-secret-value')).toBe(false); // never in the URL
  });

  it.each([
    [undefined, 'unreachable'], [429, 'rate_limited'], [422, 'blocked'], [400, 'bad_request'], [502, 'unavailable'],
  ])('maps HTTP %s to "%s"', async (status, kind) => {
    axios.post.mockRejectedValue(status ? failure(status, 'msg') : new Error('ECONNREFUSED'));
    await expect(ask({ question: 'q' })).rejects.toMatchObject({ name: 'AiError', kind });
  });

  it('explains a rejected shared secret instead of showing "Not allowed"', async () => {
    axios.post.mockRejectedValue(failure(403, 'Not allowed'));
    await expect(ask({ question: 'q' })).rejects.toThrow(/AI_INTERNAL_KEY/);
  });

  it('explains an AI service that has no shared secret set', async () => {
    axios.post.mockRejectedValue(failure(503, 'INTERNAL_API_KEY is not set, so the assistant is turned off.'));
    await expect(ask({ question: 'q' })).rejects.toThrow(/AI_INTERNAL_KEY/);
  });

  it('shortens very long service messages', async () => {
    axios.post.mockRejectedValue(failure(429, 'x'.repeat(1000)));
    const err = await ask({ question: 'q' }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message.length).toBeLessThanOrEqual(300);
  });
});

describe('chat', () => {
  it('posts only the question to /assistant/chat with the shared secret in a header', async () => {
    axios.post.mockResolvedValue({ data: { data: { answer: 'hello' } } });
    expect(await chat({ question: 'hi there' })).toEqual({ answer: 'hello' });
    const [url, body, options] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/assistant\/chat$/);
    expect(body).toEqual({ question: 'hi there' });
    expect(options.headers['x-internal-key']).toBe('shared-secret-value');
    expect(url.includes('shared-secret-value')).toBe(false);
  });

  it('turns failures into AiError, including a service with no language model key', async () => {
    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(chat({ question: 'hi there' })).rejects.toMatchObject({ name: 'AiError', kind: 'unreachable' });
    axios.post.mockRejectedValue(failure(503, 'General chat needs a language model. Set LLM_API_KEY in the AI service settings.'));
    await expect(chat({ question: 'hi there' })).rejects.toThrow(/LLM_API_KEY/);
  });
});

describe('getAiHealth', () => {
  it('reports the model state and whether row values may be sent', async () => {
    axios.get.mockImplementation(async (url) => (url.endsWith('/health') ? { data: { data: { status: 'ok' } } } : { data: { data: { llm_configured: true } } }));
    expect(await getAiHealth()).toEqual({ reachable: true, status: 'ok', llmConfigured: true, rowValuesAllowed: true, generalChatAllowed: true });
    expect(axios.get.mock.calls.find(([u]) => u.endsWith('/assistant/status'))[1].headers['x-internal-key']).toBe('shared-secret-value');
  });

  it('says "no model" when the status call is refused, and "unreachable" when the service is down', async () => {
    axios.get.mockImplementation(async (url) => { if (url.endsWith('/health')) return { data: { data: { status: 'ok' } } }; throw failure(403, 'Not allowed'); });
    expect((await getAiHealth()).llmConfigured).toBe(false);
    axios.get.mockRejectedValue(new Error('down'));
    expect(await getAiHealth()).toEqual({ reachable: false, error: 'AI service is unreachable' });
  });

  it('reports whether the server allows general chat', async () => {
    axios.get.mockImplementation(async (url) => (url.endsWith('/health') ? { data: { data: { status: 'ok' } } } : { data: { data: { llm_configured: true } } }));
    config.assistantGeneralChat = false;
    expect((await getAiHealth()).generalChatAllowed).toBe(false);
  });
});
