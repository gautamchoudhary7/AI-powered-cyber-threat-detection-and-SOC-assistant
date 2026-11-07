"""The feature schema: which columns the model uses and what type each one is.

The schema is INFERRED from the training data (nothing is hardcoded) and then saved next to the
model, so inference validates incoming records against exactly what the model was trained on.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

import numpy as np
import pandas as pd

# Remember the known category values for warnings about unseen categories, unless a column
# has too many distinct values (then the warning would be noise and the list too large).
MAX_STORED_CATEGORIES = 500


def normalize_category_value(value: Any) -> Any:
    """Missing stays missing (NaN); everything else becomes a stripped string."""
    if value is None:
        return np.nan
    if isinstance(value, float) and np.isnan(value):
        return np.nan
    if value is pd.NA or value is pd.NaT:
        return np.nan
    return str(value).strip()


@dataclass
class FeatureSchema:
    numeric: list[str]
    categorical: list[str]
    target: str
    excluded: list[str] = field(default_factory=list)  # columns deliberately NOT used as features
    categories: dict[str, list[str]] = field(default_factory=dict)  # known values per categorical column

    @property
    def features(self) -> list[str]:
        return [*self.numeric, *self.categorical]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FeatureSchema":
        return cls(
            numeric=list(data["numeric"]),
            categorical=list(data["categorical"]),
            target=str(data["target"]),
            excluded=list(data.get("excluded", [])),
            categories={k: list(v) for k, v in data.get("categories", {}).items()},
        )


def infer_schema(df: pd.DataFrame, target: str, exclude: Iterable[str] = ()) -> FeatureSchema:
    """Decide feature columns from the data.

    - Numeric dtype -> numeric feature; anything else -> categorical feature.
    - The target column and the `exclude` columns (ids, the other label column) are never features.
      This is what prevents label leakage.
    - Columns that are entirely empty are dropped (nothing to learn from).
    """
    if target not in df.columns:
        raise ValueError(f"Target column '{target}' not found. Available columns: {list(df.columns)}")

    excluded = [c for c in exclude if c in df.columns and c != target]
    skip = set(excluded) | {target}
    numeric: list[str] = []
    categorical: list[str] = []
    for col in df.columns:
        if col in skip:
            continue
        series = df[col]
        if series.isna().all():
            excluded.append(col)
            continue
        (numeric if pd.api.types.is_numeric_dtype(series) else categorical).append(col)

    if not numeric and not categorical:
        raise ValueError("No usable feature columns were found.")

    categories: dict[str, list[str]] = {}
    for col in categorical:
        values = {normalize_category_value(v) for v in df[col].dropna().unique()}
        if len(values) <= MAX_STORED_CATEGORIES:
            categories[col] = sorted(v for v in values if isinstance(v, str))

    return FeatureSchema(numeric, categorical, target, excluded, categories)
