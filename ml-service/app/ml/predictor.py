"""Load a trained model and make predictions for incoming records.

Inference goes through the SAME coerce_features() and the SAME fitted preprocessing pipeline that
training used, so the model always sees data prepared exactly as it was during training.

SECURITY NOTE: model files are loaded with joblib, which uses pickle. Loading a pickle can run
code, so only ever load model files this project trained itself. The path is fixed in config (never
taken from a request), and the file's SHA-256 is checked against metadata.json before loading.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.ml.preprocessing import MissingColumnsError, coerce_features
from app.ml.schema import FeatureSchema
from app.ml.train import sha256_file

REQUIRED_METADATA_KEYS = ("model_version", "task", "schema", "class_names", "model_sha256")
SCALAR_TYPES = (str, int, float, bool, type(None))
MAX_LISTED_COLUMNS = 50


class ModelNotConfigured(Exception):
    """No trained model files exist yet."""


class ModelLoadError(Exception):
    """Model files exist but cannot be trusted or loaded."""


class InvalidRecords(ValueError):
    """The records sent for prediction are not valid for this model."""

    def __init__(self, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


class Predictor:
    def __init__(self, pipeline: Any, metadata: dict[str, Any]):
        self.pipeline = pipeline
        self.metadata = metadata
        self.schema = FeatureSchema.from_dict(metadata["schema"])
        self.class_names: list[str] = list(metadata["class_names"])
        self.task: str = metadata["task"]
        self.positive_index: int | None = metadata.get("positive_class_index")

    @property
    def version(self) -> str:
        return self.metadata["model_version"]

    @classmethod
    def load(cls, model_file: Path, metadata_file: Path) -> "Predictor":
        model_file, metadata_file = Path(model_file), Path(metadata_file)
        if not (model_file.is_file() and metadata_file.is_file()):
            raise ModelNotConfigured("No trained model found.")
        try:
            metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
            missing = [k for k in REQUIRED_METADATA_KEYS if k not in metadata]
            if missing:
                raise ModelLoadError(f"metadata.json is missing keys: {missing}")
            if sha256_file(model_file) != metadata["model_sha256"]:
                raise ModelLoadError("Model file does not match its recorded checksum.")
            pipeline = joblib.load(model_file)
            return cls(pipeline, metadata)
        except ModelLoadError:
            raise
        except Exception as exc:
            raise ModelLoadError(f"Model could not be loaded ({type(exc).__name__}).") from exc

    # ------------------------------------------------------------------------------------------
    def _to_frame(self, records: list[dict[str, Any]]) -> pd.DataFrame:
        if not records:
            raise InvalidRecords("empty_request", "At least one record is required.")
        for i, record in enumerate(records):
            if not isinstance(record, dict):
                raise InvalidRecords("invalid_record", f"Record {i} must be an object of column: value pairs.")
            for key, value in record.items():
                if not isinstance(key, str) or not isinstance(value, SCALAR_TYPES):
                    raise InvalidRecords(
                        "invalid_record",
                        f"Record {i} has a value that is not a plain number, text or null (column '{key}').",
                    )
        return pd.DataFrame(records)

    def predict(self, records: list[dict[str, Any]]) -> dict[str, Any]:
        df = self._to_frame(records)
        try:
            X, issues = coerce_features(df, self.schema)
        except MissingColumnsError as exc:
            raise InvalidRecords(
                "missing_columns",
                "Records are missing columns the model requires.",
                {"missing_columns": exc.columns[:MAX_LISTED_COLUMNS], "total_missing": len(exc.columns)},
            ) from exc
        if issues["invalid_numeric_count"]:
            raise InvalidRecords(
                "invalid_values",
                "Some numeric columns contain values that are not numbers.",
                {"count": issues["invalid_numeric_count"], "examples": issues["invalid_numeric"]},
            )

        proba = np.asarray(self.pipeline.predict_proba(X))
        predicted = proba.argmax(axis=1)

        results: list[dict[str, Any]] = []
        for i, idx in enumerate(predicted):
            label = self.class_names[int(idx)]
            if self.task == "binary":
                results.append(
                    {
                        "index": i,
                        "label": label,
                        "is_attack": bool(int(idx) == self.positive_index),
                        "attack_probability": round(float(proba[i, self.positive_index]), 6),
                    }
                )
            else:
                results.append({"index": i, "label": label, "confidence": round(float(proba[i, int(idx)]), 6)})

        warnings: list[str] = []
        ignored = [c for c in df.columns if c not in set(self.schema.features)]
        if ignored:
            warnings.append(f"Ignored {len(ignored)} column(s) the model does not use: {ignored[:MAX_LISTED_COLUMNS]}")
        if issues["missing_cells"]:
            warnings.append(f"{issues['missing_cells']} missing value(s) were filled using training-data statistics.")
        if issues["non_finite_replaced"]:
            warnings.append(f"{issues['non_finite_replaced']} infinite value(s) were treated as missing.")
        for col, values in issues["unseen_categories"].items():
            warnings.append(f"Column '{col}' contains categories never seen in training: {values}")

        return {"model_version": self.version, "task": self.task, "count": len(results),
                "results": results, "warnings": warnings}

    def info(self) -> dict[str, Any]:
        """Everything that is safe and useful to show about the model (no file paths)."""
        return dict(self.metadata)
