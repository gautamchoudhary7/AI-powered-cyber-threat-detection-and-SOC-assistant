const request = require('supertest');

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Alert', () => ({ find: jest.fn(), findOneAndUpdate: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../src/models/Incident', () => ({ find: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn() }));
jest.mock('../src/models/AgentProposal', () => ({
  find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn(), updateMany: jest.fn(), countDocuments: jest.fn(),
}));
jest.mock('../src/services/auditService', () => ({ log: jest.fn() }));
jest.mock('../src/services/mlClient', () => ({ getMlHealth: jest.fn() }));

const User = require('../src/models/User');
const Alert = require('../src/models/Alert');
const Incident = require('../src/models/Incident');
const AgentProposal = require('../src/models/AgentProposal');
const audit = require('../src/services/auditService');
const config = require('../src/config');
const createApp = require('../src/app');
const { loginAs } = require('./helpers');

const app = createApp({ agentRateLimitMax: 1000 });
const A1 = 'a'.repeat(24);
const PID = 'c'.repeat(24);
const JOB = 'd'.repeat(24);

// Mongoose queries are chains; this fakes one that ends in `result`.
const chain = (result) => {
  const q = {};
  ['select', 'sort', 'skip', 'limit', 'lean'].forEach((m) => { q[m] = jest.fn(() => q); });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};
const critical = (i, over = {}) => ({
  _id: (i + 1).toString(16).padStart(24, '0'), jobId: JOB, status: 'new', severity: 'critical', attackCategory: 'DoS', confidence: 0.9 + i / 1000, sourceFileName: 'f.csv', ...over,
});
const proposalDoc = (over = {}) => ({
  _id: PID, id: PID, owner: 'u1', ruleId: 'triage_critical', action: 'set_alert_status',
  params: { alertId: A1, expectedStatus: 'new', newStatus: 'investigating' },
  summary: 'Mark alert as investigating.', rationale: 'because', evidence: { alertIds: [A1], incidentIds: [] },
  dedupeKey: `triage:${A1}`, status: 'pending', expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(), ...over,
});

let auth;
beforeEach(() => {
  jest.resetAllMocks();
  config.agentEnabled = true;
  auth = loginAs(User);
  AgentProposal.updateMany.mockResolvedValue({});
  AgentProposal.create.mockImplementation(async (doc) => ({ _id: PID, id: PID, createdAt: new Date(), ...doc }));
  AgentProposal.find.mockReturnValue(chain([]));
  Alert.find.mockReturnValue(chain([]));
  Incident.find.mockReturnValue(chain([]));
});

describe('POST /api/agent/scan', () => {
  it('requires login', async () => {
    expect((await request(app).post('/api/agent/scan').send({})).status).toBe(401);
  });

  it('suggests one incident for a group of alerts, stores it as pending, and changes nothing else', async () => {
    Alert.find.mockReturnValueOnce(chain([0, 1, 2].map((i) => critical(i))));
    const res = await request(app).post('/api/agent/scan').set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.proposals[0]).toMatchObject({ action: 'create_incident', status: 'pending' });
    const stored = AgentProposal.create.mock.calls[0][0];
    expect(stored).toMatchObject({ owner: 'u1', status: 'pending', ruleId: 'group_high_severity' });
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
    expect(Incident.create).not.toHaveBeenCalled(); // suggesting is not doing
    expect(Alert.findOneAndUpdate).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'agent.scan', metadata: expect.objectContaining({ created: 1 }) }));
  });

  it('only looks at the user\'s own alerts and incidents', async () => {
    await request(app).post('/api/agent/scan').set(auth).send({});
    expect(Alert.find.mock.calls[0][0]).toMatchObject({ createdBy: 'u1', status: 'new' });
    expect(Incident.find.mock.calls[0][0]).toMatchObject({ createdBy: 'u1' });
  });

  it('never suggests the same thing twice, but recycles expired or failed ones', async () => {
    Alert.find.mockReturnValueOnce(chain([critical(0, { jobId: '1'.repeat(24) }), critical(1, { jobId: '2'.repeat(24) }), critical(2, { jobId: '3'.repeat(24) })]));
    const keys = [0, 1, 2].map((i) => `triage:${(i + 1).toString(16).padStart(24, '0')}`);
    AgentProposal.find.mockReturnValue(chain([{ dedupeKey: keys[0], status: 'rejected' }, { dedupeKey: keys[1], status: 'executed' }, { dedupeKey: keys[2], status: 'expired' }]));
    AgentProposal.findOneAndUpdate.mockResolvedValue(proposalDoc());
    const res = await request(app).post('/api/agent/scan').set(auth).send({});
    expect(res.body.data).toMatchObject({ created: 1, skippedExisting: 2 });
    expect(AgentProposal.create).not.toHaveBeenCalled();
    expect(AgentProposal.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('ignores a duplicate-key race instead of failing', async () => {
    Alert.find.mockReturnValueOnce(chain([critical(0)]));
    AgentProposal.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const res = await request(app).post('/api/agent/scan').set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, skippedExisting: 1 });
  });

  it('refuses any input: the client cannot supply an action', async () => {
    const res = await request(app).post('/api/agent/scan').set(auth).send({ action: 'set_alert_status', params: {} });
    expect(res.status).toBe(400);
    expect(Alert.find).not.toHaveBeenCalled();
  });

  it('does nothing when the agent is turned off', async () => {
    config.agentEnabled = false;
    const res = await request(app).post('/api/agent/scan').set(auth).send({});
    expect(res.status).toBe(503);
    expect(Alert.find).not.toHaveBeenCalled();
  });
});

