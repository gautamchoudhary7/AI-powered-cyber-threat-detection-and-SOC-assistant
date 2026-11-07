const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Incident = require('../models/Incident');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const ai = require('../services/aiClient');
const config = require('../config');
const { buildAlertContext, buildIncidentContext } = require('../utils/assistantContext');

const { trusted } = mongoose;
const scopeFor = (user) => (user.role === 'admin' ? {} : { createdBy: user.id });

function aiToHttp(err) {
  if (!(err instanceof ai.AiError)) return err;
  switch (err.kind) {
    case 'unreachable': return new HttpError(503, 'The assistant is unavailable: the AI service cannot be reached.');
    case 'rate_limited': return new HttpError(429, err.message);
    case 'blocked': return new HttpError(422, err.message);
    case 'bad_request': return new HttpError(400, err.message);
    default: return new HttpError(503, err.message);
  }
}

// Only http(s) links become clickable; anything else (such as "local" for the team's own notes) is shown as text.
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/.test(u) ? u : null);

const publicSource = (s) => ({
  id: String(s.id), title: String(s.title), publisher: String(s.publisher), url: safeUrl(s.url),
  reference: s.reference || '', section: s.section || '', snippet: String(s.snippet || ''), cited: Boolean(s.cited),
});

// POST /api/assistant/ask   { question, alertId? | incidentId? }
const askQuestion = asyncHandler(async (req, res) => {
  const { question, alertId, incidentId } = req.body;
  const includeRowValues = Boolean(req.body.includeRowValues);
  if (includeRowValues && !config.assistantAllowRowValues) {
    throw new HttpError(400, 'Sending raw row values to the language model is turned off on this server.');
  }
  let context = { caseData: undefined, hint: undefined };
  let contextType = 'none';

  if (alertId) {
    const alert = await Alert.findOne({ _id: alertId, ...scopeFor(req.user) }).lean();
    if (!alert) throw new HttpError(404, 'Alert not found');
    context = buildAlertContext(alert, { includeRowValues });
    contextType = 'alert';
  } else if (incidentId) {
    const incident = await Incident.findOne({ _id: incidentId, ...scopeFor(req.user) }).lean();
    if (!incident) throw new HttpError(404, 'Incident not found');
    const alerts = incident.alerts && incident.alerts.length
      ? await Alert.find({ _id: trusted({ $in: incident.alerts }) }).lean()
      : [];
    context = buildIncidentContext(incident, alerts);
    contextType = 'incident';
  }

  let result;
  try {
    result = await ai.ask({ question, case_data: context.caseData, hint: context.hint, top_k: 4 });
  } catch (err) {
    throw aiToHttp(err);
  }

  // The question text is not stored in the audit log (it may contain sensitive details); only its size is.
  await audit.log({
    actor: req.user.id, action: 'assistant.asked', resourceType: contextType === 'none' ? 'Assistant' : contextType === 'alert' ? 'Alert' : 'Incident',
    resourceId: alertId || incidentId, ip: req.ip,
    metadata: { context: contextType, questionLength: question.length, generated: Boolean(result.generated), rowValuesSent: includeRowValues },
  });

  res.status(200).json({
    success: true,
    data: {
      question: String(result.question || question),
      answer: typeof result.answer === 'string' ? result.answer : null,
      generated: Boolean(result.generated),
      model: result.model || null,
      sources: Array.isArray(result.sources) ? result.sources.slice(0, 6).map(publicSource) : [],
      notes: Array.isArray(result.notes) ? result.notes.slice(0, 5).map(String) : [],
      context: contextType,
      rowValuesSent: includeRowValues,
    },
  });
});

// POST /api/assistant/chat   { question }
// General chat: the language model answers from its own knowledge. No reference documents, no user records, no sources.
// Because nothing can be checked against a source, the response is labelled mode: "general" and the page says so.
const chatQuestion = asyncHandler(async (req, res) => {
  if (!config.assistantGeneralChat) {
    throw new HttpError(403, 'General chat is turned off on this server. Use the cited mode instead.');
  }
  const { question } = req.body;

  let result;
  try {
    result = await ai.chat({ question });
  } catch (err) {
    throw aiToHttp(err);
  }

  // As with cited questions, the question text is not stored in the audit log; only its size is.
  await audit.log({
    actor: req.user.id, action: 'assistant.chat', resourceType: 'Assistant', ip: req.ip,
    metadata: { mode: 'general', questionLength: question.length },
  });

  const notes = ['General answer from an AI model. It is not based on your reference documents or your data, has no sources, and can be wrong.'];
  if (result.truncated) notes.push('The answer was cut off because it reached the length limit. Ask a narrower question to get the rest.');

  res.status(200).json({
    success: true,
    data: {
      question: String(result.question || question),
      answer: typeof result.answer === 'string' ? result.answer : null,
      generated: typeof result.answer === 'string' && result.answer.length > 0,
      model: result.model || null,
      sources: [],
      notes,
      context: 'none',
      mode: 'general',
      rowValuesSent: false,
    },
  });
});

// GET /api/assistant/status -> is the AI service reachable, and does it have a language model?
const status = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: await ai.getAiHealth() });
});

module.exports = { askQuestion, chatQuestion, status };
