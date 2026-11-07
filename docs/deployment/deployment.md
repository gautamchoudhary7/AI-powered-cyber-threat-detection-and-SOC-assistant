# Deployment Guide

> **Status: written, never executed.** The author had no server, no Docker, no nginx and no internet access to the
> package registries while writing this. Every command below is standard practice but **untested together**. Do a
> trial run on a throw-away virtual machine first and fix this document with whatever you learn.
> This project is a college project. Do not put real company traffic or personal data in it (see the privacy
> notes in the README and `docs/research/research.md`).

## 1. What you are deploying

| Program | Port | Who may reach it |
|---|---|---|
| nginx (or another web server) | 443 (and 80 to redirect) | the internet |
| frontend (static files built by Vite) | served by nginx | via nginx |
| backend (Express) | 5000 | **only nginx on the same machine** |
| ml-service (FastAPI) | 8000 | **only the backend** |
| ai-service (FastAPI) | 8001 | **only the backend** |
| MongoDB | 27017 | **only the backend** |

Important: the ML service has **no login**, and the AI service only has a shared key. Neither is meant to be reachable
from the internet. Bind them to `127.0.0.1` and open no firewall port for them.

## 2. Pick a layout
The simplest layout is **one Linux VM** (Ubuntu LTS, 2 vCPU, 4 GB RAM is a reasonable starting guess, not a measured
requirement) running everything. A free-tier cloud VM or a college server is enough for a demo. Managed alternatives
(MongoDB Atlas for the database) are fine; then skip section 4 and put the Atlas string in `MONGODB_URI`.

## 3. Before you start: decisions and secrets
Create these values **on the server only** (never in git, chat or screenshots). Generate each one fresh:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"      # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" # INTERNAL_API_KEY / AI_INTERNAL_KEY (same value in both)
```
You also need: a domain name pointing to the VM, and (optional) a Google AI Studio key for `LLM_API_KEY`.

## 4. MongoDB with authentication
1. Install MongoDB (follow MongoDB's current instructions for your OS).
2. Keep it bound to `127.0.0.1` (the default `bindIp`). Do not open port 27017 in the firewall.
3. Turn on authentication (`security.authorization: enabled` in the MongoDB config), create one user that has
   `readWrite` on the `soc_assistant` database only, and use it in:
   `MONGODB_URI=mongodb://USER:PASSWORD@127.0.0.1:27017/soc_assistant?authSource=admin` (adjust `authSource` to where you created the user).
   URL-encode special characters in the password.
4. Make a backup plan (`mongodump` on a schedule). Alerts contain network row values such as IP addresses; treat
   backups as sensitive.

## 5. Install the services
Create an unprivileged user (for example `soc`) and clone the repository into `/opt/soc`. Run the services as that
user, not as root.

### 5.1 ML service
```
cd /opt/soc/ml-service
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # keep HOST=127.0.0.1
```
Train on the real data **on a trusted machine** (see the README, "Machine learning") and copy `models/binary` (and
`models/multiclass`) to the server. **Only load model files that you trained yourself.** They are `joblib`/pickle files and
loading a pickle can run code.
Start: `uvicorn app.main:app --host 127.0.0.1 --port 8000` (no `--reload` in production).
Check: `curl http://127.0.0.1:8000/health` must show a trained model, otherwise uploads return HTTP 503 (by design).

### 5.2 AI service
```
cd /opt/soc/ai-service
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```
Edit `.env`: `INTERNAL_API_KEY` (16+ characters; the placeholder is refused on purpose), `LLM_API_KEY` if you want written
answers, `LLM_MODEL` set to a model your key can use, `RAG_STORE=keyword` if you did not install ChromaDB.
Put real reference documents in `knowledge/` (see `knowledge/README.md`), then `python -m app.ingest`.
Start: `uvicorn app.main:app --host 127.0.0.1 --port 8001`.

### 5.3 Backend
```
cd /opt/soc/backend
npm ci --omit=dev
cp .env.example .env
```
Edit `.env` (the full list is in `.env.example`). The ones that matter for production:

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your authenticated string |
| `JWT_SECRET` | the generated value (the server refuses to start with a short or placeholder one) |
| `CORS_ORIGIN` | exactly `https://your-domain` (no trailing slash) |
| `TRUST_PROXY` | `1` when nginx is the only proxy in front. Without it, all users share one rate limit and audit logs show 127.0.0.1 |
| `AI_INTERNAL_KEY` | same value as the AI service's `INTERNAL_API_KEY` |
| `ASSISTANT_ALLOW_ROW_VALUES` | `false` unless you have decided that sending raw row values to Google is acceptable |
| `AUTH_RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_MAX`, `ASSISTANT_RATE_LIMIT_MAX` | keep the defaults unless you have a reason |
| `UPLOAD_DIR` | a folder only the `soc` user can read, on a disk with free space |

