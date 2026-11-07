#!/usr/bin/env node
// End-to-end smoke test for a RUNNING stack (MongoDB + ml-service + backend, optionally ai-service).
//
// STATUS: written but NEVER RUN by the author (the build sandbox had no MongoDB, FastAPI or npm access).
// Treat the first run as the real test of this script itself. If a step fails, the cause may be the
// script, not the application - read the message and the response body it prints.
//
// What it checks: the chain register -> login -> upload CSV -> background analysis -> alerts -> incident
// -> report -> assistant -> agent suggestion -> approval. It checks that the PLUMBING works.
// It does NOT measure detection quality. Synthetic rows (the default) say nothing about accuracy.
//
// Usage (Node 18 or newer, no extra packages):
//   node tests/e2e/smoke.mjs                       # uses the built-in synthetic CSV
//   node tests/e2e/smoke.mjs --csv path/to/file.csv  # a real file with the model's columns
// Environment: API_URL (default http://localhost:5000), ML_URL (default http://localhost:8000)
//
// It creates a throw-away user (random email) and leaves its data in the database. Use a development
// database, never a production one.

import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const API = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
const ML = (process.env.ML_URL || 'http://localhost:8000').replace(/\/$/, '');
const csvArgIndex = process.argv.indexOf('--csv');
const csvPath = csvArgIndex > -1 ? process.argv[csvArgIndex + 1] : null;

const results = [];
let token = '';

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const mark = { PASS: 'PASS', FAIL: 'FAIL', SKIP: 'SKIP' }[status];
  console.log(`[${mark}] ${name}${detail ? ` - ${detail}` : ''}`);
}

class StepFailed extends Error {}

