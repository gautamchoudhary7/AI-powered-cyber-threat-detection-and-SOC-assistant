const mongoose = require('mongoose');
const { AGENT_STATUSES } = require('../constants');

// One suggestion made by the agent's fixed rules. Nothing happens until a person approves it.
// Free text here comes only from our own rule code (never from a user or a language model), apart from the
// optional reason a person types when rejecting.
const agentProposalSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // whose data the suggestion is about
    ruleId: { type: String, required: true, maxlength: 60 },
    action: { type: String, required: true, maxlength: 60 }, // must be on the whitelist (checked in code)
    params: { type: mongoose.Schema.Types.Mixed, required: true },
    summary: { type: String, required: true, maxlength: 400 },
    rationale: { type: String, required: true, maxlength: 1000 },
    evidence: {
      alertIds: [{ type: mongoose.Schema.Types.ObjectId }],
      incidentIds: [{ type: mongoose.Schema.Types.ObjectId }],
    },
    dedupeKey: { type: String, required: true, maxlength: 120 },
    status: { type: String, enum: AGENT_STATUSES, default: 'pending' },
    expiresAt: { type: Date, required: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    decisionReason: { type: String, maxlength: 300 },
    executedAt: Date,
    result: { ok: Boolean, message: { type: String, maxlength: 300 }, resourceId: { type: String, maxlength: 60 } },
  },
  { timestamps: true }
);

// The same suggestion is never created twice for the same person.
agentProposalSchema.index({ owner: 1, dedupeKey: 1 }, { unique: true });
agentProposalSchema.index({ owner: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('AgentProposal', agentProposalSchema);
