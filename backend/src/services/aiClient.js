// Client for the Python AI service (knowledge search and the assistant).
// Like the ML client, it never invents an answer: every failure says what really went wrong.
const axios = require('axios');
const config = require('../config');

class AiError extends Error {
  // kind: 'unreachable' | 'rate_limited' | 'blocked' | 'unavailable' | 'bad_request'
  constructor(kind, message) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}

// The AI service writes its own error messages (they contain no secrets), so they can be shown to the user.
function toAiError(err) {
  if (!err.response) return new AiError('unreachable', 'The AI service cannot be reached.');
  const { status, data } = err.response;
  const message = data && data.error && typeof data.error.message === 'string' ? data.error.message.slice(0, 300) : null;
  if (status === 403 || (status === 503 && message && message.includes('INTERNAL_API_KEY'))) {
    return new AiError('unavailable', 'The assistant is not set up correctly: AI_INTERNAL_KEY (backend) must equal INTERNAL_API_KEY (AI service).');
  }
  if (status === 429) return new AiError('rate_limited', message || 'The language-model usage limit was reached. Try again later.');
  if (status === 422) return new AiError('blocked', message || 'The language model declined to answer.');
  if (status === 400) return new AiError('bad_request', message || 'The question was rejected.');
  return new AiError('unavailable', message || `The AI service returned an error (HTTP ${status}).`);
}

const internalHeaders = () => ({ 'x-internal-key': config.aiInternalKey });

async function getAiHealth() {
  try {
    const [health, assistant] = await Promise.all([
      axios.get(`${config.aiServiceUrl}/health`, { timeout: 3000 }),
      axios.get(`${config.aiServiceUrl}/assistant/status`, { timeout: 3000, headers: internalHeaders() }).catch(() => null),
    ]);
    const a = assistant && assistant.data && assistant.data.data;
    return {
      reachable: true,
      status: health.data && health.data.data && health.data.data.status,
      // false when the service has no model key OR rejected our shared secret (both mean "no written answers")
      llmConfigured: Boolean(a && a.llm_configured),
      rowValuesAllowed: config.assistantAllowRowValues,
      generalChatAllowed: config.assistantGeneralChat,
    };
  } catch (err) {
    return { reachable: false, error: 'AI service is unreachable' };
  }
}

// body: { question, case_data, hint, top_k }. Returns the service's `data` object unchanged.
async function ask(body) {
  try {
    const res = await axios.post(`${config.aiServiceUrl}/assistant/ask`, body, { timeout: 45000, headers: internalHeaders() });
    return res.data.data;
  } catch (err) {
    throw toAiError(err);
  }
}

// body: { question }. General chat: no documents, no sources. Returns the service's `data` object unchanged.
async function chat(body) {
  try {
    const res = await axios.post(`${config.aiServiceUrl}/assistant/chat`, body, { timeout: 45000, headers: internalHeaders() });
    return res.data.data;
  } catch (err) {
    throw toAiError(err);
  }
}

module.exports = { ask, chat, getAiHealth, AiError };
