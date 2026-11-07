const mongoose = require('mongoose');
const { SEVERITIES, INCIDENT_STATUSES } = require('../constants');

const noteSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const incidentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000 },
    severity: { type: String, enum: SEVERITIES, default: 'medium' },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'open' },
    alerts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alert' }],
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: [noteSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

incidentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Incident', incidentSchema);