describe('GET /api/agent/proposals', () => {
  it('lists only the user\'s own suggestions, newest first, and shows overdue ones as expired', async () => {
    AgentProposal.find.mockReturnValue(chain([proposalDoc({ expiresAt: new Date(Date.now() - 1000) })]));
    AgentProposal.countDocuments.mockResolvedValue(1);
    const res = await request(app).get('/api/agent/proposals').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('expired');
    expect(AgentProposal.find.mock.calls[0][0]).toMatchObject({ owner: 'u1' });
    expect(res.body.data[0].params).toBeUndefined(); // raw parameters are not exposed
  });

  it('lets an admin see everyone\'s, and filters pending ones to those not yet overdue', async () => {
    AgentProposal.find.mockReturnValue(chain([]));
    AgentProposal.countDocuments.mockResolvedValue(0);
    await request(app).get('/api/agent/proposals?status=pending').set(loginAs(User, { role: 'admin' }));
    const filter = AgentProposal.find.mock.calls[0][0];
    expect(filter.owner).toBeUndefined();
    expect(filter).toMatchObject({ status: 'pending' });
    expect(filter.expiresAt).toBeDefined();
  });

  it('rejects an unknown status', async () => {
    expect((await request(app).get('/api/agent/proposals?status=deleted').set(auth)).status).toBe(400);
  });
});

