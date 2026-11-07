"""Configuration for the ML service, read from environment variables (.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = Path(os.getenv("MODEL_DIR", str(BASE_DIR / "models")))
if not MODEL_DIR.is_absolute():
    MODEL_DIR = BASE_DIR / MODEL_DIR

REPORTS_DIR = BASE_DIR / "reports"

# Detection model: binary, "is this flow normal or an attack?"
MODEL_FILE = MODEL_DIR / "binary" / "model.joblib"
METADATA_FILE = MODEL_DIR / "binary" / "metadata.json"

# Optional category model: "which attack category does this flow resemble?"
CATEGORY_MODEL_FILE = MODEL_DIR / "multiclass" / "model.joblib"
CATEGORY_METADATA_FILE = MODEL_DIR / "multiclass" / "metadata.json"

ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5000")

# Largest number of records accepted by one POST /predict call.
MAX_RECORDS = int(os.getenv("MAX_RECORDS", "5000"))
