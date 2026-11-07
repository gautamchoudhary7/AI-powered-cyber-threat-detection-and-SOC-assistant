const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const { alertQuerySchema } = require('../validators/detectionSchemas');

const SORT_FIELDS = { createdAt: 'createdAt', severity: 'severityRank', confidence: 'confidence' };

// Analysts see alerts from their own uploads; admins see all of them.
const scopeFor = (user) => (user.role === 'admin' ? {} : { createdBy: user.id });

const publicAlert = (a, { withRecord = false } = {}) => ({
  id: String(a._id),
  jobId: a.jobId ? String(a.jobId) : null,
  sourceFileName: a.sourceFileName,
  rowIndex: a.rowIndex,
  csvLine: typeof a.rowIndex === 'number' ? a.rowIndex + 2 : null,
  predictedLabel: a.predictedLabel,
  attackCategory: a.attackCategory || null,
  attackScore: a.confidence,
  categoryConfidence: a.categoryConfidence ?? null,
  severity: a.severity,
  status: a.status,
  modelVersion: a.modelVersion,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  ...(withRecord ? { record: a.record } : {}),
});

async function findAlertFor(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Alert not found');
  const alert = await Alert.findOne({ _id: req.params.id, ...scopeFor(req.user) });
  if (!alert) throw new HttpError(404, 'Alert not found');
  return alert;
}

// GET /api/alerts?page=&limit=&severity=&status=&category=&jobId=&sortBy=&order=
const list = asyncHandler(async (req, res) => {
  const parsed = alertQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'Invalid query',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }
  const q = parsed.data;
  const filter = { ...scopeFor(req.user) };
  if (q.severity) filter.severity = q.severity;
  if (q.status) filter.status = q.status;
  if (q.category) filter.attackCategory = q.category; // exact match, never a regex
  if (q.jobId) filter.jobId = q.jobId;

  const direction = q.order === 'asc' ? 1 : -1;
  const sort = { [SORT_FIELDS[q.sortBy]]: direction, _id: direction }; // _id keeps paging stable
  const [items, total] = await Promise.all([
    Alert.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Alert.countDocuments(filter),
  ]);
  res.status(200).json({
    success: true,
    data: items.map((a) => publicAlert(a)),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
});

// GET /api/alerts/:id
const getOne = asyncHandler(async (req, res) => {
  const alert = await findAlertFor(req);
  res.status(200).json({ success: true, data: { alert: publicAlert(alert.toObject(), { withRecord: true }) } });
});

// PATCH /api/alerts/:id/status
const updateStatus = asyncHandler(async (req, res) => {
  const alert = await findAlertFor(req);
  const from = alert.status;
  alert.status = req.body.status;
  await alert.save();
  await audit.log({
    actor: req.user.id, action: 'alert.status_changed', resourceType: 'Alert',
    resourceId: String(alert.id), ip: req.ip, metadata: { from, to: alert.status },
  });
  res.status(200).json({ success: true, data: { alert: publicAlert(alert.toObject()) } });
});

module.exports = { list, getOne, updateStatus };
