"""Inspect the REAL dataset files before any preprocessing is designed.

This script assumes nothing about the schema. It reports what is actually in the files:
columns, types, missing values, duplicates, class balance, and how the training and
testing files differ (unseen categories, rows shared between the two files).

Usage (from the ml-service folder, with the virtual environment active):

    python -m app.ml.inspect_dataset \
        --train data/raw/UNSW_NB15_training-set.csv \
        --test  data/raw/UNSW_NB15_testing-set.csv

The --label-col / --category-col / --id-cols values are only used to LABEL the report
(for example "show me the class balance of this column"). The report warns you if a
named column does not exist. Check the output before training.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.ml.csvio import UnreadableTable, read_table

MAX_EXAMPLES = 3
MAX_LISTED = 20


def _kind(series: pd.Series) -> str:
    return "numeric" if pd.api.types.is_numeric_dtype(series) else "categorical"


def _distribution(series: pd.Series) -> dict[str, int]:
    return {str(k): int(v) for k, v in series.value_counts(dropna=False).items()}


def inspect_frame(
    df: pd.DataFrame,
    name: str,
    label_col: str | None = None,
    category_col: str | None = None,
    id_cols: tuple[str, ...] = (),
) -> dict[str, Any]:
    """Describe one DataFrame. Returns plain Python types so it can be saved as JSON."""
    id_present = [c for c in id_cols if c in df.columns]
    columns = []
    for col in df.columns:
        s = df[col]
        kind = _kind(s)
        info: dict[str, Any] = {
            "name": str(col),
            "dtype": str(s.dtype),
            "kind": kind,
            "missing": int(s.isna().sum()),
            "unique": int(s.nunique(dropna=True)),
            "examples": [str(v) for v in s.dropna().unique()[:MAX_EXAMPLES]],
        }
        if kind == "numeric":
            num = pd.to_numeric(s, errors="coerce").astype("float64")
            finite = num[np.isfinite(num)]
            info["inf"] = int(np.isinf(num).sum())
            if len(finite):
                info.update(min=float(finite.min()), max=float(finite.max()), mean=float(finite.mean()))
        columns.append(info)

    features_only = df.drop(columns=id_present)
    warnings: list[str] = []
    distributions: dict[str, dict[str, int]] = {}
    for role, col in (("label", label_col), ("category", category_col)):
        if not col:
            continue
        if col not in df.columns:
            warnings.append(f"The {role} column '{col}' does not exist in {name}. Check the real column names above.")
            continue
        distributions[col] = _distribution(df[col])
        raw = df[col].dropna().astype(str)
        if raw.nunique() != raw.str.strip().nunique():
            warnings.append(f"Column '{col}' has values that differ only by leading/trailing spaces. Training strips them.")
    for col in id_cols:
        if col not in df.columns:
            warnings.append(f"The id column '{col}' does not exist in {name}.")

    return {
        "name": name,
        "rows": int(len(df)),
        "n_columns": int(df.shape[1]),
        "columns": columns,
        "numeric_columns": [c["name"] for c in columns if c["kind"] == "numeric"],
        "categorical_columns": [c["name"] for c in columns if c["kind"] == "categorical"],
        "constant_columns": [c["name"] for c in columns if c["unique"] <= 1],
        "missing_cells": int(df.isna().sum().sum()),
        "duplicate_rows_all_columns": int(df.duplicated().sum()),
        "duplicate_rows_ignoring_ids": int(features_only.duplicated().sum()),
        "class_distributions": distributions,
        "warnings": warnings,
    }


def compare_frames(
    train: pd.DataFrame, test: pd.DataFrame, id_cols: tuple[str, ...] = ()
) -> dict[str, Any]:
    """Describe how the training and testing files differ."""
    id_present = {c for c in id_cols if c in train.columns or c in test.columns}
    shared = [c for c in train.columns if c in test.columns and c not in id_present]

    unseen: dict[str, Any] = {}
    for col in shared:
        if _kind(train[col]) != "categorical":
            continue
        known = set(train[col].dropna().astype(str).str.strip())
        values = test[col].dropna().astype(str).str.strip()
        mask = ~values.isin(known)
        if mask.any():
            unseen[col] = {"rows": int(mask.sum()), "values": sorted(set(values[mask]))[:MAX_LISTED]}

    overlap: int | None
    try:
        train_hash = set(pd.util.hash_pandas_object(train[shared], index=False))
        test_hash = pd.util.hash_pandas_object(test[shared], index=False)
        overlap = int(test_hash.isin(train_hash).sum())
    except Exception:  # hashing can fail on odd dtypes; the rest of the report is still useful
        overlap = None

    return {
        "columns_only_in_train": sorted(set(train.columns) - set(test.columns)),
        "columns_only_in_test": sorted(set(test.columns) - set(train.columns)),
        "same_column_order": list(train.columns) == list(test.columns),
        "test_categories_unseen_in_train": unseen,
        "test_rows_identical_to_a_train_row": overlap,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = ["# Dataset inspection report", ""]
    lines.append("Generated by `python -m app.ml.inspect_dataset`. Every number below was measured from the files.")
    lines.append("")
    for part in report["files"]:
        lines += [f"## {part['name']}", ""]
        lines.append(f"- Rows: {part['rows']:,}  |  Columns: {part['n_columns']}")
        lines.append(f"- Missing cells: {part['missing_cells']:,}")
        lines.append(f"- Duplicate rows (all columns): {part['duplicate_rows_all_columns']:,}")
        lines.append(f"- Duplicate rows (ignoring id columns): {part['duplicate_rows_ignoring_ids']:,}")
        lines.append(f"- Constant columns: {', '.join(part['constant_columns']) or 'none'}")
        for col, dist in part["class_distributions"].items():
            lines.append(f"- Distribution of `{col}`: " + ", ".join(f"{k}={v:,}" for k, v in dist.items()))
        for w in part["warnings"]:
            lines.append(f"- WARNING: {w}")
        lines += ["", "| column | kind | dtype | missing | unique | examples |", "|---|---|---|---|---|---|"]
        for c in part["columns"]:
            lines.append(
                f"| {c['name']} | {c['kind']} | {c['dtype']} | {c['missing']} | {c['unique']} | {', '.join(c['examples'])} |"
            )
        lines.append("")
    cmp = report.get("comparison")
    if cmp:
        lines += ["## Training vs testing file", ""]
        lines.append(f"- Columns only in train: {', '.join(cmp['columns_only_in_train']) or 'none'}")
        lines.append(f"- Columns only in test: {', '.join(cmp['columns_only_in_test']) or 'none'}")
        lines.append(f"- Same column order: {cmp['same_column_order']}")
        lines.append(f"- Test rows identical to a training row: {cmp['test_rows_identical_to_a_train_row']}")
        if cmp["test_categories_unseen_in_train"]:
            for col, info in cmp["test_categories_unseen_in_train"].items():
                lines.append(f"- Column `{col}`: {info['rows']:,} test rows use categories never seen in training: {info['values']}")
        else:
            lines.append("- No test categories are unseen in training.")
        lines.append("")
    return "\n".join(lines)


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    return read_table(path)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Inspect dataset CSV files and report what is actually in them.")
    p.add_argument("--train", required=True, type=Path, help="Path to the training CSV")
    p.add_argument("--test", type=Path, help="Path to the testing CSV (optional)")
    p.add_argument("--label-col", default="label", help="Name of the attack/normal column to summarise")
    p.add_argument("--category-col", default="attack_cat", help="Name of the attack-category column to summarise")
    p.add_argument("--id-cols", default="id", help="Comma-separated identifier columns (ignored when counting duplicates)")
    p.add_argument("--out-dir", type=Path, default=Path("reports"), help="Where to save the JSON and Markdown report")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    id_cols = tuple(c.strip() for c in args.id_cols.split(",") if c.strip())
    try:
        train = _read_csv(args.train)
        test = _read_csv(args.test) if args.test else None
    except (FileNotFoundError, UnreadableTable, pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    files = [inspect_frame(train, args.train.name, args.label_col, args.category_col, id_cols)]
    report: dict[str, Any] = {"files": files}
    if test is not None:
        files.append(inspect_frame(test, args.test.name, args.label_col, args.category_col, id_cols))
        report["comparison"] = compare_frames(train, test, id_cols)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "dataset_inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    markdown = render_markdown(report)
    (args.out_dir / "dataset_inspection.md").write_text(markdown, encoding="utf-8")
    print(markdown)
    print(f"\nSaved: {args.out_dir / 'dataset_inspection.md'} and dataset_inspection.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