Start: `node src/server.js` (or `npm start`). Check `curl http://127.0.0.1:5000/api/health`.
The rate-limit counters live in memory, so run **one** backend process. A second process would have its own counters.

### 5.4 Frontend (build once, serve as static files)
```
cd /opt/soc/frontend
cp .env.example .env
# set VITE_API_BASE_URL=https://your-domain   (it is baked into the build; an empty value falls back to localhost)
npm ci && npm run build
```
Copy `dist/` to the web root, for example `/var/www/soc`. Only `VITE_` variables reach the browser; never put a
secret there.

## 6. nginx and HTTPS (example, untested)
```
server {
    listen 80;
    server_name your-domain;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name your-domain;
    # certificate lines are added by certbot (Let's Encrypt) or your college's certificate

    client_max_body_size 21m;               # the backend limit is 20 MB; nginx must allow a little more

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" always;

    root /var/www/soc;
    index index.html;
    location / { try_files $uri /index.html; }      # single-page app: unknown paths load index.html

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;   # one hop, matches TRUST_PROXY=1
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```
Notes: the Content-Security-Policy above is a starting point. Test it in the browser console and adjust; Tailwind may need
`'unsafe-inline'` for styles. The CSP matters because the login token is kept in `sessionStorage`, which any injected script
could read. Because `X-Forwarded-For` is **set** (not appended) by nginx, a client cannot forge it.

## 7. Run the services reliably (systemd example, untested)
One unit per service. Example for the backend (`/etc/systemd/system/soc-backend.service`):
```
[Unit]
Description=SOC backend
After=network.target mongod.service

[Service]
User=soc
WorkingDirectory=/opt/soc/backend
EnvironmentFile=/opt/soc/backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```
Make similar units for the two Python services (`ExecStart=/opt/soc/ml-service/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000`, and the same for the AI service on 8001). Then
`sudo systemctl enable --now soc-backend` and so on. Set file permissions so only `soc` can read the `.env` files (`chmod 600`).
If the backend restarts while a file is being analysed, that job is marked failed at the next start (by design); the user uploads again.

## 8. Firewall
Allow only SSH (ideally from your own IP), 80 and 443. Everything else stays closed. On Ubuntu: `ufw default deny incoming`,
`ufw allow OpenSSH`, `ufw allow 80,443/tcp`, `ufw enable`. Confirm from another machine that ports 5000, 8000, 8001 and 27017 are **not** reachable.

## 9. First admin and first checks
1. Register normally in the web app (everyone becomes an analyst).
2. On the server: `cd /opt/soc/backend && npm run set-role -- <email> admin`.
3. Run the smoke test from your own machine against the public URL: `API_URL=https://your-domain node tests/e2e/smoke.mjs --csv <real file>`
   (set `ML_URL` only if you can reach the ML service; otherwise the first two steps fail by design). It creates a test
   user in the production database, so prefer running it against a staging copy.
4. Check by hand with two accounts that one cannot see the other's alerts, incidents, reports or suggestions.
5. Try the kill switch: set `AGENT_ENABLED=false`, restart, confirm the Suggestions page says it is off.

## 10. Updating and rolling back
`git pull`, `npm ci`, rebuild the frontend, restart the services. Before updating, take a `mongodump`. Keep the previous
`dist/` folder so you can switch back. There are no database migrations in this project; schema changes mean new
fields only, so older documents keep working, but this has not been tested across versions.

## 11. Logs and monitoring
The backend logs only error names and messages, never request bodies, passwords or tokens. Use `journalctl -u soc-backend`.
The audit log is in the `auditlogs` collection (no UI exists for it yet). Nothing here sends alerts to you if a service
dies: add an uptime check on `/api/health` and `/api/health/ml` (the second one shows whether the model is loaded).

## 12. Troubleshooting
| Symptom | Likely cause |
|---|---|
| Backend exits at start, "Invalid configuration" | `JWT_SECRET` short/placeholder, or `TRUST_PROXY` not a whole number |
| Login works in dev, "Network error" in production | `VITE_API_BASE_URL` wrong at build time, or `CORS_ORIGIN` not exactly the page's origin |
| Everyone gets "Too many attempts" | `TRUST_PROXY` not set behind nginx |
| Upload returns 503 | ML service down or no trained model (`/api/health/ml`) |
| Upload returns 413 | `client_max_body_size` smaller than the file, or file over 20 MB |
| Assistant says "unavailable" | AI service down, or `INTERNAL_API_KEY` placeholder/short (service refuses), or keys differ |
| Assistant gives passages but no written answer | `LLM_API_KEY` empty, or the model name is not valid for your key |
