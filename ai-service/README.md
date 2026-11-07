# ai-service (Phases 8 and 9: knowledge base, cited search and the assistant)

A small FastAPI service that (1) finds passages in a folder of reference documents and returns them **with their
source**, and (2) asks Google Gemini to write a short answer to a question using only those passages and the case
data our backend sends, with source labels like `[S1]` that are checked afterwards.

## Run it

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                 # Windows: copy .env.example .env
python -m app.ingest                 # builds the index from knowledge/
uvicorn app.main:app --port 8001 --reload
```

Port 8001 is used because the ML service uses 8000. Docs page: http://localhost:8001/docs

For the assistant, edit `.env`: set `LLM_API_KEY` (from https://aistudio.google.com/), set `INTERNAL_API_KEY` to a long
random value, and put the same value in the backend's `AI_INTERNAL_KEY`. With no `LLM_API_KEY` the assistant still
works in a reduced way: it returns the matching passages and says no answer was written. With no `INTERNAL_API_KEY`
the assistant endpoints refuse every request. `LLM_MODEL` defaults to `gemini-3.8-flash`, a name taken from Google's
documentation and not tried against a real key; if you see "model not found", choose a current model in AI Studio.

The default store is ChromaDB. The first time it embeds text it downloads a small embedding model, so that first
run needs internet. If you only want to try things without that, set `RAG_STORE=keyword` in `.env`
(plain word matching, no download, rebuilt in memory when the service starts).

## Adding knowledge

See `knowledge/README.md`. Each file needs a source header (`title`, `publisher`, `url`); files without one are
skipped and listed, so every result always carries a citation. Re-run `python -m app.ingest` after changing files.
Only one file ships here: the team's own study notes, labelled as such. No NIST, CISA or MITRE text is bundled.

## API

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/health` | Is the service up |
| GET | `/knowledge/status` | Whether an index exists, which store, how many documents and chunks, which sources, and which files were skipped and why |
| POST | `/assistant/ask` | Needs the `x-internal-key` header. Body `{ question, case_data?, hint?, top_k? }`. Searches, then (if a key is set) asks the model. Returns `answer` (or null), `generated`, `sources` (with `cited` flags), `notes`, `model` |
| GET | `/assistant/status` | Needs the `x-internal-key` header. Whether a model is configured |
| POST | `/search` | Body `{ "query": "...", "top_k": 4 }` (query 1 to 500 characters, `top_k` 1 to 10). Returns passages with `title`, `publisher`, `url`, `reference`, `section`, `snippet`, `score` |

Honest behaviour: an empty knowledge base returns **503** with instructions, a question that matches nothing returns
an **empty list** (callers must say "nothing found", never guess), and a missing `chromadb` package returns 503 with
the reason. Scores are only comparable within one store and are **not** probabilities.

## How it works

1. `app/rag/documents.py` reads `.md` and `.txt` files and refuses any without a source header.
2. `app/rag/chunker.py` cuts text into pieces of at most 1200 characters with a 150-character overlap. Every heading
   starts a new piece, so the "section" shown in a citation matches its text.
3. `app/rag/stores.py` has two stores with the same interface: `ChromaStore` (vector search) and `KeywordStore`
   (BM25 word matching in plain Python; it cannot match synonyms).
4. `app/rag/retriever.py` validates the question, searches and attaches the citation to each passage.

The assistant (`app/assistant/`): `prompt.py` wraps the question, case data and passages in tags after shortening
them, stripping control characters and replacing angle brackets; `llm.py` is a Gemini client written with the
standard library (the key goes in a header and is removed from any error text); `answer.py` removes citation labels
that do not exist and marks which passages were cited. It never invents an answer: with no model it returns the
passages only, and with no matching passage and no case data it declines. Failures become named errors (rate limit
429, blocked 422, wrong key or model 503, unreachable 502).

Security notes: retrieved passages are **untrusted data** (a document could contain text that looks like
instructions). Nothing here executes or obeys them, and they are kept separate from the assistant's instructions. The service has
no user accounts: the assistant endpoints require the shared secret `INTERNAL_API_KEY` (compared in constant time),
and the service should still not be exposed to the internet. Anything sent to the model leaves your machine and goes to
Google; see the privacy notes in the main README.

## Tests

```bash
python -m pytest
```

`tests/test_api.py` is skipped automatically if `fastapi` is not installed.