describe('POST /api/agent/proposals/:id/approve', () => {
  const approveUrl = `/api/agent/proposals/${PID}/approve`;

  it('requires a person: an anonymous request is refused', async () => {
    expect((await request(app).post(approveUrl).send({})).status).toBe(401);
  });

  it('claims the suggestion, runs the whitelisted change as the approver, records it, and audits both steps', async () => {
    const claimed = proposalDoc({ status: 'approved' });
    AgentProposal.findOneAndUpdate
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce({ ...claimed, status: 'executed', result: { ok: true, message: 'Alert status changed to "investigating".', resourceId: A1 } });
    Alert.findOneAndUpdate.mockResolvedValue({ _id: A1 });
    const res = await request(app).post(approveUrl).set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.proposal.status).toBe('executed');
    expect(res.body.data.result.ok).toBe(true);
    // the claim is atomic and only matches a still-pending, unexpired suggestion that belongs to the approver
    expect(AgentProposal.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ _id: PID, owner: 'u1', status: 'pending' });
    expect(AgentProposal.findOneAndUpdate.mock.calls[0][0].expiresAt).toBeDefined();
    // the change itself states what it expects and stays inside the approver's own data
    expect(Alert.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ _id: A1, status: 'new', createdBy: 'u1' });
    expect(Alert.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { status: 'investigating' } });
    expect(audit.log.mock.calls.map(([e]) => e.action)).toEqual(['agent.approved', 'agent.executed']);
  });

  it('creates an incident as the approver when every linked alert is still visible', async () => {
    const params = { title: 'Review 3 DoS alerts from f.csv', severity: 'critical', alertIds: [A1, 'b'.repeat(24), 'e'.repeat(24)] };
    const claimed = proposalDoc({ action: 'create_incident', params, status: 'approved' });
    AgentProposal.findOneAndUpdate.mockResolvedValueOnce(claimed).mockResolvedValueOnce({ ...claimed, status: 'executed', result: { ok: true, message: 'Incident created.' } });
    Alert.countDocuments.mockResolvedValue(3);
    Incident.create.mockResolvedValue({ _id: 'f'.repeat(24) });
    const res = await request(app).post(approveUrl).set(auth).send({});
    expect(res.body.data.result).toMatchObject({ ok: true, resourceId: 'f'.repeat(24) });
    expect(Incident.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 'u1', alerts: params.alertIds, severity: 'critical' }));
  });

  it('does nothing and says so when an alert disappeared or changed since the suggestion', async () => {
    const claimed = proposalDoc({ status: 'approved' });
    AgentProposal.findOneAndUpdate.mockResolvedValueOnce(claimed).mockResolvedValueOnce({ ...claimed, status: 'failed', result: { ok: false, message: 'The record changed' } });
    Alert.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app).post(approveUrl).set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.result.ok).toBe(false);
    expect(AgentProposal.findOneAndUpdate.mock.calls[1][1].$set.status).toBe('failed');
    expect(audit.log).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'agent.failed' }));
  });

  it('refuses a stored suggestion that was tampered with: unknown action or extra parameters', async () => {
    for (const bad of [{ action: 'delete_everything', params: {} }, { params: { alertId: A1, expectedStatus: 'new', newStatus: 'resolved', extra: 1 } }]) {
      jest.clearAllMocks();
      const claimed = proposalDoc({ status: 'approved', ...bad });
      AgentProposal.findOneAndUpdate.mockResolvedValueOnce(claimed).mockResolvedValueOnce({ ...claimed, status: 'failed', result: { ok: false, message: 'x' } });
      const res = await request(app).post(approveUrl).set(auth).send({});
      expect(res.body.data.result.ok).toBe(false);
      expect(Alert.findOneAndUpdate).not.toHaveBeenCalled();
      expect(Incident.create).not.toHaveBeenCalled();
    }
  });

  it('never lets an analyst change someone else\'s data, but an admin approving works in the admin\'s own scope', async () => {
    const claimed = proposalDoc({ owner: 'someone', status: 'approved' });
    AgentProposal.findOneAndUpdate.mockResolvedValue(claimed);
    Alert.findOneAndUpdate.mockResolvedValue({ _id: A1 });
    await request(app).post(approveUrl).set(loginAs(User, { role: 'admin' })).send({});
    expect(Alert.findOneAndUpdate.mock.calls[0][0].createdBy).toBeUndefined();
    expect(AgentProposal.findOneAndUpdate.mock.calls[0][0].owner).toBeUndefined();
  });

  it('answers 409 for a suggestion that was already decided, 410 when it expired, 404 when it is not yours', async () => {
    AgentProposal.findOneAndUpdate.mockResolvedValue(null);
    AgentProposal.findOne.mockReturnValue(chain(proposalDoc({ status: 'executed' })));
    expect((await request(app).post(approveUrl).set(auth).send({})).status).toBe(409);
    AgentProposal.findOne.mockReturnValue(chain(proposalDoc({ expiresAt: new Date(Date.now() - 1000) })));
    expect((await request(app).post(approveUrl).set(auth).send({})).status).toBe(410);
    AgentProposal.findOne.mockReturnValue(chain(null));
    expect((await request(app).post(approveUrl).set(auth).send({})).status).toBe(404);
    expect((await request(app).post('/api/agent/proposals/not-an-id/approve').set(auth).send({})).status).toBe(404);
    expect(Alert.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('cannot be approved twice: the second claim finds nothing pending', async () => {
    AgentProposal.findOneAndUpdate.mockResolvedValue(null);
    AgentProposal.findOne.mockReturnValue(chain(proposalDoc({ status: 'approved' })));
    const res = await request(app).post(approveUrl).set(auth).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already approved/);
  });

  it('refuses a body: the client cannot choose what runs', async () => {
    const res = await request(app).post(approveUrl).set(auth).send({ action: 'create_incident', params: { title: 'x' } });
    expect(res.status).toBe(400);
    expect(AgentProposal.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does nothing when the agent is turned off', async () => {
    config.agentEnabled = false;
    expect((await request(app).post(approveUrl).set(auth).send({})).status).toBe(503);
    expect(AgentProposal.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /api/agent/proposals/:id/reject', () => {
  const rejectUrl = `/api/agent/proposals/${PID}/reject`;

  it('rejects a pending suggestion, runs nothing, and keeps the reason text out of the audit log', async () => {
    AgentProposal.findOneAndUpdate.mockResolvedValue(proposalDoc({ status: 'rejected', decisionReason: 'not relevant' }));
    const res = await request(app).post(rejectUrl).set(auth).send({ reason: 'not relevant' });
    expect(res.status).toBe(200);
    expect(res.body.data.proposal).toMatchObject({ status: 'rejected', decisionReason: 'not relevant' });
    expect(Alert.findOneAndUpdate).not.toHaveBeenCalled();
    expect(JSON.stringify(audit.log.mock.calls).includes('not relevant')).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'agent.rejected', metadata: expect.objectContaining({ hasReason: true }) }));
  });

  it('works without a reason, refuses a decided one, and limits the reason length', async () => {
    AgentProposal.findOneAndUpdate.mockResolvedValue(null);
    AgentProposal.findOne.mockReturnValue(chain(proposalDoc({ status: 'rejected' })));
    expect((await request(app).post(rejectUrl).set(auth).send({})).status).toBe(409);
    expect((await request(app).post(rejectUrl).set(auth).send({ reason: 'x'.repeat(301) })).status).toBe(400);
    expect((await request(app).post(rejectUrl).set(auth).send({ action: 'x' })).status).toBe(400);
  });
});

describe('GET /api/agent/status', () => {
  it('lists the three allowed actions and says no language model is involved', async () => {
    const res = await request(app).get('/api/agent/status').set(auth);
    expect(res.body.data).toMatchObject({ enabled: true, usesLanguageModel: false });
    expect(res.body.data.actions.map((a) => a.name)).toEqual(['create_incident', 'set_alert_status', 'set_incident_status']);
  });
});
