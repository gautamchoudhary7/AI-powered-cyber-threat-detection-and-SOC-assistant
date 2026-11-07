const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const DetectionJob = require('../models/DetectionJob');
const Incident = require('../models/Incident');
const Report = require('../models/Report');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const { reportQuerySchema } = require('../validators/reportSchemas');
const { buildDetectionSummary, buildIncidentReport } = require('../utils/reportBuilder');

const { trusted } = mongoose;

const TOP_ALERTS = 10;

// Analysts see their own reports; admins see all of them. Other users' reports return 404.
const scopeFor = (user) => (user.role === 'admin' ? {} : { createdBy: user.id });

const publicReport = (r, withContent = false) => ({
  id: String(r._id || r.id),
  title: r.title,
  type: r.type,
  relatedJob: r.relatedJob ? String(r.relatedJob) : null,
  relatedIncident: r.relatedIncident ? String(r.relatedIncident) : null,
  createdAt: r.createdAt,
  ...(withContent ? { content: r.content } : {}),
});

const countsFromGroups = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));

async function buildFromJob(req, jobId) {
  const job = await DetectionJob.findById(jobId);
  // Same rule as the detection routes: owner or admin, otherwise "not found".
  if (!job || (req.user.role !== 'admin' && String(job.owner) !== String(req.user.id))) {
    throw new HttpError(404, 'Job not found');
  }
  if (job.status !== 'completed') throw new HttpError(409, 'A report can only be made after the analysis has completed.');

  // Aggregations do not convert text ids, so the conversion is explicit.
  const match = { jobId: new mongoose.Types.ObjectId(String(job.id)) };
  const [severityRows, statusRows, topAlerts] = await Promise.all([
    Alert.aggregate([{ $match: match }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    Alert.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Alert.find({ jobId: job.id }).sort({ confidence: -1, _id: 1 }).limit(TOP_ALERTS).lean(),
  ]);

  const content = buildDetectionSummary({
    job: {
      fileName: job.originalFileName,
      totalRows: job.totalRows,
      attackCount: job.attackCount,
      normalCount: job.normalCount,
      categoryCounts: (job.categoryCounts || []).map((c) => ({ category: c.category, count: c.count })),
      modelVersion: job.modelVersion,
      categoryModelVersion: job.categoryModelVersion,
      warnings: job.warnings || [],
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    },
    severityCounts: countsFromGroups(severityRows),
    statusCounts: countsFromGroups(statusRows),
    topAlerts: topAlerts.map((a) => ({
      severity: a.severity, status: a.status, attackCategory: a.attackCategory,
      attackScore: a.confidence, csvLine: typeof a.rowIndex === 'number' ? a.rowIndex + 2 : null,
    })),
    generatedAt: new Date(),
    generatedBy: req.user.name,
  });
  return {
    content,
    defaultTitle: `Detection summary: ${job.originalFileName || 'uploaded file'}`.slice(0, 200),
    related: { relatedJob: job._id },
    auditMeta: { jobId: String(job.id) },
  };
}

async function buildFromIncident(req, incidentId) {
  const incident = await Incident.findOne({ _id: incidentId, ...scopeFor(req.user) }).populate('notes.author', 'name');
  if (!incident) throw new HttpError(404, 'Incident not found');

  const alerts = incident.alerts.length
    ? await Alert.find({ _id: trusted({ $in: incident.alerts }) }).lean()
    : [];

  const content = buildIncidentReport({
    incident: {
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      notes: incident.notes.map((n) => ({
        author: n.author && n.author.name ? n.author.name : 'Unknown user',
        text: n.text,
        createdAt: n.createdAt,
      })),
    },
    alerts: alerts.map((a) => ({
      severity: a.severity, status: a.status, attackCategory: a.attackCategory, attackScore: a.confidence,
      sourceFileName: a.sourceFileName, csvLine: typeof a.rowIndex === 'number' ? a.rowIndex + 2 : null,
    })),
    generatedAt: new Date(),
    generatedBy: req.user.name,
  });
  return {
    content,
    defaultTitle: `Incident report: ${incident.title}`.slice(0, 200),
    related: { relatedIncident: incident._id },
    auditMeta: { incidentId: String(incident.id) },
  };
}

// POST /api/reports   { type: 'detection_summary', jobId } or { type: 'incident', incidentId }
const create = asyncHandler(async (req, res) => {
  const built = req.body.type === 'detection_summary'
    ? await buildFromJob(req, req.body.jobId)
    : await buildFromIncident(req, req.body.incidentId);

  const report = await Report.create({
    title: req.body.title || built.defaultTitle,
    type: req.body.type,
    content: built.content,
    ...built.related,
    createdBy: req.user.id,
  });
  await audit.log({
    actor: req.user.id, action: 'report.created', resourceType: 'Report', resourceId: String(report.id),
    ip: req.ip, metadata: { type: req.body.type, ...built.auditMeta },
  });
  res.status(201).json({ success: true, data: { report: publicReport(report) } });
});

// GET /api/reports?page=&limit=&type=   (the list does not include the content)
const list = asyncHandler(async (req, res) => {
  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  const q = parsed.data;
  const filter = { ...scopeFor(req.user) };
  if (q.type) filter.type = q.type;

  const [items, total] = await Promise.all([
    Report.find(filter).select('-content').sort({ createdAt: -1, _id: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Report.countDocuments(filter),
  ]);
  res.status(200).json({
    success: true,
    data: items.map((r) => publicReport(r)),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
});

// GET /api/reports/:id
const getOne = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Report not found');
  const report = await Report.findOne({ _id: req.params.id, ...scopeFor(req.user) });
  if (!report) throw new HttpError(404, 'Report not found');
  res.status(200).json({ success: true, data: { report: publicReport(report, true) } });
});

module.exports = { create, list, getOne };
