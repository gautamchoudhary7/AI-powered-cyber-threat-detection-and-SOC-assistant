# AI-Powered Cyber Threat Detection & SOC Assistant

A college project: upload network-flow CSV files, detect suspicious traffic with machine learning,
view alerts on a SOC dashboard, and investigate with an evidence-based AI assistant.

**Current status: all 12 phases are written, and the main workflow has been run for real on the team's machine.** What was
verified: registration and login, CSV upload, detection with a model trained on UNSW-NB15, alerts, dashboard, incidents,
reports, the human-approved suggestions page and the assistant. The end-to-end smoke script passed all 21 steps on a second run
(the first run passed 19 and skipped 2 assistant steps because the AI service was not running). Honest limits: the detector flags about 28% of normal test traffic by mistake (test
recall 98.8%), attack-category labels are unreliable for some classes (DoS, Backdoor), nothing has been tested on real
traffic or deployed to a server, and the answer quality of the assistant has not been evaluated. Real numbers are in
`docs/research/research.md`, section 7. Reports are assembled from stored records by plain code; no AI writes them.
The assistant has two modes: **Cited answers** search the reference documents in `ai-service/knowledge/` (only one small
file of the team's own notes ships; add real documents, see its README) and, when a key is set, ask Gemini to write a
short answer that cites them; **General chat** lets you ask anything but has no sources and is not verified.

## How the pieces fit together (simple version)

```
Browser (React, port 5173)  -->  Backend (Express, port 5000)  -->  ML service (FastAPI, port 8000)
                                        |   \
                                        v    -->  AI service (FastAPI, port 8001)  -->  Google Gemini (internet)
                                    MongoDB
```

- **frontend/**: what the analyst sees. It only talks to the backend.
- **backend/**: the gatekeeper. Handles login, (later) uploads, and the database.
- **ml-service/**: Python service that will load the trained model and make predictions.
- **ai-service/**: Python service (port 8001) that searches a folder of reference documents and returns cited
  passages (Phase 8) and asks Google Gemini to write cited answers from them (Phase 9). The backend calls it with a shared
  secret; the browser never talks to it and never sees any key.
- **docs/**: synopsis, SRS, design, research, deployment and security-review documents. Start at `docs/README.md`.
- **tests/e2e/**: `smoke.mjs`, a script that exercises a running stack from register to agent approval (Phase 11).

## What you need installed

| Tool    | Version used in development | Check with        |
|---------|-----------------------------|-------------------|
| Node.js | 22 (18 or newer should work)| `node --version`  |
| npm     | 10                          | `npm --version`   |
| Python  | 3.13 (3.10+ should work)    | `python3 --version` (on Windows: `python --version`) |
| Git     | 2.x                         | `git --version`   |
| MongoDB | **new in Phase 2** (see below) | see below      |

## MongoDB setup (new in Phase 2)

The backend now needs MongoDB. Pick **one** option.

**Option A: MongoDB Atlas (free cloud database, no install).**
1. Create a free account at https://www.mongodb.com/atlas and create a free (M0) cluster.
2. Under *Database Access*, create a database user with a password.
3. Under *Network Access*, add your current IP address (each teammate adds their own).
4. Click *Connect* > *Drivers* and copy the connection string. It looks like
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/soc_assistant`.
5. Put it in `backend/.env` as `MONGODB_URI=...`. **Never commit this file or share the string in chat/screenshots.**
   Each teammate should use their own database user.

**Option B: local MongoDB Community Server.**
Install it from https://www.mongodb.com/try/download/community, start the service, and keep the default
`MONGODB_URI=mongodb://localhost:27017/soc_assistant`.

## First-time setup

You will need **three terminals** to run everything.

### 1. Backend (Terminal 1)

```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env
```

Open `backend/.env` and set two things:

1. `MONGODB_URI` (see above).
2. `JWT_SECRET`. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Paste the output after `JWT_SECRET=`. The server **refuses to start** without a strong secret.

Then:

```bash
npm install
npm test                    # runs the backend tests (no database needed)
npm run dev                 # starts the API on http://localhost:5000
```

Check it: open http://localhost:5000/api/health. You should see `"status": "ok"` and
`"database": "connected"`.

### 2. ML service (Terminal 2)

```bash
cd ml-service
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env        # Windows: copy .env.example .env
pytest                      # runs the health-check tests
uvicorn app.main:app --reload --port 8000
```

Check it: open http://localhost:8000/health. You should see `"model_loaded": false` and
`"detection": "not configured (no trained model found)"`. That is the **correct and honest**
answer until a model is trained in Phase 3.

### 3. Frontend (Terminal 3)

```bash
cd frontend
cp .env.example .env        # Windows: copy .env.example .env
npm install
npm test                    # runs the component tests
npm run dev                 # starts the UI on http://localhost:5173
```

Check it: open http://localhost:5173. With the backend and ML service running, you should see two
green "Online" cards. (The frontend has no login screen yet; that comes with the dashboard phase.)

## Machine learning (Phase 3)

The ML code is written and its core logic is tested, but **no model has been trained on the real dataset yet**,
because the dataset could not be downloaded in the development sandbox. Until you train one, the service answers
`/health` with `model_loaded: false` and `POST /predict` with a `503 detection_not_configured` error. It never
makes up results.

### Step 1: download the dataset
Follow `ml-service/data/README.md`. Put `UNSW_NB15_training-set.csv` and `UNSW_NB15_testing-set.csv` in
`ml-service/data/raw/`. Keep the authors' `UNSW-NB15_features.csv` too. Cite the dataset papers in your report.

### Step 2: inspect the real files (always do this first)
From the `ml-service` folder with the virtual environment active:

```bash
python -m app.ml.inspect_dataset \
  --train data/raw/UNSW_NB15_training-set.csv \
  --test  data/raw/UNSW_NB15_testing-set.csv
```

Read the output (also saved in `ml-service/reports/`). Check: the real column names, which columns are text, whether
the label column and the attack-category column are named `label` and `attack_cat`, whether there are missing values,
duplicates, or test categories never seen in training. **If a name differs, pass it with `--label-col`,
`--category-col` or `--id-cols`; if anything surprises you, paste the report here before training.**

### Step 3: train
```bash
# Attack or normal (the detector the backend will use)
python -m app.ml.train --task binary --train data/raw/UNSW_NB15_training-set.csv --test data/raw/UNSW_NB15_testing-set.csv

# Which attack category (optional second model)
python -m app.ml.train --task multiclass --train data/raw/UNSW_NB15_training-set.csv --test data/raw/UNSW_NB15_testing-set.csv
```

Add `--max-train-rows 20000` for a quick trial run, and `--models logreg,rf,xgboost` after `pip install xgboost`.
Each run compares Logistic Regression and Random Forest, picks the winner using a **validation split of the training
data only**, refits it, and scores the official test file **once**. It saves the model plus a report with accuracy,
precision, recall, F1, per-class results, confusion matrix and false-positive rate to `ml-service/reports/`.
These measured numbers are what goes in your project report. Do not quote any other numbers.

Model files are ignored by git. Restart the ML service (or just call `/health`) and it will pick the new model up.

### Running the end-to-end smoke test (Phase 11)

With MongoDB, the ML service (with a trained model), and the backend running (the AI service is optional):

```
node tests/e2e/smoke.mjs                      # synthetic rows: tests the plumbing only
node tests/e2e/smoke.mjs --csv path/to/real.csv
```

Needs Node 18 or newer and no packages. It creates a throw-away user in whatever database the backend uses, so use a
development database. `SKIP` lines mean that part was **not** tested. Set `API_URL` / `ML_URL` if the ports differ.

### Prediction API
`POST http://localhost:8000/predict` with `{"records": [ {column: value, ...}, ... ]}` (up to 5000 records). The records
need the same feature columns the model was trained on (`GET /model/info` lists them). Extra columns are ignored with a
warning. Response: per record `label`, `is_attack`, `attack_probability` and (if the category model exists) a `category`,
plus `model_version` and `warnings`. Errors use `{"error": {"code", "message", "details"}}`: `422` bad records,
`413` too many records, `503` no model, `500` model file unreadable.

**Important limits.** Probabilities are not calibrated (treat them as scores). An attack category is the second model's
best guess, not a confirmed diagnosis. Scores on UNSW-NB15 will look better than real-world performance.
Model files are loaded with pickle (via joblib), so only load models you trained yourself; the service also checks each
file's SHA-256 checksum against its metadata before loading.

## The web app (Phases 5 to 7)

With all three services running, open http://localhost:5173.

1. **Register** an account (or log in). The token is kept in `sessionStorage`, so closing the tab logs you out.
   You land on the **Dashboard**:
   - Four totals (all time): records analysed, total alerts, high and critical alerts, and incidents not yet closed.
   - Alerts by predicted category (ranked bars, one colour because the categories have no order).
   - Alerts per day for the last 7, 14, 30 or 90 days (days are UTC). The chart has a legend, a hover tooltip and a
     **Show as table** button, so every number can be read without the chart.
   - The five most recent alerts.
   - Until you analyse a file, it says so and links to the upload page. No demo data is ever shown.
2. **Upload CSV**: drag a file in or click to choose one. You see its name, size and a quick check (`.csv`, not empty,
   under 20 MB) before you submit; the server then checks it again and explains any rejection, for example
   which columns are missing. A progress bar shows the upload.
3. **Job page**: updates every 2 seconds while the file is analysed, then shows rows analysed, rows flagged, flagged rows
   by predicted category, notes from the analysis, a link to the alerts and a **Download report (CSV)** button.
4. **Alerts**: filter by severity, status or category, sort by newest, severity or attack score, and page through
   results. The filters live in the address bar, so a filtered view can be bookmarked.
5. **Alert detail**: the model's prediction and the row values it used, a status dropdown
   (New, Investigating, Resolved, False positive), and **Create incident from this alert**.
6. **Incidents**: list with status and severity filters; create one by hand or from an alert. An incident page lets you
   edit the title, description, status (Open, Investigating, Contained, Closed) and severity, shows the linked alerts,
   and keeps a list of notes (plain text, attributed to the author, up to 5000 characters).

7. **Reports** (new in Phase 7): on a finished analysis choose **Generate summary report**, and on an incident choose
   **Generate incident report**. The report opens as Markdown text with **Download (.md)** and **Copy text** buttons.
   The list page filters by type.
8. **Settings** (new in Phase 7): change your name, or your password (current password required, new password must differ).
   Changing the password signs out every other browser or device; the one you are using stays signed in.

Without a trained model the upload fails with a clear "Detection is not configured" message. That is the honest result.
9. **Assistant** (new in Phase 9): an **Ask the assistant** box on every alert and incident page, and a general
   **Assistant** page. You type a question; the answer shows its **sources** (title, publisher, link, the passage) and
   marks which ones it cited. On an alert page there is an unticked box to also send the flow's raw row values; see the
   privacy notes below. Without a Google key you get the matching passages only, and the page says so.

10. **Suggestions** (new in Phase 10): the **Scan for suggestions** button runs a few fixed rules over your alerts and
    incidents and lists what it would do next. Each suggestion shows its reason and the alerts it is based on, and waits
    for you: **Approve** asks you to confirm before anything is changed, **Reject** takes an optional reason. Every
    decision is recorded in the audit log.

Not built yet: an admin screen, linking more alerts to an existing incident, assigning incidents to other users, an
audit-log viewer in the web app, and PDF export of reports.

### Assistant API (Phase 9)

| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/assistant/ask` | `{ "question": "...", "alertId"?: "...", "incidentId"?: "...", "includeRowValues"?: true }`. You may name one alert **or** one incident (not both); the server loads it itself and only if you may see it. Returns `answer` (or `null`), `generated`, `sources`, `notes`, `model`, `rowValuesSent` |
| POST | `/api/assistant/chat` | **General chat.** `{ "question": "..." }` (3-1000 characters, nothing else is accepted). The model answers from its own knowledge: **no reference documents, no alert or incident data, no sources, not verified**. Returns `answer`, `model`, `mode: "general"`, `notes`. Turn it off with `ASSISTANT_GENERAL_CHAT=false` |
| GET | `/api/assistant/status` | Whether the AI service is reachable, whether a language model is configured, whether row values may be sent, and whether general chat is allowed |

What the model is sent: the question, the alert's or incident's summary fields (severity, status, predicted category,
attack score, file name and CSV line, or the incident title, status and description plus at most three linked alerts),
and up to four reference passages. **Never sent:** incident notes, passwords, tokens, or other users' data. **Only if
you tick the box on an alert:** that flow's raw row values (up to 50 columns). Each value is cut to 80 characters.

Privacy and cost, please read: every question goes to Google. Google's terms for its **free** Gemini tier say that
content you send may be used to improve its products and may be read by human reviewers, and tell you not to submit
sensitive or personal information (checked on Google's terms page on 1 November 2026; terms change, so check again).
Network-flow addresses can be personal or sensitive in real organisations. That is why row values are off by default
and why the server can forbid them entirely with `ASSISTANT_ALLOW_ROW_VALUES=false`. Paid usage is billed by Google.
The question text is never written to the audit log (only its length and whether row values were sent).

Safety design: CSV values, alert text and document passages are treated as untrusted. The AI service shortens them,
strips control characters and replaces angle brackets so they cannot close the tags that mark them as data, and the
fixed rules live only in the system instruction. The assistant has no tools and cannot change anything, answers are shown
as plain text, and any `[S3]`-style source label the model invents that does not exist is removed. This lowers the risk
of prompt injection but cannot remove it; always check answers against the sources.

Setup: put `LLM_API_KEY` (from Google AI Studio) and a long random `INTERNAL_API_KEY` in `ai-service/.env`, and the
**same** random value as `AI_INTERNAL_KEY` in `backend/.env`. Without the shared secret the AI service refuses to
answer. See both `.env.example` files.

### Controlled agent API (Phase 10)

The agent **suggests; a person decides**. It does not use a language model: alert text and CSV values can contain
instructions meant to trick a model (prompt injection), so the suggestions come from three fixed, readable rules in
`backend/src/utils/agentRules.js`:

1. Three or more new high or critical alerts of the same predicted category from one file: suggest **one incident** for them.
2. Any other new critical alert: suggest marking it **investigating** (at most 20 per scan, highest score first).
3. An open incident whose linked alerts are all resolved or false positives: suggest marking it **contained** (closing is left to a person).

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/agent/status` | Whether the agent is on, how long suggestions last, and the three allowed actions |
| POST | `/api/agent/scan` | Runs the rules and stores **new** suggestions (at most 25 per scan; the same suggestion is never created twice). Takes no body. Changes nothing else |
| GET | `/api/agent/proposals` | List; query `status`, `page`, `limit`. Overdue pending ones show as `expired` |
| GET | `/api/agent/proposals/:id` | One suggestion |
| POST | `/api/agent/proposals/:id/approve` | Takes no body. Claims the suggestion in one atomic step, then runs it as you |
| POST | `/api/agent/proposals/:id/reject` | Optional `reason` (300 characters) |

Safeguards, so "approval" actually means something:
- **Only three actions exist** (`agentActions.js`): create an incident, change an alert's status, change an incident's status.
  Nothing touches the network, files or other systems. Anything else is refused, including names like `__proto__`.
- **The client never says what runs.** Scan and approve take no input (`.strict()` rejects extra fields); the server
  executes the action it stored itself, and checks its parameters again right before running it.
- **Each suggestion can be approved once.** The claim only matches a suggestion that is still pending and not expired
  (7 days, `AGENT_PROPOSAL_TTL_DAYS`); a second approve gets 409, an expired one 410.
- **It runs as the approver**, inside the approver's own access (analysts: their own records; admins: all).
- **It never overwrites newer work.** Each change says what it expects ("only if the alert is still `new`"); if someone
  changed it meanwhile, nothing is changed and the suggestion is marked failed with a plain message.
- **Audit log:** `agent.scan`, `agent.approved`, `agent.executed` or `agent.failed`, `agent.rejected`. Free text such as
  a rejection reason is not copied into it.
- **Kill switch:** `AGENT_ENABLED=false` stops scanning and approving. Scans and approvals are rate-limited (`AGENT_RATE_LIMIT_MAX`).

What it cannot do: it cannot delete anything, block an address, send anything or run commands, and it will not act while
you are away. Suggestions rely on model predictions that may be wrong, and the page says so.

### Reports and settings API (Phase 7)

| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/reports` | Body is `{ "type": "detection_summary", "jobId": "..." }` or `{ "type": "incident", "incidentId": "..." }`, plus an optional `title`. The server builds the text; any other field (including `content`) is rejected |
| GET | `/api/reports` | List (without the text); query `page`, `limit`, `type` |
| GET | `/api/reports/:id` | One report including its Markdown text |
| PATCH | `/api/users/me` | Change your `name`. Email, role and active status cannot be changed here |
| POST | `/api/users/me/password` | `{ currentPassword, newPassword }`. Returns a new token. A wrong current password gives 400 (not 401, because the web app signs you out on any 401). Rate-limited like login |

How reports are made: a detection summary needs a **completed** job (otherwise 409) that you own (admins: any). It
contains the file and model details, rows flagged, flagged rows by category, stored alerts by severity and by status,
and the ten highest-scoring alerts. An incident report contains the incident fields, its linked alerts and its notes.
Every report ends with a Limitations section (predictions, not confirmed attacks; scores are not calibrated; severity
is a rule). File names, notes and descriptions are treated as untrusted: table characters are escaped, angle brackets
are neutralised and descriptions and notes are quoted, so they cannot add headings or HTML. Reports are snapshots: they
do not change if the incident is edited later. Analysts see their own reports; admins see all; other people's reports
return 404.

How the password change works: the user record stores `passwordChangedAt`, and the login check rejects any token issued
before that moment. Tokens carry whole-second timestamps, so a token issued in the very same second as the change would
still be accepted (a window under one second). The password and hash are never written to the audit log.

### Dashboard and incident API (Phase 6)

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/dashboard/stats` | Totals and category distribution (all time) |
| GET | `/api/dashboard/trends?days=14` | Alerts per UTC day; `days` must be 7, 14, 30 or 90; quiet days appear as zeros |
| POST | `/api/incidents` | Create (`title`, optional `description`, `severity`, `alertIds`; you may only link alerts you can see) |
| GET | `/api/incidents` | List; query `page`, `limit`, `status`, `severity`, `order` |
| GET | `/api/incidents/:id` | One incident with linked alerts and notes |
| PATCH | `/api/incidents/:id` | Change `title`, `description`, `severity` or `status` (any status to any other; changes are audit-logged) |
| POST | `/api/incidents/:id/notes` | Add a note (the note text is not copied into the audit log) |

As with alerts, analysts see only their own numbers and incidents; admins see everyone's. "Severity" on alerts is a
sorting rule based on the model score, while an incident's severity is chosen by a person.

## CSV detection workflow (Phase 4 backend API)

The web app above uses these endpoints. You can also call them with `curl` or a tool such as Postman / Thunder Client.
It only works after you have trained a model (see above).

How it works: upload a CSV, the backend checks it, answers `202` with a job id, then analyses the file in the
background in batches of 500 rows while you poll the job. Rows the model flags become **alerts**.

**Required columns are not hardcoded.** The backend asks the ML service which columns the trained model uses
(`GET /model/info`) and requires exactly those, in any order. Extra columns (for example `id`, `label`) are ignored.

| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/detection/upload` | Upload a CSV (form field `file`). `202` with the job, or a clear error |
| GET  | `/api/detection/jobs/:id` | Job status, progress, counts per category, warnings, error message |
| GET  | `/api/detection/jobs/:id/report.csv` | Download flagged rows as a spreadsheet-safe CSV (after completion) |
| POST | `/api/detection/predict` | Score up to 100 records sent as JSON. Nothing is saved |
| GET  | `/api/alerts` | List alerts. Query: `page`, `limit` (max 100), `severity`, `status`, `category`, `jobId`, `sortBy` (`createdAt`, `severity`, `confidence`), `order` |
| GET  | `/api/alerts/:id` | One alert, including the raw record values |
| PATCH | `/api/alerts/:id/status` | Set `new`, `investigating`, `resolved` or `false_positive` (audit-logged) |

All of these need a login token. Analysts see only their own jobs and alerts; admins see all.

```bash
# Replace TOKEN (from login) and use a CSV that has the model's columns
curl -X POST http://localhost:5000/api/detection/upload -H "Authorization: Bearer TOKEN" -F "file=@flows.csv"
curl http://localhost:5000/api/detection/jobs/JOB_ID -H "Authorization: Bearer TOKEN"
curl "http://localhost:5000/api/alerts?severity=critical&sortBy=severity" -H "Authorization: Bearer TOKEN"
curl -o report.csv http://localhost:5000/api/detection/jobs/JOB_ID/report.csv -H "Authorization: Bearer TOKEN"
```

**What it refuses (and says why):** not a `.csv` file, too big (default 20 MB), looks binary, empty, wrong or duplicate
column names, more than 50,000 rows, ragged rows, non-numeric values in numeric columns (error names the CSV line),
no trained model (`503`), ML service down (`503`), server already busy (`429`). A failed analysis deletes its partial
alerts, so a half-finished run is never shown as a result. Uploaded files are stored under a random name in a temporary
folder and deleted when processing ends; jobs left unfinished by a restart are marked failed on startup.

**Severity** (`low`, `medium`, `high`, `critical`) is a simple rule in this project based on the model's attack score
(0.70 / 0.85 / 0.95). The score is not a calibrated probability, so severity only helps sort alerts. It is not an
assessment of real-world impact. An alert is a model prediction, not a confirmed attack.

Limits for now: one analysis runs per file in the server's own memory (a restart stops it; there is no job queue
like Redis yet), and the report lists flagged rows only, with the normal/attack totals available from the job.

## Authentication API (Phase 2)

All responses look like `{ "success": true, "data": ... }` or `{ "success": false, "error": { "message": ... } }`.

| Method | Path                 | Needs token | What it does |
|--------|----------------------|-------------|--------------|
| POST   | `/api/auth/register` | no          | Create an account (always role `analyst`) and return a token |
| POST   | `/api/auth/login`    | no          | Log in and return a token |
| GET    | `/api/auth/me`       | yes         | Return the logged-in user |

Passwords need 10 to 72 characters with at least one letter and one number.

Try it from a terminal (with the backend running):

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Asha Verma","email":"asha@example.com","password":"Str0ngPassw0rd"}'

curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"asha@example.com","password":"Str0ngPassw0rd"}'

# Replace TOKEN with the token from the login response
curl http://localhost:5000/api/auth/me -H "Authorization: Bearer TOKEN"
```

(On Windows PowerShell, `curl` behaves differently. Use Git Bash, or Postman / Thunder Client in VS Code.)

**Making an admin.** Nobody can register as admin on purpose. After registering, promote the account
from the `backend` folder:

```bash
npm run set-role -- asha@example.com admin
```

## Database models (Phase 2)

`User`, `Alert`, `Incident`, `Report` and `AuditLog` exist in `backend/src/models/`. The `Alert` fields are a
**starting point** and will be adjusted in Phase 3 after the real dataset columns have been inspected.
Only `User` and `AuditLog` are used by any endpoint so far.

## Security measures implemented so far

- Passwords hashed with bcrypt (via `bcryptjs`, same algorithm, no C++ compiler needed). Hashes are never returned.
- JWT tokens expire (default 1 hour); only HS256 is accepted; the user's role is read from the database on every request.
- Server refuses to start with a missing, short or placeholder `JWT_SECRET`.
- Strict input validation (zod); unknown fields such as `role` are rejected.
- NoSQL-injection guard: any `$` or `.` in request field names is rejected; Mongoose `sanitizeFilter` is on as a second layer.
- Same error message for wrong email and wrong password; extra rate limit on login/register.
- Login, failed login and registration are written to the audit log (no passwords or tokens).
- Database outages return a clean `503`, never a stack trace.

Known limitations: registering with an email that already exists returns `409`, which reveals that the email is
registered. Tokens cannot be revoked before they expire (no logout list yet). Behind a reverse proxy in
deployment, `trust proxy` must be configured so rate limiting sees real client IPs.

## Verification status (honest report)

The code was written in a sandbox whose network blocked the npm registry and PyPI, so some packages could not be
installed there. That means:

- **Run and passed:**
  - ML core, with the real scikit-learn/pandas: 60 pytest tests passed (preprocessing, metrics, training, model
    saving and loading, prediction, dataset inspection). These use small **synthetic** tables made for testing, not
    the real dataset, so they prove the code works, not that detection is accurate.
  - The three command-line tools (inspect, train binary, train multiclass) and a prediction through the saved model
    ran end to end on synthetic CSVs.
  - JavaScript syntax check of all 29 backend files; the sanitizer logic (9 assertions); the config validation.
- **Phase 4 (CSV workflow):** 15 tests of the dependency-free helpers (severity, file names, spreadsheet-formula
  escaping, header checks) passed, run through a small Jest stand-in because npm is blocked. A check confirmed the
  backend reads the schema the ML service really saves. The Jest tests for the upload route, job processing and alerts
  (`detection.test.js`, `detectionService.test.js`, `alerts.test.js`, about 70 cases) are written but **not run**, and
  the upload-to-alert workflow has **never run end to end**, because multer, csv-parse, mongoose and MongoDB are
  unavailable here.
- **Phase 5 (frontend):** 14 tests of the pure helpers in `src/utils/format.js` passed through a small Vitest stand-in.
  A static check parsed all 23 frontend files and confirmed every relative import points to a real file and a real
  export. The component tests (login and protected routes, upload page, alerts page, about 25 cases) are written but
  **not run**, and the app has **never been built or opened in a browser** (`npm install` is blocked here). Layout,
  styling and any runtime errors are therefore unchecked.
- **Phase 6 (dashboard and incidents):** 8 tests of the dashboard helpers (gap-filled daily series, category folding)
  passed via the Jest stand-in, and the day-label logic was checked directly in Node. The two chart colours were run
  through the data-viz palette validator against this app's dark card colour and passed every check. A static check
  parsed all 29 frontend files and confirmed imports, exports and test-mock coverage. The Jest tests for the dashboard
  and incident APIs (about 50 cases) and the Vitest tests for the new pages (about 20 cases) are written but **not
  run**, and the aggregation queries have never run against a real MongoDB. The chart has never been rendered, so
  its layout is unchecked.
- **Phase 7 (reports and settings):** 18 tests of the report builder (`reportBuilder.js`: escaping, determinism,
  limitations text, size cap, empty cases) and 4 tests of the download file-name helper passed through the stand-ins.
  Writing those tests exposed one real bug (severity names were printed in lowercase), which was fixed. All backend files
  were syntax-checked and the frontend static check parsed 36 files with no missing imports or exports. The Jest tests
  for the reports and users APIs (`reports.test.js`, `users.test.js`, 28 cases, including the "old token is
  rejected after a password change" case) and the Vitest tests for the new pages (15 cases) are written but
  **not run**. The report queries and the `passwordChangedAt` check have never run against a real MongoDB, and the new
  pages have never been rendered.
- **Phase 8 (knowledge base):** 38 pytest tests passed for real in `ai-service`: source-header checks, chunking
  (size limits, headings, overlap, stable ids), the keyword (BM25) store, citations, question validation and the
  service status logic. The ingest command and a few real searches also ran on the one bundled notes file. These tests
  use small made-up documents, so they show the code works, **not** that answers are good. Not run: `ChromaStore`
  (the `chromadb` package could not be installed), the vector search quality, and `test_api.py` / the FastAPI app
  (no `fastapi`). Search quality on real NIST, CISA and MITRE text has never been measured, and the vector-store
  score threshold (`RAG_MIN_SCORE`) has not been tuned. One weakness seen in a manual check: the keyword store
  returns weak matches on generic words such as "service" or "attack" (low scores), which is why a threshold matters.
- **Phase 9 (assistant):**
  - **Run for real:** 85 pytest tests in `ai-service` pass (1 skipped), covering the prompt hygiene (tags cannot be
    closed from inside data, control characters and length), the Gemini client against a local fake server, source-label
    checking, the "no model configured" path, error mapping and the shared-secret check; and 9 tests of the backend
    context builder through the Jest stand-in, including "raw row values are not sent unless asked" and "notes are never
    sent".
  - **Written, not run:** about 36 Jest cases (`assistant.test.js`, `aiClient.test.js`) and 13 Vitest cases
    (`AssistantPanel.test.jsx`), and `test_api.py` for the AI service (no `fastapi` here).
  - **Never done:** **no real call to Google Gemini has ever been made.** The request format, the `x-goog-api-key` header
    and the default model name `gemini-3.8-flash` come from Google's documentation pages read on 1 November 2026; the
    default may not exist for your key (the error will say "model not found"; pick another in AI Studio). The quality
    and accuracy of real answers are unknown. The full path browser to backend to AI service to Google has never run.
- **Phase 10 (agent):**
  - **Run for real:** 21 tests of the rules and the action whitelist pass through the Jest stand-in. I also broke the
    code on purpose three ways (group size, the prototype check, accepting extra parameters) and the tests failed each
    time, so they do catch those mistakes.
  - **Written, not run:** about 23 Jest cases for the agent API (`agent.test.js`: approval claim, scope, stale state,
    tampered parameters, 409 and 410, the kill switch, audit entries) and 13 Vitest cases for the Suggestions page.
  - **Never done:** none of it has run against a real MongoDB. The atomic approval, the unique "never suggest twice" index
    and the way a suggestion is recycled after it expired or failed are therefore **untested against a real database**.
    The Suggestions page has never been rendered.
- **Phase 11 (documentation, end-to-end script):**
  - **Done:** four documents in `docs/` (synopsis, SRS with requirement IDs and test traceability, design, research notes).
    Their claims were checked against the code, which caught two errors in my first draft (a wrong description of the
    backend tests, a missing page); both were fixed. Sources marked "from memory" in the research notes still need checking.
  - **Run for real:** syntax check of `tests/e2e/smoke.mjs`, and a run with no server, which fails cleanly at the first step.
  - **Never run:** the smoke script against a real stack. Its first real run is also the first test of the script itself.
  - **Gap found while documenting:** the backend Jest tests mock the database models, so real MongoDB queries and owner
    scoping are covered only by the smoke script and manual two-account testing. The smoke script has since passed, and the
    team did the two-account check by hand on 6 Nov 2026 (see `docs/security/security-review.md`).
- **Phase 12 (security review, deployment guide):**
  - **Done:** a self-review of the code (`docs/security/security-review.md`) and a deployment guide
    (`docs/deployment/deployment.md`). The review found two real problems, both fixed: no `TRUST_PROXY` setting (behind a
    reverse proxy all users would share one rate limit and audit logs would show the proxy's IP), and the AI service
    accepting the placeholder shared secret from `.env.example` (it now refuses placeholders and keys under 16 characters).
  - **Run for real:** 3 new tests for the proxy setting (they fail when the parser is broken on purpose) and 5 new pytest
    cases for the key check; `ai-service` now 90 passed (1 skipped); `ml-service` 60 passed (2 skipped); the other backend
    stand-in suites still pass; all backend files pass the syntax check; a secret scan of the tree found nothing.
  - **Never done:** the deployment guide has never been followed on a real server (nginx, systemd, MongoDB authentication,
    HTTPS are untested instructions). `npm audit` and `pip-audit` could not run here. No penetration test, load test or
    prompt-injection test against a real model. The review is a self-review, not an independent audit.
- **First real run on the team's Windows machine (3 Nov 2026, Node 22, Python 3.13):**
  - `backend` Jest: 20 suites, 318 tests passed (the models and outside services are mocked, so no real MongoDB query ran).
  - `frontend` Vitest: 12 files, 100 tests passed, after fixing 11 mistakes in the tests themselves (not in the app):
    five tests found the same word in a filter drop-down and in a badge, one found "DoS" twice, and the test environment
    lacked `ResizeObserver` for the chart library. The app code did not change.
  - `ml-service` pytest: 81 passed (this included the FastAPI API tests that could not run in the sandbox).
  - `ai-service` pytest: 115 passed, 1 skipped (the skip is "chromadb is not installed", expected once it is).
  - `npm audit --omit=dev` (backend): 2 findings, see `docs/security/security-review.md` (S-3, S-4).
  - Still never done: MongoDB-backed run, browser run, smoke script, training on UNSW-NB15, real Gemini call.
- **Second real run (5-6 Nov 2026):** `ml-service` trained on UNSW-NB15 (binary and category models, results in
  `docs/research/research.md` section 7); smoke script **19 passed, 2 skipped (assistant steps) on the first run, then 21 passed, 0 failed, 0 skipped**
  with the AI service running, against a MongoDB Atlas database (the assistant step got "no match" and no written
  answer for its question, so it checks the route and the honest "no match" path, not Gemini output); `backend` Jest **340 passed**; `frontend` Vitest **110 passed** (these include the General chat
  tests).
- **Out of date (kept for history, written 3 Nov):** the next two bullets describe the state before those runs.
- **Written but NOT run (3 Nov):** the 2 API test files (`test_api.py`, `test_health.py`: they need `fastapi`, which could not
  be installed, so they were skipped), the FastAPI app itself, every Jest test, every Vitest test, `npm run dev`, and
  any connection to MongoDB. Treat all of these as unverified until you run them.
- **Not done at all (3 Nov; now done, see above):** training on the real UNSW-NB15 files.
- If a test fails, paste the full error output and we will fix it before the next phase.

## Roadmap (one phase at a time)

1. Phase 1: project skeleton and health checks (written)
2. Phase 2: authentication and MongoDB models (written)
3. Phase 3: dataset inspection, model training, `/predict` (code written, this phase; real training pending your dataset)
4. Phase 4: CSV upload and detection jobs, alerts (backend written, this phase)
5. Phase 5: frontend for login, CSV upload, job results, alerts (written, this phase)
6. Phase 6: dashboard stats and charts, incidents (written, this phase)
7. Phase 7: written reports (`/api/reports`), user settings (written, this phase)
8. Phase 8: knowledge base and cited search in `ai-service` (written, this phase; needs real documents and a Chroma run)
9. Phase 9: AI assistant with cited sources (written, this phase; needs your Google key and real documents)
10. Phase 10: controlled agent with human approval and audit log (written, this phase)
11. Phase 11: full documentation set and end-to-end smoke script (written, this phase)
12. Phase 12: deployment guide and final security review (written, this phase). Next: run everything for real and fix what breaks
