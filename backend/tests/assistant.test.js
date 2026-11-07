const request = require('supertest');

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Alert', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../src/models/Incident', () => ({ findOne: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ log: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({ getMlHealth: jest.fn() }));
// Keep the real AiError class (the controller checks `instanceof`), but never call the network.
jest.mock('../src/services/aiClient', () => ({ ...jest.requireActual('../src/services/aiClient'), ask: jest.fn(), chat: jest.fn(), getAiHealth: jest.fn() }));

const User = require('../src/models/User');
const Alert = require('../src/models/Alert');
const Incident = require('../src/models/Incident');
const audit = require('../src/services/auditService');
const ai = require('../src/services/aiClient');
const config = require('../src/config');
const createApp = require('../src/app');
const { loginAs } = require('./helpers');

const app = createApp({ assistantRateLimitMax: 1000 });
const ALERT = 'a'.repeat(24);
const INC = 'b'.repeat(24);
const Q = 'What does this alert mean?';

const lean = (value) => ({ lean: jest.fn().mockResolvedValue(value) });
const alertDoc = (over = {}) => ({
  _id: ALERT, severity: 'high', status: 'new', predictedLabel: 'attack', attackCategory: 'DoS', confidence: 0.9, rowIndex: 3,
  sourceFileName: 'f.csv', record: { srcip: '10.9.8.7', dport: 80 }, ...over,
});
const aiAnswer = (over = {}) => ({
  question: Q, answer: 'It looks like DoS [S1].', generated: true, model: 'gemini-x', notes: [],
  sources: [{ id: 'S1', title: 'Guide', publisher: 'CISA', url: 'https://example.org/g', reference: '', section: 'Containment', snippet: 'text', cited: true }], ...over,
});

let auth;
beforeEach(() => {
  jest.resetAllMocks();
  config.assistantAllowRowValues = true;
  config.assistantGeneralChat = true;
  auth = loginAs(User);
  ai.ask.mockResolvedValue(aiAnswer());
});

describe('POST /api/assistant/ask', () => {
  it('requires login', async () => {
    expect((await request(app).post('/api/assistant/ask').send({ question: Q })).status).toBe(401);
  });

  it('answers a question about one of the user\'s own alerts, with sources', async () => {
    Alert.findOne.mockReturnValue(lean(alertDoc()));
    const res = await request(app).post('/api/assistant/ask').set(auth).send({ question: Q, alertId: ALERT });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ answer: 'It looks like DoS [S1].', generated: true, context: 'alert', rowValuesSent: false });
    expect(res.body.data.sources[0]).toMatchObject({ id: 'S1', publisher: 'CISA', url: 'https://example.org/g', cited: true });
    expect(Alert.findOne.mock.calls[0][0]).toMatchObject({ _id: ALERT, createdBy: 'u1' });
  });

  it('does NOT send raw row values unless the analyst ticked the box', async () => {
    Alert.findOne.mockReturnValue(lean(alertDoc()));
    await request(app).post('/api/assistant/ask').set(auth).send({ question: Q, alertId: ALERT });
    expect(JSON.stringify(ai.ask.mock.calls[0][0]).includes('10.9.8.7')).toBe(false);
  });

  it('sends row values when asked, and records that in the audit log', async () => {
    Alert.findOne.mockReturnValue(lean(alertDoc()));
    const res = await request(app).post('/api/assistant/ask').set(auth).send({ question: Q, alertId: ALERT, includeRowValues: true });
    expect(res.body.data.rowValuesSent).toBe(true);
    expect(JSON.stringify(ai.ask.mock.calls[0][0]).includes('10.9.8.7')).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'assistant.asked', metadata: expect.objectContaining({ rowValuesSent: true }) }));
  });

  it('refuses row values when the server switch is off, without calling the AI service', async () => {
    config.assistantAllowRowValues = false;
    const res = await request(app).post('/api/assistant/ask').set(auth).send({ question: Q, alertId: ALERT, includeRowValues: true });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/turned off/);
    expect(ai.ask).not.toHaveBeenCalled();
  });

  it('keeps the question text out of the audit log', async () => {
    Alert.findOne.mockReturnValue(lean(alertDoc()));
    await request(app).post('/api/assistant/ask').set(auth).send({ question: Q, alertId: ALERT });
    expect(JSON.stringify(audit.log.mock.calls).includes(Q)).toBe(false);
    expect(audit.log.mock.calls[0][0].metadata).toMatchObject({ context: 'alert', questionLength: Q.length });
  });

  it('returns 404 for someone else\'s alert and never calls the AI service', async () => {
    Alert.findOne.mockReturnValue(lean(null));
    expect((await request(app).post('/api/assistant/ask').set(auth).send({ question: Q, alertId: ALERT })).status).toBe(404);
    expect(ai.ask).not.toHaveBeenCalled();
  });

  it('answers about an incident using its linked alerts but not its notes', async () => {
    Incident.findOne.mockReturnValue(lean({ _id: INC, title: 'Scan', severity: 'high', status: 'open', alerts: [ALERT], notes: [{ text: 'SECRET NOTE' }] }));
    Alert.find.mockReturnValue(lean([alertDoc()]));
    const res = await request(app).post('/api/assistant/ask').set(auth).send({ question: Q, incidentId: INC });
    expect(res.status).toBe(200);
    expect(res.body.data.context).toBe('incident');
    const sent = JSON.stringify(ai.ask.mock.calls[0][0]);
    expect(sent.includes('SECRET NOTE')).toBe(false);
    expect(sent.includes('10.9.8.7')).toBe(false);
  });

  it('allows a general question with no alert or incident', async () => {
    const res = await request(app).post('/api/assistant/ask').set(auth).send({ question: Q });
    expect(res.status).toBe(200);
    expect(res.body.data.context).toBe('none');
  });

  it.each([
    [{ question: Q, alertId: ALERT, incidentId: INC }],
    [{ question: Q, includeRowValues: true }],
    [{ question: Q, incidentId: INC, includeRowValues: true }],
    [{ question: 'hi' }],
    [{ question: 'x'.repeat(501) }],
    [{ question: Q, alertId: 'nope' }],
    [{ question: Q, case_data: [{ label: 'x', fields: {} }] }],
    [{ question: Q, includeRowValues: 'yes' }],
  ])('rejects a bad request %#', async (body) => {
    expect((await request(app).post('/api/assistant/ask').set(auth).send(body)).status).toBe(400);
    expect(ai.ask).not.toHaveBeenCalled();
  });

  it.each([
    ['unreachable', 503], ['rate_limited', 429], ['blocked', 422], ['bad_request', 400], ['unavailable', 503],
  ])('turns an AI service failure "%s" into an honest %i', async (kind, status) => {
    ai.ask.mockRejectedValue(new ai.AiError(kind, 'Service said no.'));
    const res = await request(app).post('/api/assistant/ask').set(auth).send({ question: Q });
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(false);
  });

  it('passes through "no answer written" when no model is configured, and never invents one', async () => {
    ai.ask.mockResolvedValue(aiAnswer({ answer: null, generated: false, notes: ['No language model is configured.'] }));
    const res = await request(app).post('/api/assistant/ask').set(auth).send({ question: Q });
    expect(res.body.data).toMatchObject({ answer: null, generated: false });
    expect(res.body.data.notes[0]).toMatch(/No language model/);
  });

  it('makes only http(s) source links clickable and trims oversized replies', async () => {
    const src = (id, url) => ({ id, title: 't', publisher: 'p', url, snippet: 's' });
    ai.ask.mockResolvedValue(aiAnswer({ sources: [src('S1', 'javascript:alert(1)'), src('S2', 'local'), src('S3', 'https://ok.example/x'), ...[4, 5, 6, 7, 8].map((n) => src(`S${n}`, 'https://a.example'))] }));
    const res = await request(app).post('/api/assistant/ask').set(auth).send({ question: Q });
    expect(res.body.data.sources).toHaveLength(6);
    expect(res.body.data.sources.map((s) => s.url).slice(0, 3)).toEqual([null, null, 'https://ok.example/x']);
  });
});