async function call(method, path, { body, form, auth = true, base = API } = {}) {
  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: payload });
  } catch (err) {
    throw new StepFailed(`cannot reach ${base}${path} (${err.cause?.code || err.message})`);
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

// Runs one step. A thrown error marks it FAIL and stops the steps that depend on it.
async function step(name, fn, { required = true } = {}) {
  try {
    const detail = await fn();
    if (detail && detail.skip) record(name, 'SKIP', detail.skip);
    else record(name, 'PASS', typeof detail === 'string' ? detail : '');
    return detail;
  } catch (err) {
    record(name, 'FAIL', err.message);
    if (required) throw new StepFailed('stopping: a required step failed');
    return null;
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

function explain(res) {
  return `HTTP ${res.status} ${res.text.slice(0, 300)}`;
}

// Builds a CSV with exactly the columns the model was trained on. Values are synthetic placeholders:
// numbers vary a little so rows differ; categorical columns get "-". This is plumbing, not realism.
function syntheticCsv(numeric, categorical, rows = 12) {
  const header = [...numeric, ...categorical].join(',');
  const lines = [];
  for (let r = 0; r < rows; r += 1) {
    const nums = numeric.map((_, i) => ((r + 1) * (i + 3)) % 17);
    lines.push([...nums, ...categorical.map(() => '-')].join(','));
  }
  return `${header}\n${lines.join('\n')}\n`;
}

async function main() {
  const email = `smoke-${randomBytes(4).toString('hex')}@example.com`;
  const password = `Smoke-${randomBytes(6).toString('hex')}9`;
  let schema = null;
  let jobId = null;
  let alertId = null;
  let incidentId = null;

  await step('backend health', async () => {
    const r = await call('GET', '/api/health', { auth: false });
    expect(r.status === 200, explain(r));
  });

  await step('ml-service health (direct)', async () => {
    const r = await call('GET', '/health', { auth: false, base: ML });
    expect(r.status === 200, explain(r));
  });

  await step('trained model is available', async () => {
    const r = await call('GET', '/model/info', { auth: false, base: ML });
    expect(r.status === 200, `no trained model? ${explain(r)}`);
    const s = r.json?.detector?.schema;
    expect(s && Array.isArray(s.numeric) && Array.isArray(s.categorical), 'model info has no schema');
    schema = s;
    return `${s.numeric.length} numeric + ${s.categorical.length} categorical columns, version ${r.json.detector.model_version}`;
  });

  await step('register', async () => {
    const r = await call('POST', '/api/auth/register', { auth: false, body: { name: 'Smoke Tester', email, password } });
    expect(r.status === 201, explain(r));
    expect(r.json?.data?.user?.role === 'analyst', 'new user should be an analyst');
  });

  await step('register cannot choose a role', async () => {
    const r = await call('POST', '/api/auth/register', {
      auth: false, body: { name: 'Sneaky', email: `x-${email}`, password, role: 'admin' },
    });
    expect(r.status === 400, `expected 400, got ${explain(r)}`);
  });

  await step('login', async () => {
    const r = await call('POST', '/api/auth/login', { auth: false, body: { email, password } });
    expect(r.status === 200, explain(r));
    token = r.json?.data?.token;
    expect(typeof token === 'string' && token.length > 20, 'no token returned');
  });

  await step('protected route rejects no token', async () => {
    const r = await call('GET', '/api/alerts', { auth: false });
    expect(r.status === 401, `expected 401, got ${explain(r)}`);
  });

  await step('upload CSV', async () => {
    const text = csvPath ? await readFile(csvPath, 'utf8') : syntheticCsv(schema.numeric, schema.categorical);
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/csv' }), 'smoke.csv');
    const r = await call('POST', '/api/detection/upload', { form });
    expect(r.status === 202, explain(r));
    jobId = r.json?.data?.job?.id;
    expect(jobId, 'no job id');
    return `job ${jobId}${csvPath ? ` from ${csvPath}` : ' (synthetic rows)'}`;
  });

  let job = null;
  await step('analysis completes', async () => {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const r = await call('GET', `/api/detection/jobs/${jobId}`);
      expect(r.status === 200, explain(r));
      job = r.json.data.job;
      if (job.status === 'completed') return `${job.totalRows} rows, ${job.attackCount} flagged`;
      if (job.status === 'failed') throw new Error(`job failed: ${job.errorMessage}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error('timed out after 120 s');
  });

  await step('flagged-rows CSV downloads', async () => {
    const r = await call('GET', `/api/detection/jobs/${jobId}/report.csv`);
    expect(r.status === 200, explain(r));
    expect(r.text.startsWith('csv_line,'), 'unexpected CSV header');
  });

  await step('dashboard stats respond', async () => {
    const r = await call('GET', '/api/dashboard/stats');
    expect(r.status === 200, explain(r));
  });

  await step('alerts list', async () => {
    const r = await call('GET', '/api/alerts?limit=50');
    expect(r.status === 200, explain(r));
    const items = r.json.data;
    if (items.length === 0) return { skip: 'the file produced no alerts (use --csv with real attack rows to test the rest)' };
    alertId = items[0].id;
    return `${items.length} alert(s) on this page`;
  });

  if (alertId) {
    await step('alert status can change', async () => {
      const r = await call('PATCH', `/api/alerts/${alertId}/status`, { body: { status: 'investigating' } });
      expect(r.status === 200, explain(r));
    });

    await step('incident created from alert', async () => {
      const r = await call('POST', '/api/incidents', { body: { title: 'Smoke test incident', severity: 'medium', alertIds: [alertId] } });
      expect(r.status === 201, explain(r));
      incidentId = r.json?.data?.incident?.id;
      expect(incidentId, 'no incident id');
    });

    await step('incident note added', async () => {
      const r = await call('POST', `/api/incidents/${incidentId}/notes`, { body: { text: 'Smoke test note' } });
      expect(r.status === 201, explain(r));
    });

    await step('incident report generated', async () => {
      const r = await call('POST', '/api/reports', { body: { type: 'incident', incidentId } });
      expect(r.status === 201, explain(r));
    });
  } else {
    record('incident + report steps', 'SKIP', 'no alert available');
  }

  await step('detection summary report generated', async () => {
    const r = await call('POST', '/api/reports', { body: { type: 'detection_summary', jobId } });
    expect(r.status === 201, explain(r));
  });

  await step('assistant status', async () => {
    const r = await call('GET', '/api/assistant/status');
    expect(r.status === 200, explain(r));
    const d = r.json.data;
    if (!d.reachable) return { skip: 'ai-service is not running (assistant steps skipped)' };
    return `reachable, language model ${d.llmConfigured ? 'configured' : 'NOT configured (passages only)'}`;
  }, { required: false });

  const status = results.at(-1);
  if (status.status === 'PASS') {
    await step('assistant answers a general question', async () => {
      const r = await call('POST', '/api/assistant/ask', { body: { question: 'What are the usual first steps when handling a security incident?' } });
      expect(r.status === 200, explain(r));
      expect(Array.isArray(r.json.data.sources), 'no sources array');
      return `${r.json.data.sources.length} source passage(s); generated=${r.json.data.generated}`;
    }, { required: false });
  } else {
    record('assistant answers a general question', 'SKIP', 'assistant not reachable');
  }

  await step('agent scan', async () => {
    const r = await call('GET', '/api/agent/status');
    expect(r.status === 200, explain(r));
    if (!r.json.data.enabled) return { skip: 'agent is disabled (AGENT_ENABLED=false)' };
    const s = await call('POST', '/api/agent/scan', { body: {} });
    expect(s.status === 200, explain(s));
    const proposals = s.json.data.proposals;
    if (proposals.length === 0) return { skip: 'no suggestions (rules need critical/high alerts that are still "new")' };
    const target = proposals[0];
    const a = await call('POST', `/api/agent/proposals/${target.id}/approve`, { body: {} });
    expect(a.status === 200, explain(a));
    expect(a.json.data.proposal.status === 'executed', `expected executed, got ${a.json.data.proposal.status}`);
    return `approved and executed: ${target.actionLabel}`;
  }, { required: false });

  await step('account password change', async () => {
    const next = `${password}x`;
    const r = await call('POST', '/api/users/me/password', { body: { currentPassword: password, newPassword: next } });
    expect(r.status === 200, explain(r));
    token = r.json?.data?.token || token;
  }, { required: false });
}

try {
  await main();
} catch (err) {
  if (!(err instanceof StepFailed)) record('script error', 'FAIL', err.stack || err.message);
}

const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\nSummary: ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped.`);
console.log('SKIP is not a pass: it means that part was NOT tested.');
process.exit(count('FAIL') > 0 ? 1 : 0);
