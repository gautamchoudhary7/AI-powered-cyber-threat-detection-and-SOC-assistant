"""Preprocessing shared by training AND inference.

Two steps, both used in both places so the model always sees data prepared the same way:

1. coerce_features(): pick the schema's columns, force numbers to be numbers, clean up text,
   and REPORT problems instead of hiding them.
2. build_preprocessor(): a scikit-learn transformer (fill gaps, scale numbers, one-hot encode text)
   that is fitted on the training data only, then saved inside the model file.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.ml.schema import FeatureSchema, normalize_category_value

MAX_REPORTED_ISSUES = 20


class MissingColumnsError(ValueError):
    """The data does not contain every column the model needs."""

    def __init__(self, columns: list[str]):
        super().__init__(f"Missing required columns: {columns}")
        self.columns = columns


def coerce_features(df: pd.DataFrame, schema: FeatureSchema) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Return (clean feature table in schema order, report of problems found).

    Problems are counted, never silently ignored:
    - invalid_numeric: a value in a numeric column that is not a number (e.g. "abc"). The cell is
      treated as missing, and the caller decides whether that is acceptable.
    - non_finite_replaced: inf / -inf values turned into "missing".
    - missing_cells: how many cells will be filled in by the imputer.
    - unseen_categories: category values the model never saw during training.
    """
    absent = [c for c in schema.features if c not in df.columns]
    if absent:
        raise MissingColumnsError(absent)

    issues: dict[str, Any] = {
        "invalid_numeric": [],
        "invalid_numeric_count": 0,
        "non_finite_replaced": 0,
        "missing_cells": 0,
        "unseen_categories": {},
    }
    data: dict[str, Any] = {}

    for col in schema.numeric:
        raw = df[col]
        num = pd.to_numeric(raw, errors="coerce").astype("float64")
        bad = (raw.notna() & num.isna()).to_numpy()
        if bad.any():
            issues["invalid_numeric_count"] += int(bad.sum())
            for pos in np.flatnonzero(bad)[: max(0, MAX_REPORTED_ISSUES - len(issues["invalid_numeric"]))]:
                issues["invalid_numeric"].append({"row": int(pos), "column": col, "value": str(raw.iloc[pos])[:50]})
        infinite = np.isinf(num.to_numpy())
        issues["non_finite_replaced"] += int(infinite.sum())
        num = num.mask(infinite)
        data[col] = num.to_numpy()

    for col in schema.categorical:
        values = [normalize_category_value(v) for v in df[col]]
        data[col] = pd.Series(values, dtype=object, index=df.index).to_numpy()
        known = schema.categories.get(col)
        if known is not None:
            unseen = sorted({v for v in values if isinstance(v, str)} - set(known))
            if unseen:
                issues["unseen_categories"][col] = unseen[:MAX_REPORTED_ISSUES]

    frame = pd.DataFrame(data, index=df.index, columns=schema.features)
    issues["missing_cells"] = int(frame.isna().sum().sum())
    return frame, issues


def build_preprocessor(schema: FeatureSchema) -> ColumnTransformer:
    """Unfitted preprocessing transformer. Fit it on TRAINING data only (done inside the Pipeline)."""
    transformers = []
    if schema.numeric:
        transformers.append(
            (
                "num",
                Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]),
                list(schema.numeric),
            )
        )
    if schema.categorical:
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="constant", fill_value="__missing__")),
                        # Categories never seen in training become all-zeros instead of crashing.
                        ("onehot", OneHotEncoder(handle_unknown="ignore", dtype=np.float32)),
                    ]
                ),
                list(schema.categorical),
            )
        )
    return ColumnTransformer(transformers, remainder="drop", sparse_threshold=0.3)
