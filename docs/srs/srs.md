# Software Requirements Specification (SRS)

**Project:** AI-Powered Cyber Threat Detection and SOC Assistant
**Team:** [fill in: team member names and roll numbers]
**Guide:** [fill in] **Institution:** [fill in]
**Document version:** 0.1 (written at the end of Phase 11)

> **How to read the status columns.** "Written" means the code exists and was reviewed. "Test written" means
> a test exists. Neither means the test has been run in a real environment. The build sandbox had no npm,
> PyPI, MongoDB or UNSW-NB15 data, so most automated suites have **not been run** (see section 9). Nothing in
> this document is a measured result unless it says so and names where the number came from.

---

## 1. Introduction

### 1.1 Purpose
This document states what the system must do and the limits it works within. It is meant for the project team,
the guide and the examiners.

### 1.2 Scope
A web application where a security analyst uploads a CSV of network flow records, a trained machine-learning
model flags suspicious rows, the flags become **alerts**, and the analyst triages them, groups them into
**incidents**, generates **reports**, asks a documentation-grounded **assistant** questions, and reviews
**suggestions** from a rule-based agent that can act only after a person approves.

Out of scope: capturing live traffic, blocking or isolating anything on a network, integration with a real SIEM,
multi-tenant organisations, email delivery, and any claim of production-grade detection accuracy.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Flow record | One row of the CSV: summary features of one network connection. |
| Alert | A flow record the detector predicted as an attack, stored with an attack score and a severity. |
| Attack score | The model's output for the attack class. It is **not** a calibrated probability. |
| Severity | A project rule applied to the attack score: 0.70 medium, 0.85 high, 0.95 critical, otherwise low. The thresholds were chosen by the team and are **not calibrated**. |
| Incident | A case record the analyst creates, optionally linking alerts, with notes and a status. |
| Suggestion (proposal) | An action the agent proposes. Nothing changes until a person approves it. |
| RAG | Retrieval-augmented generation: passages are retrieved from reference documents and given to a language model with the question. |

### 1.4 References
See `docs/research/research.md` for the full list with links. Key ones: UNSW-NB15 dataset page (UNSW Canberra);
Moustafa and Slay, "UNSW-NB15: a comprehensive data set for network intrusion detection systems", MilCIS 2015;
OWASP Top 10 for LLM Applications 2025, LLM01 Prompt Injection.

---

## 2. Overall description

### 2.1 Product perspective
Four cooperating programs (details in `docs/design/design.md`):

1. **frontend** - React single-page app (port 5173 in development).
2. **backend** - Express API with MongoDB; the only component the browser talks to (port 5000).
3. **ml-service** - FastAPI service that loads the trained model and answers `/predict` (port 8000).
4. **ai-service** - FastAPI service for knowledge retrieval and the assistant (port 8001).

### 2.2 Users
| Role | Rights |
|---|---|
| analyst (default for everyone who registers) | Works only on their own jobs, alerts, incidents, reports and suggestions. |
| admin (granted only on the server with `npm run set-role`) | Can read and act on all users' data. Cannot be obtained through the API. |

### 2.3 Operating environment
Node 18 or newer, Python 3.10 or newer (the version actually used in tests was the sandbox's Python; the team
should record theirs), MongoDB, a modern browser. Optional: a Google Gemini API key for written assistant answers.

### 2.4 Constraints and assumptions
- The detector is only as good as its training data. UNSW-NB15 is a 2015 lab-generated data set; its authors
  note that some attack records mimic normal traffic. Results on it do not transfer to a real network without
  testing on that network's traffic.
- The data set is free for academic use; commercial use needs the authors' agreement. Users are asked to cite
  the authors' papers.
- The team is three students working part-time, so features were ordered: working CSV-to-alert workflow first,
  advanced AI features afterwards.

---

## 3. Functional requirements

Status values: **W** = written (code exists), **T** = test written, **R** = test actually run in the sandbox
(only for pure-logic tests that did not need npm/PyPI-installed frameworks), **-** = none.
"Test files" are under `backend/tests`, `frontend/src`, `ml-service/tests` or `ai-service/tests`.

