"""ML service API: health, model info, and prediction."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app import config, registry
from app.errors import ApiError
from app.ml.predictor import InvalidRecords, ModelLoadError, ModelNotConfigured

app = FastAPI(title="SOC ML Service", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.ALLOWED_ORIGIN],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---- error handling -------------------------------------------------------------------------
@app.exception_handler(ApiError)
async def handle_api_error(request: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status_code, content=exc.body())


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError):
    # Only where and why; never echo the submitted values back.
    details = [{"location": [str(p) for p in e.get("loc", [])], "message": e.get("msg", "invalid")} for e in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "invalid_request", "message": "The request body is not valid.", "details": details}},
    )


def _not_configured() -> ApiError:
    return ApiError(
        503,
        "detection_not_configured",
        "Detection is not configured: no trained model was found. Train a model first (see the README).",
    )


def _load_failed() -> ApiError:
    return ApiError(500, "model_load_failed", "A model file exists but could not be loaded. Check the service logs and retrain.")


# ---- endpoints ------------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"service": "ml-service", "status": "ok", **registry.detector_status()}


@app.get("/model/info")
def model_info():
    try:
        detector = registry.get_detector()
    except ModelNotConfigured:
        raise _not_configured()
    except ModelLoadError:
        raise _load_failed()
    info: dict[str, Any] = {"detector": detector.info(), "category_model": None}
    try:
        info["category_model"] = registry.get_category_model().info()
    except (ModelNotConfigured, ModelLoadError):
        pass
    return info


class PredictRequest(BaseModel):
    """Records are flat objects of {column name: value}. Unknown extra keys inside a record are allowed
    (they are ignored and reported as a warning); required columns are checked against the model."""

    model_config = ConfigDict(extra="forbid")
    records: list[dict[str, Any]] = Field(min_length=1)


@app.post("/predict")
def predict(request: PredictRequest):
    if len(request.records) > config.MAX_RECORDS:
        raise ApiError(413, "too_many_records", f"At most {config.MAX_RECORDS} records are accepted per request.")
    try:
        detector = registry.get_detector()
    except ModelNotConfigured:
        raise _not_configured()
    except ModelLoadError:
        raise _load_failed()

    try:
        detection = detector.predict(request.records)
    except InvalidRecords as exc:
        raise ApiError(422, exc.code, exc.message, exc.details)

    # Optional second signal: which attack category does each flow resemble?
    category_block = None
    warnings = list(detection["warnings"])
    try:
        category_model = registry.get_category_model()
        category = category_model.predict(request.records)
        category_block = {"model_version": category["model_version"], "results": category["results"]}
    except (ModelNotConfigured, ModelLoadError):
        pass
    except InvalidRecords:
        warnings.append("The category model could not score these records (they do not match its schema).")

    category_by_index = {r["index"]: r for r in category_block["results"]} if category_block else {}
    results = []
    for row in detection["results"]:
        item = dict(row)
        cat = category_by_index.get(row["index"])
        item["category"] = {"label": cat["label"], "confidence": cat["confidence"]} if cat else None
        results.append(item)

    return {
        "model_version": detection["model_version"],
        "category_model_version": category_block["model_version"] if category_block else None,
        "count": detection["count"],
        "results": results,
        "warnings": warnings,
    }
