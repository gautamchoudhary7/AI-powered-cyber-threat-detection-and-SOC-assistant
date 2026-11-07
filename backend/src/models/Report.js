const mongoose = require('mongoose');
const { REPORT_TYPES } = require('../constants');

const reportSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    type: { type: String, enum: REPORT_TYPES, required: true },
    content: { type: String, required: true, maxlength: 100000 },
    relatedJob: { type: mongoose.Schema.Types.ObjectId },
    relatedIncident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

reportSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