### 3.1 Accounts and access
| ID | Requirement | Code | Test files | Status |
|---|---|---|---|---|
| FR-AUTH-1 | A person can register with name, email and a password of 10-72 characters containing a letter and a number. | `authController`, `authSchemas` | `auth.test.js` | W, T |
| FR-AUTH-2 | Registration always creates an analyst; a request that includes `role` is rejected. | `registerSchema.strict()` | `auth.test.js`, `tests/e2e/smoke.mjs` | W, T |
| FR-AUTH-3 | Passwords are stored only as bcrypt hashes (12 rounds by default, allowed range 10-15). | `authService`, `config` | `auth.test.js`, `models.test.js` | W, T |
| FR-AUTH-4 | Login returns a JWT valid for 1 hour; every protected route rejects a missing, invalid or expired token. | `middleware/auth` | `auth.test.js` | W, T |
| FR-AUTH-5 | A user's role is read from the database on every request, so a role change or deletion takes effect immediately. | `middleware/auth` | `auth.test.js` | W, T |
| FR-AUTH-6 | After a password change, tokens issued before the change are rejected. | `User.passwordChangedAt`, `middleware/auth` | `users.test.js` | W, T |
| FR-AUTH-7 | Login and register are rate limited more strictly than the rest of the API. | `app.js` | `auth.test.js` | W, T |
| FR-AUTH-8 | Users can update their name and change their password (current password required). | `userController` | `users.test.js`, `SettingsPage.test.jsx` | W, T |

### 3.2 Detection workflow
| ID | Requirement | Code | Test files | Status |
|---|---|---|---|---|
| FR-DET-1 | Accept one CSV upload (max 20 MB, max 50,000 rows) in the field `file`. | `middleware/upload`, `detectionService` | `detection.test.js`, `detectionService.test.js` | W, T |
| FR-DET-2 | Before accepting, compare the CSV header with the columns the **trained model** declares. If columns are missing, duplicated or unnamed, reject with the list. Extra columns are ignored and counted. | `detectionController`, `detectionHelpers` | `detectionHelpers.test.js` (run, 15 pass), `detection.test.js` | W, T, R (helpers) |
| FR-DET-3 | Analyse in the background in batches of 500 rows; the client polls job status (queued, processing, completed, failed). | `detectionService` | `detectionService.test.js` | W, T |
| FR-DET-4 | If the ML service is unreachable or has no trained model, say so with HTTP 503. **Never** return fabricated predictions. | `detectionController.mlToHttp` | `detection.test.js`, `ml-service/tests/test_api.py` | W, T |
| FR-DET-5 | Each row predicted as an attack becomes an alert holding the row's values, score, category (if a category model exists), severity, and the CSV line it came from. | `detectionService`, `Alert` model | `detectionService.test.js` | W, T |
| FR-DET-6 | Severity is derived from the score by the fixed bands in 1.3. | `detectionHelpers.severityFromScore` | `detectionHelpers.test.js` | W, T, R |
| FR-DET-7 | Download the flagged rows of a completed job as a CSV that is safe to open in a spreadsheet (cells starting with `= + - @` are neutralised). | `detectionController.downloadReport`, `escapeCsvCell` | `detectionHelpers.test.js`, `detection.test.js` | W, T, R (helper) |
| FR-DET-8 | A user can open only their own jobs (others get 404); admin can open any. | `detectionController.canAccess` | `detection.test.js` | W, T |
| FR-DET-9 | The uploaded file is deleted from disk after processing or after a rejected upload. | `detectionController`, `detectionService` | `detection.test.js` | W, T |

### 3.3 Alerts, dashboard, incidents
| ID | Requirement | Code | Test files | Status |
|---|---|---|---|---|
| FR-ALR-1 | List alerts with paging (limit up to 100), filters (severity, status, category, job) and sorting; owner-scoped. | `alertController` | `alerts.test.js`, `AlertsPage.test.jsx` | W, T |
| FR-ALR-2 | Alert status can be new, investigating, resolved or false_positive; changes are audit logged. | `alertController` | `alerts.test.js` | W, T |
| FR-DSH-1 | Dashboard shows counts by severity, status and category and a trend over time, computed from stored alerts only. | `dashboardController`, `dashboardHelpers` | `dashboard.test.js`, `dashboardHelpers.test.js` (run, 8 pass), `DashboardPage.test.jsx` | W, T, R (helpers) |
| FR-INC-1 | Create, list, view and update incidents (title 3-200 characters, severity, status); link up to 100 of one's own alerts. | `incidentController` | `incidents.test.js`, `Incidents.test.jsx` | W, T |
| FR-INC-2 | Add notes (1-5000 characters) to an incident; notes are shown as plain text. | `incidentController` | `incidents.test.js`, `Incidents.test.jsx` | W, T |

