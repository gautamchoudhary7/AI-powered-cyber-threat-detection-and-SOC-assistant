// The detection workflow: read a CSV a little at a time, ask the ML service for predictions,
// save alerts for flagged rows, and keep the job record up to date.
//
// Memory use stays small because the file is streamed and only one batch is held at a time.
const fs = require('fs');
const fsp = require('fs/promises');
const mongoose = require('mongoose');
const { parse } = require('csv-parse');
const config = require('../config');
const Alert = require('../models/Alert');
const DetectionJob = require('../models/DetectionJob');
const { predictBatch, MlError } = require('./mlClient');
const { severityFromScore, normalizeCell, looksBinary } = require('../utils/detectionHelpers');

const MAX_RECORD_BYTES = 1024 * 1024; // one CSV row may not exceed 1 MB
const MAX_WARNINGS = 20;

// Thrown for problems with the uploaded file itself. The message is safe to show the user.
class CsvProblem extends Error {
  constructor(message) {
    super(message);
    this.name = 'CsvProblem';
  }
}

let runningJobs = 0;
const isBusy = () => runningJobs >= config.maxConcurrentJobs;

const parserOptions = (extra = {}) => ({
  bom: true,
  skip_empty_lines: true,
  trim: true,
  max_record_size: MAX_RECORD_BYTES,
  ...extra,
});

function describeCsvError(err) {
  if (err && typeof err.code === 'string' && err.code.startsWith('CSV_')) {
    const line = err.lines ? ` near line ${err.lines}` : '';
    return new CsvProblem(`The file is not valid CSV${line}. Check for rows with a different number of columns or broken quotes.`);
  }
  return err;
}

// Reads only the first line (the header). Also refuses files that look binary.
async function readHeader(filePath) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const sample = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    if (bytesRead === 0) throw new CsvProblem('The file is empty.');
    if (looksBinary(sample.subarray(0, bytesRead))) throw new CsvProblem('The file is not a text CSV file.');
  } finally {
    await handle.close();
  }

  const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  const parser = stream.pipe(parse(parserOptions({ to_line: 1, relax_column_count: true })));
  try {
    for await (const row of parser) return row.map((h) => String(h).trim());
  } catch (err) {
    throw describeCsvError(err);
  } finally {
    stream.destroy();
  }
  throw new CsvProblem('The file has no header row.');
}

function addCount(counts, key) {
  counts.set(key, (counts.get(key) || 0) + 1);
}

// Turns one batch of CSV rows into predictions and alerts. Returns counts for the job summary.
async function scoreBatch({ rows, firstIndex, job, requiredColumns, state }) {
  // Only the columns the model needs are sent, and empty cells become null.
  const records = rows.map((row) => {
    const record = {};
    for (const col of requiredColumns) record[col] = normalizeCell(row[col]);
    return record;
  });

  let response;
  try {
    response = await predictBatch(records);
  } catch (err) {
    if (err instanceof MlError && err.kind === 'invalid_records' && err.details && err.details.details) {
      // The ML service reports batch-relative row numbers. Convert them to the user's CSV line numbers.
      const examples = (err.details.details.examples || []).slice(0, 5).map(
        (e) => `line ${firstIndex + e.row + 2}, column "${e.column}", value "${e.value}"`
      );
      const missing = err.details.details.missing_columns;
      throw new CsvProblem(
        missing
          ? `Required columns are missing: ${missing.join(', ')}`
          : `Some numeric columns contain values that are not numbers (${examples.join('; ')}).`
      );
    }
    throw err;
  }

  if (!response || !Array.isArray(response.results) || response.results.length !== rows.length) {
    throw new MlError('error', 'The ML service returned an unexpected number of predictions.');
  }
  state.modelVersion = response.model_version;
  state.categoryModelVersion = response.category_model_version || null;
  for (const w of response.warnings || []) {
    if (state.warnings.size < MAX_WARNINGS) state.warnings.add(String(w).slice(0, 500));
  }

  const alerts = [];
  response.results.forEach((result, i) => {
    if (!result.is_attack) {
      state.normal += 1;
      return;
    }
    state.attack += 1;
    const category = result.category ? result.category.label : null;
    if (category) addCount(state.categories, category);
    const { severity, rank } = severityFromScore(result.attack_probability);
    alerts.push({
      jobId: job._id,
      sourceFileName: job.originalFileName,
      rowIndex: firstIndex + i,
      predictedLabel: result.label,
      attackCategory: category,
      confidence: result.attack_probability,
      categoryConfidence: result.category ? result.category.confidence : null,
      severity,
      severityRank: rank,
      modelVersion: response.model_version,
      record: records[i],
      createdBy: job.owner,
    });
  });
  if (alerts.length > 0) await Alert.insertMany(alerts, { ordered: false });
}