describe('POST /api/assistant/chat (general chat)', () => {
  const CHAT_Q = 'hi how are you';
  const chatReply = (over = {}) => ({ question: CHAT_Q, answer: 'I am fine, thanks.', model: 'gemini-x', truncated: false, ...over });

  beforeEach(() => {
    ai.chat.mockResolvedValue(chatReply());
  });

  it('requires login', async () => {
    expect((await request(app).post('/api/assistant/chat').send({ question: CHAT_Q })).status).toBe(401);
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('answers any question, is labelled general, and has no sources', async () => {
    const res = await request(app).post('/api/assistant/chat').set(auth).send({ question: CHAT_Q });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ answer: 'I am fine, thanks.', generated: true, mode: 'general', sources: [], context: 'none', rowValuesSent: false, model: 'gemini-x' });
    expect(res.body.data.notes[0]).toMatch(/not based on your reference documents/);
    expect(ai.chat).toHaveBeenCalledWith({ question: CHAT_Q });
    expect(ai.ask).not.toHaveBeenCalled();
  });

  it('never reads the user\'s alerts or incidents', async () => {
    await request(app).post('/api/assistant/chat').set(auth).send({ question: CHAT_Q });
    expect(Alert.findOne).not.toHaveBeenCalled();
    expect(Alert.find).not.toHaveBeenCalled();
    expect(Incident.findOne).not.toHaveBeenCalled();
  });

  it('adds a note when the answer was cut off', async () => {
    ai.chat.mockResolvedValue(chatReply({ truncated: true }));
    const res = await request(app).post('/api/assistant/chat').set(auth).send({ question: CHAT_Q });
    expect(res.body.data.notes.join(' ')).toMatch(/cut off/);
  });

  it('keeps the question text out of the audit log', async () => {
    await request(app).post('/api/assistant/chat').set(auth).send({ question: CHAT_Q });
    expect(JSON.stringify(audit.log.mock.calls).includes(CHAT_Q)).toBe(false);
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'assistant.chat', metadata: { mode: 'general', questionLength: CHAT_Q.length } });
  });

  it('is refused, without calling the AI service, when the server switch is off', async () => {
    config.assistantGeneralChat = false;
    const res = await request(app).post('/api/assistant/chat').set(auth).send({ question: CHAT_Q });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/turned off/);
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ question: 'hi' }],
    [{ question: 'x'.repeat(1001) }],
    [{ question: CHAT_Q, alertId: 'a'.repeat(24) }],
    [{ question: CHAT_Q, includeRowValues: true }],
    [{ question: CHAT_Q, case_data: [{ label: 'x', fields: {} }] }],
    [{ question: { $gt: '' } }],
  ])('rejects a bad request %#', async (body) => {
    expect((await request(app).post('/api/assistant/chat').set(auth).send(body)).status).toBe(400);
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it.each([
    ['unreachable', 503], ['rate_limited', 429], ['blocked', 422], ['bad_request', 400], ['unavailable', 503],
  ])('turns an AI service failure "%s" into an honest %i', async (kind, status) => {
    ai.chat.mockRejectedValue(new ai.AiError(kind, 'Service said no.'));
    const res = await request(app).post('/api/assistant/chat').set(auth).send({ question: CHAT_Q });
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(false);
  });

  it('never invents an answer when the service returns none', async () => {
    ai.chat.mockResolvedValue({ question: CHAT_Q, model: 'gemini-x' });
    const res = await request(app).post('/api/assistant/chat').set(auth).send({ question: CHAT_Q });
    expect(res.body.data).toMatchObject({ answer: null, generated: false });
  });
});

describe('GET /api/assistant/status', () => {
  it('requires login and reports what the AI service says', async () => {
    expect((await request(app).get('/api/assistant/status')).status).toBe(401);
    ai.getAiHealth.mockResolvedValue({ reachable: true, status: 'ok', llmConfigured: true, rowValuesAllowed: true, generalChatAllowed: true });
    const res = await request(app).get('/api/assistant/status').set(auth);
    expect(res.body.data).toEqual({ reachable: true, status: 'ok', llmConfigured: true, rowValuesAllowed: true, generalChatAllowed: true });
  });
});
