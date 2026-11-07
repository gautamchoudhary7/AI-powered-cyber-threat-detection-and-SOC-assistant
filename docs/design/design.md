# Design Document

**Project:** AI-Powered Cyber Threat Detection and SOC Assistant
**Version:** 0.1 (Phase 11). Describes the code as written; items marked **not run** have never been executed together.

---

## 1. Architecture

```
 Browser (React, :5173)
        |  HTTPS/JSON, Bearer token
        v
 Backend API (Express, :5000) ---- MongoDB
        |                  \
        | JSON               \  JSON + x-internal-key
        v                     v
 ML service (FastAPI, :8000)   AI service (FastAPI, :8001) ---> Google Gemini API (optional)
   model .joblib + metrics       knowledge/*.md -> chunks -> BM25 or ChromaDB
```

Design rules that shape everything else:
1. **The browser never talks to the Python services.** Only the backend does, so authentication, scoping and audit
   logging are in one place.
2. **The backend decides what data the services see.** The browser sends an alert or incident id; the backend loads
   the record scoped to the user.
3. **Honest failure.** If a dependency is missing the API returns 503 or 502 with a plain message. No fake results.
4. **Humans decide.** The agent only stores suggestions; approval is a separate request by a person.

## 2. Components

### 2.1 Frontend (`frontend/src`)
- `api/client.js`: one Axios instance, token attached from storage, helper per endpoint.
- `auth/`: context holding the user and token; a protected-route wrapper.
- `pages/`: Login, Register, Dashboard, Upload, Alerts, AlertDetail, Incidents, IncidentDetail, Reports,
  ReportDetail, Job (analysis progress), Settings, Assistant, Agent (labelled "Suggestions"), Status.
- `components/`: shared UI (`ui.jsx`), `AssistantPanel`, `GenerateReportButton`.
- `utils/`: formatting and file-download helpers.
- Everything from the server is rendered as React text. There is no `dangerouslySetInnerHTML`.

### 2.2 Backend (`backend/src`)
Layers: `routes` (URL and middleware order) -> `validators` (zod, strict) -> `controllers` -> `services`/`utils`
-> `models`.
Middleware order in `app.js`: helmet, CORS (single origin), JSON body limit 100 KB, request sanitiser (rejects
`$`-operators and dotted keys in body, query and params), global rate limit, then per-route limiters (auth, upload,
assistant, agent) and `authenticate`.

Key services:
- `detectionService`: reads the CSV in a stream, sends batches of 500 rows to the ML service, writes alerts, updates
  the job, deletes the file. Limits: 20 MB, 50,000 rows.
- `mlClient`: Axios wrapper that converts failures into typed errors (`unreachable`, `not_configured`,
  `invalid_records`, `too_many_records`).
- `aiClient`: same for the AI service, and adds the shared secret header.
- `agentExecutor`: runs one approved action (see 5).
- `auditService`: writes audit entries; failure to write never breaks the request.

### 2.3 ML service (`ml-service/app`)
- `ml/inspect_dataset.py`: reports real columns, types, missing values, label distribution. Run first.
- `ml/schema.py`, `preprocessing.py`: the schema (numeric and categorical column lists) is **derived from the data**
  and saved with the model. Missing numeric values are imputed, numeric columns scaled, categorical columns
  one-hot encoded with unknown values ignored.
- `ml/train.py`: stratified fit/validation split; candidates logreg, random forest, XGBoost (optional); picks the
  best on validation; refits on all training rows; evaluates once on the testing file; writes model and metrics.
- `ml/predictor.py`: validates records (missing columns, non-numeric values), returns label, attack score and model
  version per record.
- `registry.py`: finds the saved model; if none, endpoints report "no trained model".
- Endpoints: `/health`, `/model/info`, `/predict` (max 5,000 records).

### 2.4 AI service (`ai-service/app`)
- `rag/documents.py`: parses Markdown with required front matter (title, publisher, url, optionally others).
  A document without them is rejected so every answer can name its source.
