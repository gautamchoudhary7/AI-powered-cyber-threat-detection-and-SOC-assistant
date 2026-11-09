# Deploying on Render (free tier) - student demo guide

**Status: written, NOT tested.** The code changes it relies on (a shared key for the ML service) were tested only
with unit tests. Nobody has run these steps on Render yet. Render's free tier is not meant for production; it is a
way to give your teacher a public link.

## What you get and the trade-offs

| Service | Render type | Notes |
| --- | --- | --- |
| frontend | Static Site (free) | The React pages. |
| backend | Web Service (free) | Node API, talks to MongoDB Atlas. |
| ml-service | Web Service (free) | **Public address.** Protected only by `ML_INTERNAL_KEY`. |
| ai-service | Web Service (free) | **Public address.** Protected only by `INTERNAL_API_KEY`. |

- Free web services **sleep after 15 minutes without traffic** and need about a minute to wake up. Open the ML and AI
  `/health` addresses and the site about two minutes before a demo.
- Free instances have **512 MB of RAM** and lose local files on every restart. Nothing the app needs may live on disk.
- Anyone with the website address can open the login page and register. Do not put real company or personal data in it.
- Render's free tier cannot keep the ML and AI services private. That is why both must refuse requests without a key.

## Before you create anything

1. **Put the trained models on GitHub** (they are excluded by `.gitignore`; the files are small: 13 MB and 56 MB):
   ```
   cd $HOME\Downloads\cyber-threat-soc-assistant
   git add -f ml-service/models/binary ml-service/models/multiclass
   git commit -m "Add trained models for deployment"
   git push
   ```
2. **Read the library versions the models were trained with**, from `ml-service/models/binary/metadata.json`, key
   `library_versions` (python, scikit-learn, pandas, numpy, joblib). Render must install the **same** versions, or the
   model file may not load.
3. **Generate four long random values** (one per secret) and keep them in Notepad, not in chat:
   ```
   [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   ```
   You need: `JWT_SECRET`, `AI_INTERNAL_KEY` (= ai-service `INTERNAL_API_KEY`), `ML_INTERNAL_KEY`.
4. **MongoDB Atlas, Network Access:** Render's free services have no fixed address, so add `0.0.0.0/0`. The database
   is then protected by its password only: use a strong one and never reuse it.

## Create the services in this order

Use "New +" in the Render dashboard, connect the GitHub repository, choose the **Free** instance type for each.
Put every secret in the **Environment** section of the dashboard, never in the repository.

### 1. ml-service (Web Service)
| Setting | Value |
| --- | --- |
| Root Directory | `ml-service` |
| Runtime | Python 3 |
| Build Command | `pip install fastapi "uvicorn[standard]" pydantic python-dotenv pandas==<x> numpy==<x> scikit-learn==<x> joblib==<x>` (versions from step 2) |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

Environment: `PYTHON_VERSION` (the same Python version as in `metadata.json`), `ML_INTERNAL_KEY`,
`ML_REQUIRE_KEY=true`, `MAX_RECORDS=1000`, `ALLOWED_ORIGIN` (the backend address, set after step 3).

### 2. ai-service (Web Service)
| Setting | Value |
| --- | --- |
| Root Directory | `ai-service` |
| Build Command | `pip install fastapi "uvicorn[standard]" pydantic python-dotenv` (skips the heavy `chromadb`) |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

Environment: `PYTHON_VERSION`, `INTERNAL_API_KEY`, `RAG_STORE=keyword`, `LLM_PROVIDER=gemini`, `LLM_API_KEY`,
`LLM_MODEL=gemini-3.5-flash-lite`, `ALLOWED_ORIGIN` (the backend address).

### 3. backend (Web Service)
| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |

Environment: `NODE_ENV=production`, `TRUST_PROXY=1`, `MONGODB_URI` (your Atlas string), `JWT_SECRET`,
`ML_SERVICE_URL` (the ml-service address, `https://...onrender.com`, no trailing slash), `ML_INTERNAL_KEY`,
`AI_SERVICE_URL`, `AI_INTERNAL_KEY`, `ASSISTANT_ALLOW_ROW_VALUES=false`, `MAX_UPLOAD_ROWS=20000`,
`CORS_ORIGIN` (the frontend address - set it after step 4, then redeploy the backend).

### 4. frontend (Static Site)
| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

Environment: `VITE_API_BASE_URL` = the backend address (no trailing slash). This is baked in at build time, so
change it only with a new deploy.
Add a **Rewrite** rule: source `/*`, destination `/index.html`, action *Rewrite* (so page refreshes work).

Finally go back to the backend and set `CORS_ORIGIN` to the frontend address exactly (`https://name.onrender.com`,
no trailing slash), then let it redeploy.

## Check that it works
1. Open `https://<ml-service>/health` and `https://<ai-service>/health`: both should show `ok` (the first request may take a minute).
2. Open `https://<ml-service>/model/info` in the browser: it must say **Not allowed** (proves the key is enforced).
3. Open the frontend, register, log in, open System status: ML and AI should be reachable.
4. Upload the sample CSV, then ask the assistant a cited question.
5. Create an admin the usual way, from your own computer: `npm run set-role -- your@email.com admin` in `backend`, with the same `MONGODB_URI`.

## If something goes wrong
| Symptom | Likely cause |
| --- | --- |
| Login page says it cannot reach the server | `VITE_API_BASE_URL` wrong, or the backend is still waking up |
| Browser error mentioning CORS | `CORS_ORIGIN` is not exactly the frontend address |
| ML service logs an error loading the model | library versions differ from `metadata.json`, or the model files are not in GitHub |
| ML service restarts or "out of memory" | the model plus libraries exceed 512 MB: lower `MAX_RECORDS`, or move to a paid instance |
| System status says the ML/AI service refused the request | the key differs between the backend and that service |
| Everything slow after a quiet period | free services were asleep; wait a minute and retry |
