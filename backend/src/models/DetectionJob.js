const mongoose = require('mongoose');

const JOB_STATUSES = ['queued', 'processing', 'completed', 'failed'];

// One uploaded CSV = one detection job. The file itself is deleted after processing;
// only the job summary and the alerts are kept.
const detectionJobSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalFileName: { type: String, maxlength: 255 }, // display text only, never used as a path
    sizeBytes: { type: Number, min: 0 },
    status: { type: String, enum: JOB_STATUSES, default: 'queued' },
    processedRows: { type: Number, default: 0, min: 0 },
    totalRows: { type: Number, default: null }, // known only when processing finishes
    attackCount: { type: Number, default: 0, min: 0 },
    normalCount: { type: Number, default: 0, min: 0 },
    // Array (not an object) because category names are data and must not become database keys.
    categoryCounts: [{ _id: false, category: String, count: Number }],
    modelVersion: { type: String, maxlength: 100 },
    categoryModelVersion: { type: String, maxlength: 100 },
    warnings: [{ type: String, maxlength: 500 }],
    errorMessage: { type: String, maxlength: 1000 },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

detectionJobSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('DetectionJob', detectionJobSchema);
module.exports.JOB_STATUSES = JOB_STATUSES;