- `rag/chunker.py`: <= 1,200 characters, 150 overlap, headings start a new chunk.
- `rag/stores.py`: `KeywordStore` (BM25, no install) and `ChromaStore` (cosine similarity, imported lazily).
- `rag/retriever.py`: top-k with a minimum score; empty result is a valid "no match".
- `assistant/prompt.py`: builds the prompt. Passages are numbered [S1]...; case data (alert fields) is wrapped in
  tags and tag characters are neutralised; the instruction says the tagged data is data, not instructions.
- `assistant/answer.py`: calls the model, validates citations (keeps only labels that exist), marks which sources
  were cited, adds notes when the answer is partial.
- `assistant/llm.py`: Gemini REST client on Python's standard `urllib`; timeouts; errors mapped to short messages.
- `security.py`: constant-time comparison of `x-internal-key`; refuses all assistant routes if the key is unset.

## 3. Data model (MongoDB)

| Collection | Main fields | Notes |
|---|---|---|
| users | name, email (unique, lower-case), passwordHash, role (analyst/admin), passwordChangedAt | role never accepted from clients |
| detectionjobs | owner, originalFileName, sizeBytes, status, processedRows, totalRows, attackCount, normalCount, categoryCounts, modelVersion, warnings, errorMessage, timestamps | |
| alerts | owner/createdBy, jobId, rowIndex, record (feature values), label, confidence (attack score), attackCategory, severity, status, sourceFileName, modelVersion | indexed for list filters |
| incidents | title, description, severity, status, alerts[], notes[], createdBy | notes embedded; alert links <= 100 |
| reports | type, title, content (Markdown), source ids, createdBy | content built on the server only |
| agentproposals | owner, action, params, summary, rationale, ruleId, evidence, status, dedupeKey, expiresAt, result | unique (owner, dedupeKey) |
| auditlogs | actor, action, resourceType, resourceId, ip, metadata, createdAt | no question text, no passwords |

## 4. Key flows

### 4.1 Upload to alert
1. Browser POSTs the CSV (multipart, field `file`) with the token.
2. Backend checks size and type, asks the ML service for the model's columns, reads only the CSV header, and rejects
   with a precise list if columns are missing/duplicated.
3. A job (`queued`) is created, audit entry written, response `202` with the job.
4. In the background: batches of 500 rows -> `/predict` -> alerts saved for rows predicted as attacks, severity from
   the score bands -> job `completed` (or `failed` with a message). The file is deleted.
5. Browser polls `GET /detection/jobs/:id`, then opens Alerts.

### 4.2 Assistant question
1. Browser sends question and optionally `alertId` or `incidentId` (and `includeRowValues` only with an alert).
2. Backend validates, loads the record in the user's scope, builds a **minimal** context (see 6), calls the AI
   service with the shared secret.
3. AI service retrieves passages, builds the prompt, calls Gemini if configured, validates citations.
4. Response contains answer (if generated), sources, notes, and whether row values were sent. The audit entry records
   metadata but not the question text.

### 4.3 Agent suggestion and approval
1. `POST /agent/scan`: backend loads up to 2,000 recent alerts and 200 incidents in the user's scope, runs the pure
   rules, stores new suggestions (skipping duplicates by key). No data is changed.
2. A person reviews each suggestion's reason and evidence on the Suggestions page.
3. `POST /agent/proposals/:id/approve`: atomically claim a pending, unexpired suggestion; re-validate the action;
   run it as the approver in the approver's scope with an expected-status check; record result and audit entry.
4. `reject` records the decision with an optional reason.

## 5. Agent design
Rules (in `agentRules.js`, pure functions):
1. **group_high_severity**: three or more alerts with status `new` and severity high/critical, same job and same
   predicted category -> suggest creating one incident linking up to 50 of them.
2. **triage_critical**: a critical alert still `new` and not already grouped -> suggest status `investigating`.
3. **contain_when_alerts_done**: an open/investigating incident whose alerts are all resolved or false positive ->
   suggest `contained`. (Closing is left to a person.)