### 3.4 Reports and settings
| ID | Requirement | Code | Test files | Status |
|---|---|---|---|---|
| FR-REP-1 | Generate a Markdown report for a detection job or an incident. The server builds the text from stored data; the client sends only the type and an id (and optional title). | `reportController`, `reportSchemas` | `reports.test.js` | W, T |
| FR-REP-2 | Report text escapes user-supplied values (table cells and quoted text) and is capped at 90,000 characters. | `reportBuilder` | `reportBuilder.test.js` (run, 18 pass) | W, T, R |
| FR-REP-3 | Reports state that severity is a rule on a model score and that predictions can be wrong. | `reportBuilder` | `reportBuilder.test.js` | W, T, R |
| FR-REP-4 | Reports can be listed, opened and downloaded as a `.md` file. | `reportController`, `download.js` | `reports.test.js`, `Reports.test.jsx`, `download.test.js` (run) | W, T, R (download helper) |

### 3.5 Machine-learning service
| ID | Requirement | Code | Test files | Status |
|---|---|---|---|---|
| FR-ML-1 | A data-inspection script reports the real columns, types, missing values and label distribution of a CSV before any training. | `app/ml/inspect_dataset.py` | `test_inspect_dataset.py` | W, T, R |
| FR-ML-2 | Training compares logistic regression, random forest and (if installed) XGBoost on a stratified validation split; preprocessing is fitted inside the pipeline so validation data does not leak. | `app/ml/train.py`, `preprocessing.py` | `test_training.py`, `test_preprocessing.py` | W, T, R |
| FR-ML-3 | Training writes every measured metric (precision, recall, F1, ROC-AUC, confusion matrix) next to the model; the service reports them and never invents them. | `train.py`, `metrics.py` | `test_metrics.py`, `test_training.py` | W, T, R |
| FR-ML-4 | `/predict` accepts at most 5,000 records, rejects missing columns and non-numeric values with clear errors, and returns model version with each result. | `main.py`, `predictor.py` | `test_predictor.py` (run), `test_api.py` (needs fastapi) | W, T, R (predictor) |
| FR-ML-5 | If no trained model exists, `/health` and `/predict` say so; nothing is faked. | `registry.py`, `main.py` | `test_health.py`, `test_api.py` | W, T |

