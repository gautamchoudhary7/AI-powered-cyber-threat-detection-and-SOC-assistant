# Security Review (Phase 12)

**Scope:** the code in this repository as of Phase 12. **Method:** reading the code and configuration, pattern searches
(dangerous functions, unscoped database queries, logging of data, secrets), and running the tests that can run in the
build sandbox. **This is a self-review by the author, not an independent audit or penetration test.** It cannot find
what it did not look for, and nothing here was tested against a running system.

## 1. What was checked and what was found

| # | Check | Result |
|---|---|---|
| 1 | Secrets in the tree (API keys, private keys, database URLs with passwords, GitHub tokens), `.env` files | None found. Only the placeholder `mongodb+srv://USER:PASSWORD@...` in the README. `.env*` is git-ignored except `.env.example`. |
| 2 | Dangerous functions (`eval`, `Function`, `child_process`, `exec`, `$where`, `pickle`, `yaml.load`, `subprocess`, `os.system`) | None in the application code. One intended `joblib.load` of model files (pickle), documented as "load only models you trained". |
| 3 | Every database read/write in controllers, services, middleware | Each is scoped by owner (`scopeFor`, `findScopeFor`, `ownerScope`, `dataScope`) or checked against the owner/admin rule right after the lookup (jobs). Alerts fetched through an incident's link list rely on the incident having been scope-checked, and links are validated against the creator's own alerts when made. No unscoped query found. |
| 4 | Operators in queries | Internal operators are wrapped with `mongoose.trusted(...)`; user input is rejected by the sanitiser if it contains `$` or `.` keys, and `sanitizeFilter` is on. |
| 5 | Error handling | Clients get safe messages only. Server logs carry error names, not bodies, tokens or the connection string. |
| 6 | Logging of sensitive data | No request bodies, passwords, tokens or question text are logged. Audit entries hold ids and metadata. |
| 7 | Auth | bcrypt (rounds 10-15, default 12), generic login error, dummy hash for unknown emails, JWT HS256 1 h, role re-read per request, tokens older than a password change are rejected, strict schemas, rate limits. |
| 8 | Upload | random server-side file name, 20 MB limit while streaming, one file, no extra fields, extension and MIME first filter, header checked against model columns, file deleted after use, 0700 upload folder, concurrency guard. |
| 9 | Frontend | No `dangerouslySetInnerHTML`; server text is rendered as React text; external links use `rel="noopener noreferrer"`. |
| 10 | Service-to-service | AI service requires a shared key (constant-time compare). ML service has no authentication (see risk R1). |
| 11 | Agent | fixed rules, three whitelisted actions, strict params, atomic approval, re-validation, approver's own scope, audit log, kill switch. |

## 2. Fixes made in Phase 12

| ID | Problem found | Fix | Verified how |
|---|---|---|---|
| S-1 | **No way to configure `trust proxy`.** Behind nginx or any load balancer every user would share the proxy's address, so one person's failed logins could lock out everybody, and audit logs would store the wrong IP. | New `TRUST_PROXY` setting (number of proxies, default 0). `true`, addresses and other values are rejected at start-up because trusting too many proxies lets clients forge their IP. Files: `utils/trustProxy.js`, `config.js`, `app.js`, `.env.example`. | 3 test cases (`trustProxy.test.js`) pass under the stand-in runner and fail when the parser is broken on purpose; config start-up check run directly with `TRUST_PROXY=true` (rejected) and `=1` (accepted). **Not tested behind a real proxy.** |
| S-2 | **Placeholder shared secret accepted.** If both `.env.example` files were copied unchanged, the AI service would accept the public placeholder as its key. | The AI service now refuses to run the assistant when `INTERNAL_API_KEY` starts with "replace" or is shorter than 16 characters (same response as "not configured"). Files: `ai-service/app/security.py`, `.env.example`. | 5 new pytest cases pass; whole ai-service suite 90 passed, 1 skipped. |

