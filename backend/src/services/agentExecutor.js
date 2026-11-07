// Carries out an APPROVED suggestion. This is the only place the agent changes anything.
//
// Safeguards, in order:
//  1. The action and its parameters are checked against the whitelist again (a stored suggestion could be stale or tampered with).
//  2. It runs as the person who approved it, with that person's own access scope (analysts: their own records; admins: all).
//  3. Each change states the state it expects ("only if the alert is still 'new'"), so it never overwrites work someone else did since.
//  4. It never throws for expected problems; it returns { ok, message } with a fixed, safe message.
const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Incident = require('../models/Incident');
const { validateAction } = require('../utils/agentActions');

const scopeFor = (user) => (user.role === 'admin' ? {} : { createdBy: user.id });
const STALE = 'The record changed or is no longer available, so nothing was changed. Run a new scan.';

async function execute(proposal, user) {
  const checked = validateAction(proposal.action, proposal.params);
  if (!checked.ok) return { ok: false, message: 'This suggestion is no longer valid, so nothing was changed.' };
  const p = checked.params;

  try {
    switch (proposal.action) {
      case 'set_alert_status': {
        const updated = await Alert.findOneAndUpdate(
          { _id: p.alertId, status: p.expectedStatus, ...scopeFor(user) },
          { $set: { status: p.newStatus } },
          { new: true }
        );
        return updated
          ? { ok: true, message: `Alert status changed to "${p.newStatus}".`, resourceId: String(updated._id || updated.id) }
          : { ok: false, message: STALE };
      }
      case 'set_incident_status': {
        const updated = await Incident.findOneAndUpdate(
          { _id: p.incidentId, status: p.expectedStatus, ...scopeFor(user) },
          { $set: { status: p.newStatus } },
          { new: true }
        );
        return updated
          ? { ok: true, message: `Incident status changed to "${p.newStatus}".`, resourceId: String(updated._id || updated.id) }
          : { ok: false, message: STALE };
      }
      case 'create_incident': {
        // Every linked alert must still exist and be visible to the approver.
        const found = await Alert.countDocuments({ _id: mongoose.trusted({ $in: p.alertIds }), ...scopeFor(user) });
        if (found !== p.alertIds.length) return { ok: false, message: STALE };
        const incident = await Incident.create({
          title: p.title,
          description: 'Created from an agent suggestion that a person approved.',
          severity: p.severity,
          alerts: p.alertIds,
          createdBy: user.id,
        });
        return { ok: true, message: 'Incident created.', resourceId: String(incident._id || incident.id) };
      }
      default:
        return { ok: false, message: 'Unknown action, so nothing was changed.' };
    }
  } catch (err) {
    console.error('Agent action failed:', err && err.name); // the name only: never print data
    return { ok: false, message: 'The action failed unexpectedly, so nothing was changed.' };
  }
}

module.exports = { execute };