### 3.6 Assistant (RAG)
| ID | Requirement | Code | Test files | Status |
|---|---|---|---|---|
| FR-AST-1 | Reference documents need front matter (title, publisher, url that is http(s) or "local"); documents without it are rejected at indexing. | `ai-service/app/rag/documents.py` | `test_documents.py` | W, T, R |
| FR-AST-2 | Documents are cut into chunks of at most 1,200 characters with 150 overlap; headings force a new chunk. | `rag/chunker.py` | `test_chunker.py` | W, T, R |
| FR-AST-3 | Retrieval works with a keyword (BM25) store with no extra install, and with ChromaDB when installed. A question with no matching passage returns "no match", not a guess. | `rag/stores.py`, `retriever.py` | `test_retrieval.py` | W, T, R (keyword store); **ChromaDB path never run** |
| FR-AST-4 | Answers cite passages with labels [S1], [S2]...; labels that do not exist are stripped. | `assistant/answer.py` | `test_assistant.py` | W, T, R |
| FR-AST-5 | If no language model is configured, return the matching passages only and say so. | `assistant/factory.py`, `answer.py` | `test_assistant.py` | W, T, R |
| FR-AST-6 | Untrusted text (alert fields, notes, CSV values) is placed in tagged blocks with tag-like characters neutralised, and the prompt tells the model to treat it as data. | `assistant/prompt.py` | `test_assistant.py` | W, T, R (prompt text only; **model behaviour not tested**) |
| FR-AST-7 | The backend sends only an alert or incident **id** from the browser; it loads the record itself, scoped to the user. | `assistantController`, `assistantContext` | `assistant.test.js`, `assistantContext.test.js` (run, 9 pass) | W, T, R (context) |
| FR-AST-8 | Raw row values are sent to the language model only when the server switch `ASSISTANT_ALLOW_ROW_VALUES` is on **and** the user ticks a box for that question (default off). Analyst notes are never sent. | `assistantContext`, `AssistantPanel` | `assistantContext.test.js` (run), `AssistantPanel.test.jsx` | W, T, R (context) |
| FR-AST-9 | Calls from the backend to the AI service carry a shared secret (`x-internal-key`), compared in constant time; the AI service refuses requests without it, and refuses to run at all if the configured key is a placeholder or shorter than 16 characters. | `ai-service/app/security.py`, `aiClient.js` | `test_security.py`, `aiClient.test.js` | W, T, R (python), T (js) |
| FR-AST-10 | Question text is not written to the audit log. | `assistantController` | `assistant.test.js` | W, T |
| FR-AST-11 | **General chat** mode (any topic, no reference documents, no user records, no sources) is available only on the Assistant page. Its answers are labelled "not verified", it accepts only a question (up to 1,000 characters), it can be switched off with `ASSISTANT_GENERAL_CHAT=false`, and it says so if no language model is configured instead of inventing an answer. | `ai-service/app/assistant/chat.py`, `assistantController.chatQuestion`, `AssistantPanel` | `test_assistant.py` (run), `test_api.py`, `assistant.test.js`, `aiClient.test.js`, `AssistantPanel.test.jsx` | W; T (python logic run in the workspace; the rest not run there) |

### 3.7 Controlled agent
| ID | Requirement | Code | Test files | Status |
|---|---|---|---|---|
| FR-AGT-1 | The agent's rules are fixed code, not a language model. | `utils/agentRules.js` | `agentRules.test.js` (run, 21 pass) | W, T, R |
| FR-AGT-2 | Exactly three actions exist: create an incident, change an alert's status, change an incident's status. Anything else is rejected, including extra parameters. | `utils/agentActions.js` | `agent.test.js` | W, T |
| FR-AGT-3 | A scan stores suggestions only. It changes no alert or incident. | `agentController.scan` | `agent.test.js` | W, T |
| FR-AGT-4 | Approval is an atomic claim of a pending, unexpired suggestion, so two clicks cannot run it twice. The executor re-validates and runs as the **approver**, within the approver's data scope, and refuses if the record's status changed since the suggestion was made. | `agentExecutor`, `agentController.approve` | `agent.test.js` | W, T |
| FR-AGT-5 | Suggestions expire after 7 days; the same suggestion is not created twice (dedupe key per owner). | `AgentProposal`, `agentController` | `agent.test.js` | W, T |
| FR-AGT-6 | Limits per scan: 25 suggestions, 20 single-alert suggestions, 50 alerts per grouped incident. | `agentRules.js` | `agentRules.test.js` | W, T, R |
| FR-AGT-7 | A kill switch (`AGENT_ENABLED=false`) turns the agent off server-side. | `agentController.requireEnabled` | `agent.test.js` | W, T |
| FR-AGT-8 | Scan, approve, execute, fail and reject are written to the audit log. | `agentController`, `auditService` | `agent.test.js` | W, T |
| FR-AGT-9 | The UI shows the reason for each suggestion and has separate Approve and Reject buttons. | `AgentPage.jsx` | `AgentPage.test.jsx` | W, T |

### 3.8 User interface
| ID | Requirement | Status |
|---|---|---|
| FR-UI-1 | Pages: login, register, dashboard, upload, alerts and alert detail, incidents and detail, reports and detail, settings, assistant, suggestions, system status. | W, T (component tests; **never rendered in a browser**) |
| FR-UI-2 | All server text (names, notes, assistant output) is rendered as text by React, never as HTML. | W; static check only |
| FR-UI-3 | Forms have labels, errors are announced, status changes use `aria-live`. | W; no accessibility audit has been done |

---

## 4. Non-functional requirements

