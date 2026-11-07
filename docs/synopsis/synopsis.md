# Project Synopsis

**Title:** AI-Powered Cyber Threat Detection and SOC Assistant
**Team:** [fill in: names and roll numbers] **Guide:** [fill in] **Institution / Department:** [fill in]
**Academic year:** [fill in]

---

## 1. Introduction
Security teams receive far more network events than people can read. A common first step is to let a machine-learning
model mark the events that look like attacks, so that analysts review a shorter list. This project builds a small
version of that workflow as a web application: upload network-flow records, get a list of flagged rows ranked by
severity, track them as alerts and incidents, produce reports, and get help from an assistant that answers from
reference documents. A rule-based agent can suggest next steps, but a person must approve each one.

## 2. Problem statement
Analysts need to (a) find suspicious records quickly, (b) keep a record of what they decided and why, and
(c) look up how to handle a type of attack without leaving the tool. Existing commercial SOC platforms are
expensive and hard to study. A student project can show the main ideas end to end if it is honest about what
the detector can and cannot do.

## 3. Objectives
1. Build a working path from CSV upload to prediction to alert.
2. Train and compare classifiers on the UNSW-NB15 data set and report **only measured** results.
3. Provide alert triage, incident tracking and report generation with secure, per-user access.
4. Provide a documentation-grounded assistant (retrieval-augmented generation) that cites its sources and says
   when it has no answer.
5. Provide a controlled agent whose actions are limited to a short whitelist and always need human approval.
6. Document the design, requirements, tests and limitations truthfully.

## 4. Scope
**In scope:** CSV flow records with the UNSW-NB15 feature columns; binary detection (normal or attack) and, where
trained, attack category; web interface; REST API; audit log.
**Out of scope:** live packet capture, automatic blocking, SIEM integration, multi-organisation use, claims of
production-grade accuracy.

## 5. Proposed system (summary)
| Part | Technology | Job |
|---|---|---|
| Web app | React, Vite, Tailwind, React Router, Axios, Recharts | Pages for upload, alerts, incidents, reports, assistant, suggestions |
| API | Node.js, Express, MongoDB/Mongoose, JWT, bcrypt, zod | Accounts, validation, storage, orchestration, audit log |
| ML service | Python, FastAPI, pandas, scikit-learn (XGBoost optional), joblib | Train, evaluate and serve the detector |
| AI service | Python, FastAPI, keyword (BM25) search or ChromaDB, Google Gemini API | Retrieve reference passages and write cited answers |

The browser talks only to the API. The API calls the two Python services. See `docs/design/design.md`.

## 6. Methodology
1. Inspect the real data set (columns, types, missing values, class balance) before choosing any preprocessing.
2. Split training data into fit and validation parts (stratified); fit preprocessing inside the pipeline.
3. Compare logistic regression, random forest and (if available) XGBoost on the validation split.
4. Refit the chosen model on all training rows; evaluate once on the separate official testing set.
5. Save the model together with its measured metrics and column schema. The service reports those numbers as they are.
6. Build the application in small phases, each with tests and an honest README status.

## 7. Data set
UNSW-NB15, created by the Cyber Range Lab of UNSW Canberra with the IXIA PerfectStorm tool; about 100 GB of raw
traffic was captured and processed with Argus and Bro-IDS into 2,540,044 records with 49 features and a class label.
It has nine attack categories (Fuzzers, Analysis, Backdoors, DoS, Exploits, Generic, Reconnaissance, Shellcode,
Worms). The official partition has a training set of 175,341 records and a testing set of 82,332 records. It is free
for academic use; commercial use needs the authors' agreement. Source: UNSW Canberra data set page (see research
document). The data are **not** included in this repository.

## 8. Expected outcomes
- A running web application demonstrating the full workflow on a developer machine.
- Measured evaluation tables (precision, recall, F1, ROC-AUC, confusion matrix) produced by the team's own training run.
- Test suites and an end-to-end smoke script the team can run.
- Documents: this synopsis, SRS, design, research notes, README.

## 9. Risks and how the project handles them
| Risk | Handling |
|---|---|
| Model looks good on the lab data set but fails on other traffic | State this limit in the UI, reports and documents; never claim real-world accuracy |
| Class imbalance hides weak recall on rare attacks | Report per-class results, not accuracy alone |
| Assistant gives a wrong or invented answer | Answers use only retrieved passages, cite them, strip unknown citations, and say "no match" when nothing is found |
| Prompt injection through alert text or CSV values | Untrusted text is tagged and neutralised; the agent uses fixed rules, not a model; every action needs approval |
| Sensitive data sent to a third-party model | Row values off by default; notes never sent; visible warning |
| Account misuse | Hashed passwords, short-lived tokens, rate limits, strict validation, per-user data scope, audit log |

## 10. Work plan (12 phases, about 2 hours per day)
1. Foundations and repository  2. Backend and authentication  3. Data inspection and ML training  4. ML service
5. Upload and detection workflow  6. Alerts, dashboard, incidents (UI)  7. Reports and settings
8. Knowledge base and retrieval  9. Assistant  10. Controlled agent  11. Documentation and end-to-end test
12. Deployment guide and final security pass.
Phases 1-11 are written; Phase 12 is next. "Written" does not mean "run on a full stack": see the SRS, section 9.

## 11. Team roles
[fill in: who owns frontend, backend, ML, AI/documentation]

## 12. References
See `docs/research/research.md`.
