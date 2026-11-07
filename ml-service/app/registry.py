"""Finds and caches the trained models so every request does not reload them from disk."""
from __future__ import annotations

from pathlib import Path

from app import config
from app.ml.predictor import ModelLoadError, ModelNotConfigured, Predictor

_cache: dict[str, tuple[tuple, Predictor]] = {}


def _signature(*paths: Path) -> tuple:
    return tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in paths)


def _get(kind: str, model_file: Path, metadata_file: Path, expected_task: str) -> Predictor:
    model_file, metadata_file = Path(model_file), Path(metadata_file)
    if not (model_file.is_file() and metadata_file.is_file()):
        _cache.pop(kind, None)
        raise ModelNotConfigured(kind)
    signature = _signature(model_file, metadata_file)
    cached = _cache.get(kind)
    if cached and cached[0] == signature:
        return cached[1]
    predictor = Predictor.load(model_file, metadata_file)  # may raise ModelLoadError
    if predictor.task != expected_task:
        raise ModelLoadError(f"Expected a {expected_task} model but found a {predictor.task} model.")
    _cache[kind] = (signature, predictor)
    return predictor


# Paths are read from config at call time (not import time) so tests can point them elsewhere.
def get_detector() -> Predictor:
    """The binary model: normal or attack. Raises ModelNotConfigured / ModelLoadError."""
    return _get("detector", config.MODEL_FILE, config.METADATA_FILE, "binary")


def get_category_model() -> Predictor:
    """The optional attack-category model. Raises ModelNotConfigured / ModelLoadError."""
    return _get("category", config.CATEGORY_MODEL_FILE, config.CATEGORY_METADATA_FILE, "multiclass")


def detector_status() -> dict:
    """Honest status for /health: never reports 'loaded' unless the model really loaded."""
    status = {"model_loaded": False, "detection": "not configured (no trained model found)",
              "model_version": None, "category_model_loaded": False}
    try:
        detector = get_detector()
        status.update(model_loaded=True, detection="configured", model_version=detector.version)
    except ModelNotConfigured:
        pass
    except ModelLoadError:
        status["detection"] = "error (model files exist but could not be loaded)"
    try:
        get_category_model()
        status["category_model_loaded"] = True
    except (ModelNotConfigured, ModelLoadError):
        pass
    return status


def clear_cache() -> None:
    _cache.clear()
