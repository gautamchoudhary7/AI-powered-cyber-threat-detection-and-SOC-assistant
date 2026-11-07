// The ONLY things the agent may ever do. Anything not listed here cannot be proposed or executed.
// All three are ordinary workflow steps inside this app; none touches a network, a file or another system.
//
// Parameters are checked by hand (no libraries) and must match exactly: unknown fields are refused, so a stored
// or tampered proposal cannot smuggle in extra instructions. This runs twice: when a suggestion is created and
// again right before it is carried out.

const { SEVERITIES, ALERT_STATUSES, INCIDENT_STATUSES } = require('../constants');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const isId = (v) => typeof v === 'string' && OBJECT_ID.test(v);
const isOneOf = (list) => (v) => typeof v === 'string' && list.includes(v);
// eslint-disable-next-line no-control-regex
const hasControl = (s) => /[\u0000-\u001f\u007f]/.test(s);

const ACTIONS = {
  create_incident: {
    label: 'Create an incident',
    fields: {
      title: (v) => typeof v === 'string' && v.trim() === v && v.length >= 3 && v.length <= 200 && !hasControl(v),
      severity: isOneOf(SEVERITIES),
      alertIds: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 100 && v.every(isId) && new Set(v).size === v.length,
    },
  },
  set_alert_status: {
    label: 'Change an alert\'s status',
    fields: {
      alertId: isId,
      expectedStatus: isOneOf(ALERT_STATUSES),
      newStatus: isOneOf(ALERT_STATUSES),
    },
    // extra rule: it must actually change something
    check: (p) => (p.expectedStatus === p.newStatus ? 'The new status must differ from the current one' : null),
  },
  set_incident_status: {
    label: 'Change an incident\'s status',
    fields: {
      incidentId: isId,
      expectedStatus: isOneOf(INCIDENT_STATUSES),
      newStatus: isOneOf(INCIDENT_STATUSES),
    },
    check: (p) => (p.expectedStatus === p.newStatus ? 'The new status must differ from the current one' : null),
  },
};

const ACTION_NAMES = Object.keys(ACTIONS);
const isKnownAction = (name) => typeof name === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, name);

// -> { ok: true, params } or { ok: false, error }
function validateAction(action, params) {
  if (!isKnownAction(action)) return { ok: false, error: 'Unknown action' };
  if (!params || typeof params !== 'object' || Array.isArray(params)) return { ok: false, error: 'Parameters must be an object' };
  const spec = ACTIONS[action];
  const keys = Object.keys(params);
  const extra = keys.filter((k) => !Object.prototype.hasOwnProperty.call(spec.fields, k));
  if (extra.length) return { ok: false, error: `Unexpected parameter: ${extra[0]}` };
  for (const [name, valid] of Object.entries(spec.fields)) {
    if (!valid(params[name])) return { ok: false, error: `Invalid parameter: ${name}` };
  }
  const problem = spec.check ? spec.check(params) : null;
  if (problem) return { ok: false, error: problem };
  return { ok: true, params: { ...params } };
}

module.exports = { ACTIONS, ACTION_NAMES, isKnownAction, validateAction };
