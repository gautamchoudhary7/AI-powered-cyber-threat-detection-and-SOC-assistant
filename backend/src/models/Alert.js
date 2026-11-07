const mongoose = require('mongoose');
const { SEVERITIES, ALERT_STATUSES } = require('../constants');

// One alert = one network-flow record that the ML model flagged as suspicious.
// Fields below are a starting point; Phase 3 will align them with the real dataset columns.
const alertSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, index: true }, // detection job (Phase 4)
    sourceFileName: { type: String, maxlength: 255 },
    rowIndex: { type: Number, min: 0 },
    predictedLabel: { type: String, required: true, maxlength: 100 },
    attackCategory: { type: String, maxlength: 100 },
    // Model confidence between 0 and 1. Null when the model gives no meaningful score.
    // For detection alerts this is the model's attack score (NOT a calibrated probability).
    confidence: { type: Number, min: 0, max: 1, default: null },
    categoryConfidence: { type: Number, min: 0, max: 1, default: null },
    severity: { type: String, enum: SEVERITIES, required: true },
    // 1 (low) to 4 (critical). Stored so alerts can be sorted by severity in the right order.
    severityRank: { type: Number, min: 1, max: 4 },
    status: { type: String, enum: ALERT_STATUSES, default: 'new' },
    modelVersion: { type: String, maxlength: 50 },
    // Raw record values the analyst may inspect (kept flexible until the schema is known).
    record: { type: mongoose.Schema.Types.Mixed },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

alertSchema.index({ createdBy: 1, createdAt: -1 });
alertSchema.index({ severity: 1, status: 1 });

module.exports = mongoose.model('Alert', alertSchema);