| S-3 | **csv-parse advisory (GHSA-8cw4-87c7-c6xx, moderate):** `npm audit --omit=dev` flagged csv-parse 5.x. Our code builds one object per CSV row from the untrusted header. (The advisory page could not be opened, so the details are unconfirmed.) | Headers named `__proto__`, `constructor` or `prototype` are rejected at upload with a clear message. The package was **not** upgraded (7.x is a breaking change). | 1 new test (16 pass under the stand-in runner). Not re-audited; the advisory still shows in `npm audit` until csv-parse is upgraded. |
| S-4 | **zod advisory (high, GHSA-mrhx-c7xc-m3w5):** memory use when validating very large arrays with no length limit. Affected and patched versions are listed as "unknown"; the advisory is unreviewed. | No change. Every array in our validators has a maximum (100), the JSON body is limited to 100 KB, and the fix would need zod 4, which breaks our schemas. | Checked by reading all `z.array` uses. Revisit when a zod 3.x fix or a planned migration exists. |
| S-5 | **react-router advisories (moderate, `npm audit --omit=dev` on the frontend, 7 Nov 2026):** (a) open redirect through a backslash in `<Link>` / `useNavigate` (GHSA-wrjc-x8rr-h8h6) and (b) constructor injection in `deserializeErrors()` during **server-side rendering** hydration (GHSA-337j-9hxr-rhxg). The audit's only fix is react-router-dom 7, a breaking change. | (b) does not apply: the app is a client-only Vite single-page app with no server rendering. (a) is unlikely to be reachable: every `navigate()` goes to an in-app path built from server-issued ids, and the only user-influenced destination is the "return to the page you wanted" path after login, which only comes from our own protected routes. As defence in depth that path now passes through `safeDestination()` (`frontend/src/utils/safeRedirect.js`), which accepts only plain in-app paths (a unit-tested allow-list). | Upgrade to react-router-dom 7 when convenient, and rerun the frontend tests. Not done here because it is a breaking change that could not be tested in the workspace. |
| S-6 | **chromadb advisories (5 findings, `pip-audit`, 7 Nov 2026; PYSEC-2026-311, -3813, -3814, -3815):** reported against chromadb up to 1.5.9; no fixed version was listed in the audit output. The advisory I could read (PYSEC-2026-3814, critical) describes code injection through the Chroma **HTTP server** API by a user with permission to update collections. | chromadb is **optional**: the team runs `RAG_STORE=keyword`, so it is installed but never used. When selected, `ChromaStore` uses the embedded `PersistentClient`, not a Chroma server, and the project starts no Chroma server. I could read only one of the advisories, and it does not say whether the embedded client is affected, so this is not proof of safety. | Keep `RAG_STORE=keyword`, never expose a Chroma server, and recheck `pip-audit` before choosing chroma. Uninstall chromadb if it is not needed. |

## 3. Open risks (not fixed; read these)

