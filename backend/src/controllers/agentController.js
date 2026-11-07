const mongoose = require('mongoose');
const config = require('../config');
const Alert = require('../models/Alert');
const Incident = require('../models/Incident');
const AgentProposal = require('../models/AgentProposal');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const executor = require('../services/agentExecutor');
const { buildProposals } = require('../utils/agentRules');
const { ACTIONS, validateAction } = require('../utils/agentActions');
const { proposalQuerySchema } = require('../validators/agentSchemas');

const { trusted } = mongoose;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_ALERT_LIMIT = 2000;
const SCAN_INCIDENT_LIMIT = 200;

// Analysts see and decide on their own suggestions; admins can see and decide on all of them.
const ownerScope = (user) => (user.role === 'admin' ? {} : { owner: user.id });
const dataScope = (user) => (user.role === 'admin' ? {} : { createdBy: user.id });

function requireEnabled() {
  if (!config.agentEnabled) throw new HttpError(503, 'The agent is turned off on this server (AGENT_ENABLED=false).');
}

// A suggestion that was never decided and is past its deadline is shown as expired.
const effectiveStatus = (p, now = new Date()) => (p.status === 'pending' && p.expiresAt && new Date(p.expiresAt) <= now ? 'expired' : p.status);

const publicProposal = (p) => ({
  id: String(p._id || p.id),
  action: p.action,
  actionLabel: ACTIONS[p.action] ? ACTIONS[p.action].label : p.action,
  summary: p.summary,
  rationale: p.rationale,
  ruleId: p.ruleId,
  status: effectiveStatus(p),
  evidence: {
    alertIds: (p.evidence && p.evidence.alertIds ? p.evidence.alertIds : []).map(String),
    incidentIds: (p.evidence && p.evidence.incidentIds ? p.evidence.incidentIds : []).map(String),
  },
  createdAt: p.createdAt,
  expiresAt: p.expiresAt,
  decidedAt: p.decidedAt || null,
  decisionReason: p.decisionReason || null,
  executedAt: p.executedAt || null,
  result: p.result && p.result.message ? { ok: Boolean(p.result.ok), message: p.result.message, resourceId: p.result.resourceId || null } : null,
});

function findProposalFilter(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Suggestion not found');
  return { _id: req.params.id, ...ownerScope(req.user) };
}

// GET /api/agent/status
const status = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      enabled: config.agentEnabled,
      ttlDays: config.agentProposalTtlDays,
      actions: Object.entries(ACTIONS).map(([name, a]) => ({ name, label: a.label })),
      usesLanguageModel: false,
    },
  });
});

// POST /api/agent/scan   (no body). Looks at your alerts and incidents and stores NEW suggestions. Changes nothing else.
const scan = asyncHandler(async (req, res) => {
  requireEnabled();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.agentProposalTtlDays * DAY_MS);

  // Mark old undecided suggestions as expired, so they can be suggested again if they still apply.
  await AgentProposal.updateMany({ ...ownerScope(req.user), status: 'pending', expiresAt: trusted({ $lte: now }) }, { $set: { status: 'expired' } });

  const [alerts, incidents] = await Promise.all([
    Alert.find({ ...dataScope(req.user), status: 'new', severity: trusted({ $in: ['critical', 'high'] }) })
      .sort({ confidence: -1 }).limit(SCAN_ALERT_LIMIT).lean(),
    Incident.find({ ...dataScope(req.user), status: trusted({ $in: ['open', 'investigating'] }) }).limit(SCAN_INCIDENT_LIMIT).lean(),
  ]);
  const linkedIds = [...new Set(incidents.flatMap((i) => (i.alerts || []).map(String)))].slice(0, SCAN_ALERT_LIMIT);
  const linked = linkedIds.length
    ? await Alert.find({ _id: trusted({ $in: linkedIds }), ...dataScope(req.user) }).select('status').lean()
    : [];
  const alertsById = new Map(linked.map((a) => [String(a._id), a]));

  const { proposals, truncated } = buildProposals({ alerts, incidents, alertsById });

  // Defence in depth: only valid, whitelisted suggestions are ever stored.
  const valid = proposals.filter((p) => validateAction(p.action, p.params).ok);
  const existing = valid.length
    ? await AgentProposal.find({ owner: req.user.id, dedupeKey: trusted({ $in: valid.map((p) => p.dedupeKey) }) }).select('dedupeKey status').lean()
    : [];
  const statusByKey = new Map(existing.map((e) => [e.dedupeKey, e.status]));

  const fresh = [];
  let skipped = 0;
  for (const p of valid) {
    const doc = {
      owner: req.user.id, ruleId: p.ruleId, action: p.action, params: p.params, summary: p.summary, rationale: p.rationale,
      evidence: p.evidence, dedupeKey: p.dedupeKey, status: 'pending', expiresAt,
    };
    const previous = statusByKey.get(p.dedupeKey);
    if (previous && !['expired', 'failed'].includes(previous)) {
      skipped += 1; // already pending, approved, done or rejected: never suggest the same thing twice
      continue;
    }
    try {
      if (previous) {
        const recycled = await AgentProposal.findOneAndUpdate(
          { owner: req.user.id, dedupeKey: p.dedupeKey, status: trusted({ $in: ['expired', 'failed'] }) },
          { $set: doc, $unset: { decidedBy: '', decidedAt: '', decisionReason: '', executedAt: '', result: '' } },
          { new: true }
        );
        if (recycled) fresh.push(recycled);
        else skipped += 1;
      } else {
        fresh.push(await AgentProposal.create(doc));
      }
    } catch (err) {
      if (err && err.code === 11000) skipped += 1; // another scan created it at the same moment
      else throw err;
    }
  }

  await audit.log({
    actor: req.user.id, action: 'agent.scan', resourceType: 'Agent', ip: req.ip,
    metadata: { alertsLooked: alerts.length, incidentsLooked: incidents.length, created: fresh.length, skipped, truncated },
  });
  res.status(200).json({
    success: true,
    data: { created: fresh.length, skippedExisting: skipped, truncated, proposals: fresh.map(publicProposal) },
  });
});