| ID | Requirement | How it is met | Verification |
|---|---|---|---|
| NFR-SEC-1 | No secrets in the repository. | `.env` ignored, `.env.example` has placeholders; the server refuses to start with a missing or short `JWT_SECRET` outside tests. | A secret scan of the tree was clean (run once by the author; repeat before submission). |
| NFR-SEC-2 | Input is validated on the server with strict schemas (unknown fields rejected). | zod `.strict()` on every body | Tests written; not run. |
| NFR-SEC-3 | NoSQL operator injection is blocked. | `sanitizeRequest` plus Mongoose `sanitizeFilter` | `sanitize.test.js` written; not run. |
| NFR-SEC-4 | HTTP hardening. | `helmet`, CORS limited to `CORS_ORIGIN`, JSON body limit 100 KB, `x-powered-by` off | Not run. |
| NFR-SEC-5 | Abuse limits. | 300 requests/15 min global; stricter for auth, upload, assistant, agent; `TRUST_PROXY` so limits work per user behind a reverse proxy | Proxy-setting parser tested (`trustProxy.test.js`, run); limits themselves not run. |
| NFR-SEC-6 | Auditability. | Audit log for login, upload, status changes, report creation, assistant use (without question text), agent actions | Tests written; not run. |
| NFR-PRI-1 | Do not send sensitive data to a third party by default. | Row values off by default, notes never sent, and a visible warning about Google's free-tier terms | Logic tested (run); no real Gemini call was ever made. |
| NFR-REL-1 | Honest failure: if detection or the assistant is unavailable, the API and UI say so. | 503/502 mapping, "no model" notices | Tests written; not run. |
| NFR-PERF-1 | A 50,000-row file should finish in a reasonable time. | Batches of 500 | **Not measured.** No timing exists. |
| NFR-USE-1 | A beginner can set the system up from the README. | README quick start | **Not tested with a real beginner.** |
| NFR-MNT-1 | Code is readable and commented for students. | Plain naming, short files | Subjective. |

---

## 5. External interfaces

### 5.1 HTTP API (backend, base `/api`)
All responses are JSON `{ success, data }` or `{ success: false, error: { message, details? } }`. Except `/health` and
`/auth/register|login`, every route needs `Authorization: Bearer <token>`.

| Area | Routes |
|---|---|
| health | `GET /health`, `GET /health/ml` |
| auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| users | `PATCH /users/me`, `POST /users/me/password` |
| detection | `POST /detection/upload`, `POST /detection/predict`, `GET /detection/jobs/:id`, `GET /detection/jobs/:id/report.csv` |
| alerts | `GET /alerts`, `GET /alerts/:id`, `PATCH /alerts/:id/status` |
| dashboard | `GET /dashboard/stats`, `GET /dashboard/trends` |
| incidents | `POST /incidents`, `GET /incidents`, `GET /incidents/:id`, `PATCH /incidents/:id`, `POST /incidents/:id/notes` |
| reports | `POST /reports`, `GET /reports`, `GET /reports/:id` |
| assistant | `GET /assistant/status`, `POST /assistant/ask` |
| agent | `GET /agent/status`, `POST /agent/scan`, `GET /agent/proposals`, `GET /agent/proposals/:id`, `POST /agent/proposals/:id/approve`, `POST /agent/proposals/:id/reject` |

### 5.2 Internal services
- ml-service: `GET /health`, `GET /model/info`, `POST /predict` (max 5,000 records).
- ai-service: `GET /health`, `GET /knowledge/status`, `POST /search`, `GET /assistant/status`, `POST /assistant/ask`
  (the last two need `x-internal-key`).
- Google Gemini REST API: `POST {base}/models/{model}:generateContent`, key in the `x-goog-api-key` header.
  The default model name in the configuration was **not verified against a real key**; set `LLM_MODEL` to a model
  your key can use.

### 5.3 Data
Training data: UNSW-NB15 (not included in the repository; see the README for where to download it).

---

## 6. Data requirements
Collections: users, detectionjobs, alerts, incidents, reports, agentproposals, auditlogs. Field-level detail is in
`docs/design/design.md`. Uploaded CSV files are deleted after processing; alert documents keep the row values
needed for investigation, so they may contain IP addresses. Treat the database as sensitive.

---