| ID | Risk | Why it is open | What reduces it |
|---|---|---|---|
| R1 | **ML service has no authentication.** Anyone who can reach port 8000 can call `/predict` and read `/model/info`. | It is designed as an internal service. | Bind to 127.0.0.1, firewall, never publish the port (deployment guide, sections 1, 5.1 and 8). |
| R2 | **Token in `sessionStorage`.** A cross-site-scripting bug would expose it. | Switching to HttpOnly cookies needs CSRF protection and a redesign of the auth flow. | React's text rendering, strict CSP from nginx (deployment guide section 6), short 1 h token. No refresh tokens, so users log in again after an hour. |
| R3 | **Prompt injection cannot be eliminated.** Alert text and CSV values reach the language model. OWASP states RAG and prompt wording do not fully mitigate it. | Inherent to using a model on untrusted data. | Tagged and neutralised data, model has no tools, agent is rule-based, human approval, citations validated. **No adversarial test with a real model has been done.** |
| R4 | **Data sent to Google.** Questions and (optionally) row values leave the system. Free-tier terms say content may be used to improve products and read by reviewers. | The feature was requested by the project owner. | Row values off by default, need `ASSISTANT_ALLOW_ROW_VALUES` plus a per-question tick; notes never sent; set the switch to `false` in production. |
| R5 | **Dependencies only partly audited.** The user ran `npm audit --omit=dev` on the backend (2 findings, see S-3 and S-4; the other 20 reported by `npm audit` are outside production dependencies and have not been reviewed). Frontend `npm audit --omit=dev` (2 moderate findings, S-5) and `pip-audit` on `ai-service` (5 chromadb findings, S-6) were run on 7 Nov 2026. `pip-audit` for `ml-service` has not been run. | Registries were blocked in the build sandbox. | Run the missing audits; commit the lock files; update. |
| R6 | **Register reveals whether an email exists (HTTP 409).** | Needed for a usable sign-up form. | Auth rate limit (20 per 15 min per IP by default). |
| R7 | **Rate limits are in memory and per process.** Restarting resets them; two processes would each count separately. | Simplicity. | Run one backend process. A shared store (Redis) is future work. |
| R8 | **Unbounded notes per incident.** Each note is limited to 5,000 characters but the count is not, so a user could grow one incident document toward MongoDB's 16 MB limit. Only the account owner is affected. | Low impact. | Add a cap (for example 500 notes) if the project continues. |
| R9 | **`/api/health` and `/api/health/ml` need no login.** They reveal that the service is up and whether the model is loaded. | Needed for uptime checks. | Global rate limit; keep the response minimal. |
| R10 | **No account lockout, email verification or password reset.** | Out of scope for the project. | Rate limit; long password rule; an admin can disable a user in the database (`isActive`). |
| R11 | **Backups, disk encryption, log shipping, alerting** are the operator's job. | Infrastructure. | Deployment guide sections 4 and 11. |
| R12 | **Background analysis runs inside the web process.** A crash loses the in-flight job (it is marked failed on restart). | Simplicity. | Upload again; a queue and worker are future work. |
| R13 | **Knowledge base content is trusted.** A poisoned document in `ai-service/knowledge/` would be served as authoritative. | Only the team writes to that folder. | Restrict write access to the folder; review each document's front matter and source. |
| R14 | **General chat sends free text to Google and returns unverified answers.** There is no source check, so the model can be wrong or out of date, and a user can type sensitive text into the question. It uses the same free-tier quota as the cited mode. | Requested feature; labelled in the UI and API (`mode: "general"`); only the question is sent (no records, no row values); question text not audited; same rate limit as other assistant routes; kill switch `ASSISTANT_GENERAL_CHAT=false`. | Keep it off for any deployment that handles real company or personal data; tell users not to type such data; a content filter and per-user quotas are future work. |

## 4. What has not been tested at all
- Any request to a running server (so every header, limit and rejection above is verified by reading and by mocked tests only).
- The Jest and Vitest suites, ChromaDB, real MongoDB queries (the backend tests mock the models), real Gemini calls.
- Load, denial-of-service resistance, file-upload fuzzing, penetration testing, accessibility.

## 5. Checklist to run before presenting or deploying
- [ ] `npm test` (backend, frontend) and `pytest` (ml-service, ai-service) pass on your machine.
- [ ] `npm audit` and `pip-audit` reviewed (backend, frontend and `ai-service` done and assessed, S-3 to S-6; `ml-service` `pip-audit` still to do; the react-router 7 upgrade is not done).
- [ ] `grep -r` for your real keys in the repository shows nothing; `git log -p` contains no `.env`.
- [ ] `JWT_SECRET`, `INTERNAL_API_KEY`/`AI_INTERNAL_KEY` are freshly generated on the server.
- [ ] `NODE_ENV=production`, `CORS_ORIGIN` exact, `TRUST_PROXY=1` behind nginx, HTTPS on.
- [ ] Ports 5000, 8000, 8001 and 27017 are not reachable from outside (test from another network).
- [ ] MongoDB authentication is on.
- [x] Two-account check: no cross-user access to jobs, alerts, incidents, reports, suggestions. **Done by hand on 6 Nov 2026** (team-reported, no screenshots kept): a second, newly registered account saw an empty dashboard, alerts, incidents and reports, "not found" when opening the first account's alert, incident and report addresses, and nothing from the first account's data after "Scan for suggestions". One pair of accounts and the pages listed; direct API calls with a second token (for example with curl) and the assistant routes were not tried.
- [ ] Wrong-columns CSV rejected; over-size CSV rejected; a file with `=cmd|...` cells downloads with those cells neutralised.
- [ ] Agent: nothing changes until Approve; kill switch works.
- [ ] Try a few prompt-injection strings in an alert field with a real key; record what the assistant does.