// GET /api/agent/proposals?status=&page=&limit=
const list = asyncHandler(async (req, res) => {
  const parsed = proposalQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  const q = parsed.data;
  const filter = { ...ownerScope(req.user) };
  if (q.status === 'expired') {
    // "expired" includes undecided suggestions that are past their deadline but not yet marked
    filter.$or = [{ status: 'expired' }, { status: 'pending', expiresAt: trusted({ $lte: new Date() }) }];
  } else if (q.status === 'pending') {
    filter.status = 'pending';
    filter.expiresAt = trusted({ $gt: new Date() });
  } else if (q.status) {
    filter.status = q.status;
  }
  const [items, total] = await Promise.all([
    AgentProposal.find(filter).sort({ createdAt: -1, _id: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    AgentProposal.countDocuments(filter),
  ]);
  res.status(200).json({
    success: true,
    data: items.map(publicProposal),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
});

// GET /api/agent/proposals/:id
const getOne = asyncHandler(async (req, res) => {
  const proposal = await AgentProposal.findOne(findProposalFilter(req)).lean();
  if (!proposal) throw new HttpError(404, 'Suggestion not found');
  res.status(200).json({ success: true, data: { proposal: publicProposal(proposal) } });
});

// Explains why a suggestion could not be decided now (it exists and is visible, but is not pending).
async function explainNotPending(req) {
  const existing = await AgentProposal.findOne(findProposalFilter(req)).lean();
  if (!existing) throw new HttpError(404, 'Suggestion not found');
  if (effectiveStatus(existing) === 'expired') throw new HttpError(410, 'This suggestion has expired. Run a new scan.');
  throw new HttpError(409, `This suggestion was already ${existing.status}.`);
}

// POST /api/agent/proposals/:id/approve   (no body). The server runs the stored, validated action; the client sends nothing to run.
const approve = asyncHandler(async (req, res) => {
  requireEnabled();
  const now = new Date();
  // One atomic step: only a suggestion that is still pending and not expired can be claimed, and only once.
  const claimed = await AgentProposal.findOneAndUpdate(
    { ...findProposalFilter(req), status: 'pending', expiresAt: trusted({ $gt: now }) },
    { $set: { status: 'approved', decidedBy: req.user.id, decidedAt: now } },
    { new: true }
  );
  if (!claimed) return explainNotPending(req);

  await audit.log({
    actor: req.user.id, action: 'agent.approved', resourceType: 'AgentProposal', resourceId: String(claimed._id || claimed.id), ip: req.ip,
    metadata: { action: claimed.action, ruleId: claimed.ruleId },
  });

  const result = await executor.execute(claimed, req.user);
  const finished = await AgentProposal.findOneAndUpdate(
    { _id: claimed._id },
    { $set: { status: result.ok ? 'executed' : 'failed', executedAt: new Date(), result } },
    { new: true }
  );
  await audit.log({
    actor: req.user.id, action: result.ok ? 'agent.executed' : 'agent.failed', resourceType: 'AgentProposal',
    resourceId: String(claimed._id || claimed.id), ip: req.ip,
    metadata: { action: claimed.action, ok: result.ok, targetId: result.resourceId || null },
  });
  res.status(200).json({ success: true, data: { proposal: publicProposal(finished || claimed), result } });
});

// POST /api/agent/proposals/:id/reject   { reason? }
const reject = asyncHandler(async (req, res) => {
  const now = new Date();
  const rejected = await AgentProposal.findOneAndUpdate(
    { ...findProposalFilter(req), status: 'pending', expiresAt: trusted({ $gt: now }) },
    { $set: { status: 'rejected', decidedBy: req.user.id, decidedAt: now, decisionReason: req.body.reason || undefined } },
    { new: true }
  );
  if (!rejected) return explainNotPending(req);
  // The reason text is not copied into the audit log.
  await audit.log({
    actor: req.user.id, action: 'agent.rejected', resourceType: 'AgentProposal', resourceId: String(rejected._id || rejected.id), ip: req.ip,
    metadata: { action: rejected.action, hasReason: Boolean(req.body.reason) },
  });
  res.status(200).json({ success: true, data: { proposal: publicProposal(rejected) } });
});

module.exports = { status, scan, list, getOne, approve, reject };