Whitelist (in `agentActions.js`): `create_incident`, `set_alert_status`, `set_incident_status`. Parameters are validated
by hand-written checks that reject unknown keys, non-object input and prototype-pollution keys.

Why not let a language model choose actions? Alert text and CSV values are attacker-influenced, and a model can be
manipulated by instructions hidden in them (prompt injection, OWASP LLM01). Fixed rules are easier to audit. The OWASP
guidance on least privilege, constrained behaviour and human approval for high-risk actions is followed in spirit.

Limits: 25 suggestions per scan, 20 single-alert suggestions, 7-day expiry, kill switch `AGENT_ENABLED`.

## 6. Security design

| Threat | Control | Where |
|---|---|---|
| Stolen or guessed password | bcrypt hashes, 10+ character passwords, login rate limit, generic login errors | authService, app.js |
| Token misuse | HS256 JWT, 1 h expiry, role re-read per request, revoke on password change | middleware/auth |
| Privilege escalation | role not accepted on register; admin only via server script | authSchemas, scripts/setRole.js |
| IDOR (reading others' data) | every query scoped by owner/createdBy; 404 instead of 403 | controllers |
| NoSQL injection | sanitiser + strict zod + Mongoose `sanitizeFilter` | middleware/sanitize, app |
| Mass assignment | `.strict()` schemas, controllers copy named fields | validators |
| CSV formula injection | cells starting with `= + - @` are prefixed | detectionHelpers.escapeCsvCell |
| Malicious upload | size/row limits, header check, file deleted after use, name sanitised | middleware/upload, detectionService |
| XSS | React text rendering; reports downloaded as `.md` text | frontend |
| Prompt injection | tagged and neutralised data; no tool use by the model; agent not model-driven; human approval | prompt.py, agentRules |
| Leaking data to a third party | row values off by default, double switch; notes never sent; UI warning | assistantContext |
| Hallucinated sources | citation validation; "no match" path; passages must have front matter | answer.py |
| Abuse of expensive routes | per-route rate limits | app.js |
| Unauthorised service calls | `x-internal-key` constant-time check | ai-service security.py |
| Secrets in git | `.env.example` only; server refuses weak JWT secret | config.js, .gitignore |

Residual risks are listed in the SRS, section 7. A final security pass is planned for Phase 12.

## 7. Testing strategy
| Level | Tools | Status |
|---|---|---|
| Python unit/integration | pytest | ai-service and ml-service suites run in the sandbox except tests needing FastAPI |
| Backend API | Jest + Supertest with the Mongoose models and outside services **mocked**. These tests check routes, validation, status codes and the logic around the database, but **not real MongoDB queries** (indexes, filters, owner scoping inside queries) | written, **not run** |
| Frontend | Vitest + Testing Library with a mocked API module | written, **not run** |
| Pure logic in the backend | stand-in runner in the sandbox | helpers, report builder, assistant context, agent rules **run** |
| End to end | `tests/e2e/smoke.mjs` against a running stack | written, **not run** |
| Manual | two-account access check, kill-switch check, upload of a wrong-columns CSV | to be done by the team |

Mutation checks were made by hand on the agent rules (three deliberate bugs were caught by the tests).

## 8. Design decisions and alternatives
| Decision | Why | Alternative not chosen |
|---|---|---|
| Express + MongoDB | Common in student stacks, simple to explain | SQL database |
| Separate Python services | Data science libraries live in Python | Port models to Node |
| BM25 default, Chroma optional | Works with no install; Chroma adds semantic search | Chroma only |
| Rule-based agent | Safe against injection, auditable | LLM agent with tools |
| Severity from score bands | Simple, explainable, honest label | Per-class costs, calibrated probabilities (future work) |
| Background job in the web process | Simple | Queue (BullMQ) with a worker |
| Gemini API | The user chose it | Local model |

## 9. Future work
Calibrate scores and thresholds on validation data; add a job queue; add official NIST/CISA/MITRE passages;
evaluate retrieval with a labelled question set and tune `RAG_MIN_SCORE`; add refresh tokens or cookies if the
product needs longer sessions; add accessibility and load testing.