## 7. Known limitations (stated up front)
1. **No measured detection quality exists.** The model has not been trained on the real data set by the author.
   Any accuracy figure quoted in the report must come from the metrics file produced by the team's own training run.
2. UNSW-NB15 is old, lab-generated and class-imbalanced (about 87% normal in the full set). High overall accuracy
   can hide poor recall on rare attack classes such as Worms (174 records in the full set) and Shellcode.
3. The severity thresholds and the retrieval `MIN_SCORE` are untuned project choices.
4. The keyword retriever matches weakly on generic words (for example "service", "attack").
5. The knowledge base ships with the team's own notes. Official NIST, CISA and MITRE passages must be added by the
   team, with correct front matter.
6. The assistant and the model can be wrong. Its output is labelled as a suggestion.
7. The agent has three actions and fixed rules. It is not an autonomous responder.
8. Uploaded files are processed in a background task inside the Express process; a server restart during analysis
   leaves a job unfinished.
9. The default Gemini model name is unverified; no real LLM call has been made.
10. No load, performance, penetration or accessibility testing has been done.
11. The backend Jest tests mock the database models. Owner scoping and filters inside real MongoDB queries are therefore checked only by the end-to-end smoke script and by manual two-account testing. Both have since been done once (see section 9), but only for the pages and paths tried.

## 8. Acceptance criteria (for the team to check on a real run)
1. `npm test` passes in `backend` and `frontend`; `pytest` passes in `ml-service` and `ai-service`.
2. After training on UNSW-NB15, `/model/info` reports real metrics, and the README or report quotes those numbers
   with the date, split and model version.
3. `node tests/e2e/smoke.mjs --csv <real file>` ends with no FAIL, and the SKIP lines are understood.
4. An analyst cannot read another analyst's job, alert, incident, report or suggestion (check by hand with two accounts).
5. The agent cannot change anything until Approve is clicked (check on the Suggestions page and in the audit log).

## 9. Verification status
Last updated 6 November 2026, after the team's runs on a Windows machine (Node 22, Python 3.13).

| Check | Result |
|---|---|
| `backend` Jest suite | **20 suites, 340 tests passed.** Models and outside services are mocked: no real MongoDB query runs in these tests. |
| `frontend` Vitest suite | **12 files, 110 tests passed.** |
| `ml-service` pytest | **81 passed** (3 Nov). Synthetic data only. |
| `ai-service` pytest | **115 passed, 1 skipped** (3 Nov). A later run after the general-chat change was not recorded here. |
| Dependency audits (7 Nov 2026) | Backend `npm audit --omit=dev`: 2 findings (S-3 mitigated, S-4 not applicable). Frontend: 2 moderate react-router findings (S-5: SSR one not applicable, redirect one unlikely and guarded). `ai-service` `pip-audit`: 5 chromadb findings (S-6: optional package, not used with `RAG_STORE=keyword`; not proof the embedded client is safe). `ml-service` `pip-audit` not yet run. All assessed in `docs/security/security-review.md`. |
| `tests/e2e/smoke.mjs` against a real stack (Atlas database) | **First run 19 passed, 0 failed, 2 skipped** (assistant steps; AI service was not running). **Second run, AI service running: 21 passed, 0 failed, 0 skipped.** The assistant step asked a general question, got no matching passage and `generated=false`, so it verifies the route and the honest "no match" path, not a Gemini-written answer. |
| Training on UNSW-NB15 | **Done.** Binary: test F1 0.890, recall 0.988, false-positive rate 0.283. Category: test accuracy 0.702, macro F1 0.496. See `docs/research/research.md` section 7. |
| Pages viewed in a browser | Dashboard, alerts, incidents, reports, suggestions, status and assistant were opened by the team. Not every screen or every flow has been checked by hand. |
| Real Gemini call | The team reports the assistant (cited and general modes) now answers with a real key. Answer quality has **not** been evaluated. |
| Two-account access check (6 Nov 2026) | **Done by hand, team-reported:** a second account could not see the first account's dashboard totals, alerts, incidents, reports or suggestions, and got "not found" for the first account's alert, incident and report addresses. One pair of accounts; direct API calls were not tried. |
| Production build, deployment on a real server, load test, prompt-injection test with a real model | **Never done.** |