function userMessage(err) {
  if (err instanceof CsvProblem) return err.message;
  if (err instanceof MlError) {
    if (err.kind === 'unreachable') return 'The ML service became unreachable during analysis. Nothing was saved; please try again.';
    if (err.kind === 'not_configured') return 'Detection is not configured: no trained model is available.';
    return 'The ML service reported an error during analysis. Nothing was saved.';
  }
  return 'Analysis failed unexpectedly. Nothing was saved.';
}

// Runs one job from start to finish and ALWAYS deletes the uploaded file.
// On failure the job's alerts are removed so a half-finished analysis is never shown as a result.
async function processJob(jobId, filePath, requiredColumns) {
  runningJobs += 1;
  const state = { attack: 0, normal: 0, categories: new Map(), warnings: new Set(), modelVersion: null, categoryModelVersion: null };
  let totalRows = 0;
  try {
    const job = await DetectionJob.findByIdAndUpdate(jobId, { status: 'processing', startedAt: new Date() }, { new: true });
    if (!job) throw new Error('job disappeared');

    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    const parser = stream.pipe(parse(parserOptions({ columns: (h) => h.map((x) => String(x).trim()) })));
    let batch = [];
    let batchStart = 0;
    try {
      for await (const row of parser) {
        if (totalRows >= config.maxUploadRows) {
          throw new CsvProblem(`The file has more than ${config.maxUploadRows.toLocaleString('en-US')} data rows, which is the limit.`);
        }
        batch.push(row);
        totalRows += 1;
        if (batch.length >= config.mlBatchSize) {
          await scoreBatch({ rows: batch, firstIndex: batchStart, job, requiredColumns, state });
          batchStart = totalRows;
          batch = [];
          await DetectionJob.updateOne({ _id: jobId }, { processedRows: totalRows });
        }
      }
    } catch (err) {
      throw describeCsvError(err);
    } finally {
      stream.destroy();
    }
    if (batch.length > 0) await scoreBatch({ rows: batch, firstIndex: batchStart, job, requiredColumns, state });
    if (totalRows === 0) throw new CsvProblem('The file has a header but no data rows.');

    await DetectionJob.updateOne(
      { _id: jobId },
      {
        status: 'completed',
        processedRows: totalRows,
        totalRows,
        attackCount: state.attack,
        normalCount: state.normal,
        categoryCounts: [...state.categories].map(([category, count]) => ({ category, count })),
        modelVersion: state.modelVersion,
        categoryModelVersion: state.categoryModelVersion,
        warnings: [...state.warnings],
        finishedAt: new Date(),
      }
    );
  } catch (err) {
    if (!(err instanceof CsvProblem) && !(err instanceof MlError)) console.error('Job failed:', err.name);
    try {
      await Alert.deleteMany({ jobId });
      await DetectionJob.updateOne(
        { _id: jobId },
        { status: 'failed', errorMessage: userMessage(err), attackCount: 0, normalCount: 0, categoryCounts: [], finishedAt: new Date() }
      );
    } catch (dbErr) {
      console.error('Could not record job failure:', dbErr.name);
    }
  } finally {
    runningJobs -= 1;
    await fsp.unlink(filePath).catch(() => {});
  }
}

// Called once when the server starts: jobs left "processing" by a crash or restart can never finish.
async function failStaleJobs() {
  // sanitizeFilter is on (it blocks operators that came from users). These operators are ours,
  // so they are marked trusted; otherwise Mongoose would turn them into plain values and match nothing.
  const stale = await DetectionJob.find({ status: mongoose.trusted({ $in: ['queued', 'processing'] }) }).select('_id');
  if (stale.length === 0) return 0;
  const ids = stale.map((j) => j._id);
  await Alert.deleteMany({ jobId: mongoose.trusted({ $in: ids }) });
  await DetectionJob.updateMany(
    { _id: mongoose.trusted({ $in: ids }) },
    { status: 'failed', errorMessage: 'The server restarted before this analysis finished. Please upload the file again.', finishedAt: new Date() }
  );
  return ids.length;
}

module.exports = { readHeader, processJob, failStaleJobs, isBusy, CsvProblem };
