"""Configuration for the AI service, read from environment variables (.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def _path(name: str, default: str) -> Path:
    p = Path(os.getenv(name, default))
    return p if p.is_absolute() else BASE_DIR / p


KNOWLEDGE_DIR = _path("KNOWLEDGE_DIR", "knowledge")
CHROMA_PATH = _path("CHROMA_PATH", "chroma_db")
INDEX_MANIFEST = _path("INDEX_MANIFEST", "index_manifest.json")

# "chroma" (vector search, the intended store) or "keyword" (pure-Python BM25, needs no extra packages).
STORE = os.getenv("RAG_STORE", "chroma").strip().lower()

CHUNK_CHARS = int(os.getenv("CHUNK_CHARS", "1200"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))
MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(2 * 1024 * 1024)))
MAX_QUERY_CHARS = 500
MAX_CHAT_CHARS = 1000  # general chat accepts longer questions than the cited mode
MAX_TOP_K = 10
MAX_CASE_SECTIONS = 5

ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5000")

# Matches scoring at or below this are dropped. 0 keeps every match. For the keyword store a score is already
# 0 when no word is shared. For the chroma store the nearest chunks are always returned, even if they are
# unrelated, so a threshold should be tuned on real questions (it has NOT been tuned: no real run was possible).
MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0"))

# ---- language model (Phase 9) ----
# The key lives only in ai-service/.env, which git ignores. Without a key the assistant still works in a
# reduced way: it returns the matching passages and says no answer was written.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
# Model names change over time. This default is the name used in Google's documentation when this was written
# and was NOT verified against your key. If you get "model not found", pick a current model in Google AI Studio.
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-3.8-flash").strip()
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "30"))
LLM_MAX_OUTPUT_TOKENS = int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "700"))

# Our backend must send this in the x-internal-key header. Without it the assistant endpoint refuses to work,
# because every call can spend money or quota. Use a long random value (see .env.example).
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "").strip()
