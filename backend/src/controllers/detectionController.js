const fsp = require('fs/promises');
const mongoose = require('mongoose');
const config = require('../config');
const Alert = require('../models/Alert');
const DetectionJob = require('../models/DetectionJob');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const detectionService = require('../services/detectionService');
const { getModelInfo, predictBatch, MlError } = require('../services/mlClient');
const { checkHeaders, safeDisplayName, escapeCsvCell } = require('../utils/detectionHelpers');

// Converts ML client failures into honest HTTP errors. No fake success is ever produced.
function mlToHttp(err) {
  if (!(err instanceof MlError)) return err;
  switch (err.kind) {
    case 'unreachable':
      return new HttpError(503, 'Detection is unavailable: the ML service cannot be reached.');
    case 'not_configured':
      return new HttpError(503, 'Detection is not configured: no trained model is available yet.');
    case 'invalid_records':
      return new HttpError(422, err.message, err.details && err.details.details);
    case 'too_many_records':
      return new HttpError(413, 'Too many records in one request.');
    default:
      return new HttpError(502, 'The ML service returned an error.');
  }
}

// A user may open their own jobs; admins may open any. Others get 404 so ids cannot be probed.
function canAccess(user, ownerId) {
  return user.role === 'admin' || String(ownerId) === String(user.id);
}

async function findJobFor(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Job not found');
  const job = await DetectionJob.findById(req.params.id);
  if (!job || !canAccess(req.user, job.owner)) throw new HttpError(404, 'Job not found');
  return job;
}

const publicJob = (job) => ({
  id: String(job.id),
  fileName: job.originalFileName,
  sizeBytes: job.sizeBytes,
  status: job.status,
  processedRows: job.processedRows,
  totalRows: job.totalRows,
  attackCount: job.attackCount,
  normalCount: job.normalCount,
  categoryCounts: (job.categoryCounts || []).map((c) => ({ category: c.category, count: c.count })),
  modelVersion: job.modelVersion || null,
  categoryModelVersion: job.categoryModelVersion || null,
  warnings: job.warnings || [],
  errorMessage: job.errorMessage || null,
  createdAt: job.createdAt,
  startedAt: job.startedAt || null,
  finishedAt: job.finishedAt || null,
});

// POST /api/detection/upload   (multipart form, field "file")
// Checks everything it can BEFORE accepting the job, then analyses in the background.
const upload = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'No file received. Send a CSV in the "file" field.');
  let handedOver = false;
  try {
    let info;
    try {
      info = await getModelInfo(); // the model's own schema decides which columns are required
    } catch (err) {
      throw mlToHttp(err);
    }

    let headers;
    try {
      headers = await detectionService.readHeader(file.path);
    } catch (err) {
      if (err instanceof detectionService.CsvProblem) throw new HttpError(400, err.message);
      throw err;
    }

    const required = [...info.numeric, ...info.categorical];
    const check = checkHeaders(headers, required);
    if (!check.ok) {
      throw new HttpError(400, 'The CSV columns do not match what the model needs.', {
        missingColumns: check.missing,
        totalMissing: check.totalMissing,
        duplicateColumns: check.duplicates,
        emptyColumnNames: check.emptyNames,
        forbiddenColumnNames: check.unsafe,
      });
    }

    const job = await DetectionJob.create({
      owner: req.user.id,
      originalFileName: safeDisplayName(file.originalname),
      sizeBytes: file.size,
      status: 'queued',
      modelVersion: info.modelVersion,
    });
    await audit.log({
      actor: req.user.id, action: 'detection.upload', resourceType: 'DetectionJob',
      resourceId: String(job.id), ip: req.ip, metadata: { sizeBytes: file.size },
    });

    handedOver = true; // the background job now owns the file and will delete it
    detectionService.processJob(job.id, file.path, required).catch((err) => console.error('processJob crashed:', err.name));
    res.status(202).json({
      success: true,
      data: { job: publicJob(job), ignoredColumns: check.ignoredCount },
    });
  } finally {
    if (!handedOver) await fsp.unlink(file.path).catch(() => {});
  }
});

// POST /api/detection/predict   (small interactive check; nothing is saved)
const predict = asyncHandler(async (req, res) => {
  try {
    const result = await predictBatch(req.body.records);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    throw mlToHttp(err);
  }
});

// GET /api/detection/jobs/:id
const getJob = asyncHandler(async (req, res) => {
  const job = await findJobFor(req);
  res.status(200).json({ success: true, data: { job: publicJob(job) } });
});

// GET /api/detection/jobs/:id/report.csv   (flagged rows only, spreadsheet-safe)
const downloadReport = asyncHandler(async (req, res) => {
  const job = await findJobFor(req);
  if (job.status !== 'completed') throw new HttpError(409, 'The report is available once the analysis has completed.');

  const columns = ['csv_line', 'row_index', 'predicted_label', 'attack_category', 'attack_score', 'severity', 'status', 'model_version'];
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="detection-report-${job.id}.csv"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.write(`${columns.join(',')}\n`);

  // Streamed row by row so a large report never sits in memory.
  const cursor = Alert.find({ jobId: job._id }).sort({ rowIndex: 1 }).lean().cursor();
  try {
    for await (const a of cursor) {
      const line = [a.rowIndex + 2, a.rowIndex, a.predictedLabel, a.attackCategory, a.confidence, a.severity, a.status, a.modelVersion];
      res.write(`${line.map(escapeCsvCell).join(',')}\n`);
    }
  } catch (err) {
    console.error('Report stream failed:', err.name);
    res.destroy(); // a cut-off download is better than a file that looks complete but is not
    return;
  }
  res.end();
});

module.exports = { upload, predict, getJob, downloadReport, publicJob };
