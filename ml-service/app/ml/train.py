"""Train, compare and save the detection models.

Method (written down so it can be put in the project report):

1. Clean the TRAINING data only: drop rows with no label, drop exact duplicate rows.
   The official TEST file is left exactly as provided.
2. Infer the feature schema from the training data. The target, id columns and the OTHER label
   column are never features (otherwise the answer would leak into the inputs).
3. Split the training data into "fit" and "validation" parts (stratified).
4. Fit each candidate model on the fit part. Preprocessing is fitted inside the same pipeline,
   so the validation part never influences scaling, imputing or encoding.
5. Pick the best model using VALIDATION results only.
6. Refit the winner on all (cleaned) training data and evaluate it ONCE on the official test file.
7. Save the pipeline (preprocessing + model), the schema, and every measured result.

Usage (from the ml-service folder):

    python -m app.ml.train --task binary     --train data/raw/<train>.csv --test data/raw/<test>.csv
    python -m app.ml.train --task multiclass --train data/raw/<train>.csv --test data/raw/<test>.csv
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from app import config
from app.ml.csvio import UnreadableTable, read_table
from app.ml.metrics import evaluate, selection_score
from app.ml.preprocessing import MissingColumnsError, build_preprocessor, coerce_features
from app.ml.schema import infer_schema

AVAILABLE_MODELS = ("logreg", "rf", "xgboost")
MODEL_LABELS = {"logreg": "Logistic Regression", "rf": "Random Forest", "xgboost": "XGBoost"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _target_as_text(series: pd.Series) -> pd.Series:
    """Labels as clean strings: 1 -> '1', ' Fuzzers ' -> 'Fuzzers', missing stays NaN."""
    if pd.api.types.is_bool_dtype(series):
        series = series.astype("Int64")
    elif pd.api.types.is_numeric_dtype(series):
        non_null = series.dropna()
        if len(non_null) and (non_null == non_null.round()).all():
            series = series.astype("Int64")
    return series.map(lambda v: np.nan if pd.isna(v) else str(v).strip())


def _make_estimator(name: str, class_weight: str | None, rf_estimators: int, seed: int, n_jobs: int):
    if name == "logreg":
        return LogisticRegression(max_iter=1000, class_weight=class_weight, random_state=seed)
    if name == "rf":
        return RandomForestClassifier(
            n_estimators=rf_estimators,
            min_samples_leaf=2,
            class_weight="balanced_subsample" if class_weight == "balanced" else None,
            n_jobs=n_jobs,
            random_state=seed,
        )
    if name == "xgboost":
        from xgboost import XGBClassifier  # optional dependency, checked before training starts

        return XGBClassifier(
            n_estimators=300, max_depth=6, learning_rate=0.1, tree_method="hist", n_jobs=n_jobs, random_state=seed
        )
    raise ValueError(f"Unknown model '{name}'. Choose from {AVAILABLE_MODELS}.")


def _check_models_available(model_names: tuple[str, ...]) -> None:
    unknown = [m for m in model_names if m not in AVAILABLE_MODELS]
    if unknown:
        raise ValueError(f"Unknown model(s) {unknown}. Choose from {AVAILABLE_MODELS}.")
    if "xgboost" in model_names:
        try:
            import xgboost  # noqa: F401
        except ImportError as exc:
            raise ValueError("xgboost was requested but is not installed. Run: pip install xgboost") from exc


def run_training(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    *,
    output_dir: Path,
    task: str = "binary",
    label_col: str = "label",
    category_col: str = "attack_cat",
    id_cols: tuple[str, ...] = ("id",),
    positive_label: str = "1",
    model_names: tuple[str, ...] = ("logreg", "rf"),
    class_weight: str = "auto",
    val_fraction: float = 0.2,
    seed: int = 42,
    rf_estimators: int = 100,
    n_jobs: int = -1,
    max_train_rows: int | None = None,
    train_name: str = "train",
    test_name: str = "test",
    log: Callable[[str], None] = print,
) -> dict[str, Any]:
    """Run the whole method above and return the metadata dictionary that was saved."""
    if task not in ("binary", "multiclass"):
        raise ValueError("task must be 'binary' or 'multiclass'")
    _check_models_available(tuple(model_names))

    target_col = label_col if task == "binary" else category_col
    other_target = category_col if task == "binary" else label_col
    for frame_name, frame in (("training", train_df), ("testing", test_df)):
        if target_col not in frame.columns:
            raise ValueError(
                f"Target column '{target_col}' not found in the {frame_name} file. "
                f"Available columns: {list(frame.columns)}"
            )

    # Never train on the answer: the other label column and the ids are excluded from the features.
    exclude = [*id_cols, other_target]
    cw = ("balanced" if task == "multiclass" else None) if class_weight == "auto" else (
        None if class_weight == "none" else class_weight
    )

    # ---- 1. clean the training data only ------------------------------------------------------
    train = train_df.copy()
    test = test_df.copy()
    train[target_col] = _target_as_text(train[target_col])
    test[target_col] = _target_as_text(test[target_col])

    counts: dict[str, Any] = {"train_rows_raw": int(len(train)), "test_rows_raw": int(len(test))}
    counts["train_rows_missing_label_dropped"] = int(train[target_col].isna().sum())
    train = train.dropna(subset=[target_col])
    counts["test_rows_missing_label_dropped"] = int(test[target_col].isna().sum())
    test = test.dropna(subset=[target_col])

    dedupe_cols = [c for c in train.columns if c not in set(id_cols)]
    before = len(train)
    train = train.drop_duplicates(subset=dedupe_cols)
    counts["train_duplicate_rows_dropped"] = int(before - len(train))
    if max_train_rows and len(train) > max_train_rows:
        train = train.sample(n=max_train_rows, random_state=seed)
        counts["train_rows_subsampled_to"] = int(max_train_rows)
    counts["train_rows_used"] = int(len(train))
    counts["test_rows_used"] = int(len(test))

    # ---- 2. classes and schema ----------------------------------------------------------------
    classes = sorted(train[target_col].unique())
    unseen_classes = sorted(set(test[target_col].unique()) - set(classes))
    if unseen_classes:
        raise ValueError(f"The test file has classes never seen in training: {unseen_classes}")
    positive_index: int | None = None
    if task == "binary":
        if len(classes) != 2:
            raise ValueError(f"A binary task needs exactly 2 classes in '{target_col}'; found {classes}")
        positive_label = str(positive_label).strip()
        if positive_label not in classes:
            raise ValueError(f"--positive-label '{positive_label}' is not one of the classes {classes}")
        positive_index = classes.index(positive_label)
        class_names = ["attack" if c == positive_label else "normal" for c in classes]
    else:
        class_names = list(classes)
    to_index = {c: i for i, c in enumerate(classes)}
    y_train = train[target_col].map(to_index).to_numpy()
    y_test = test[target_col].map(to_index).to_numpy()

    schema = infer_schema(train, target_col, exclude)
    X_train, train_issues = coerce_features(train, schema)
    try:
        X_test, test_issues = coerce_features(test, schema)
    except MissingColumnsError as exc:
        raise ValueError(f"The test file is missing columns the model needs: {exc.columns}") from exc
    log(f"Task: {task} | target: {target_col} | classes: {class_names}")
    log(f"Features: {len(schema.numeric)} numeric, {len(schema.categorical)} categorical | "
        f"train rows: {len(train):,} | test rows: {len(test):,}")

    # ---- 3. validation split ------------------------------------------------------------------
    notes: list[str] = []
    positions = np.arange(len(train))
    class_counts = np.bincount(y_train, minlength=len(classes))
    n_val = int(len(train) * val_fraction)
    can_stratify = class_counts.min() >= 2 and n_val >= len(classes)
    if not can_stratify:
        notes.append("The validation split could not be stratified (a class is too small).")
    fit_pos, val_pos = train_test_split(
        positions, test_size=val_fraction, random_state=seed, stratify=y_train if can_stratify else None
    )
    X_fit, y_fit = X_train.iloc[fit_pos], y_train[fit_pos]
    X_val, y_val = X_train.iloc[val_pos], y_train[val_pos]

    # ---- 4. compare candidates on the validation split ----------------------------------------
    def new_pipeline(model_name: str) -> Pipeline:
        return Pipeline(
            [
                ("prep", build_preprocessor(schema)),
                ("clf", _make_estimator(model_name, cw, rf_estimators, seed, n_jobs)),
            ]
        )

    candidates: dict[str, Any] = {}
    for name in model_names:
        log(f"Fitting {MODEL_LABELS[name]} ...")
        started = time.perf_counter()
        try:
            pipe = new_pipeline(name)
            pipe.fit(X_fit, y_fit)
            predicted = pipe.predict(X_val)
            score = pipe.predict_proba(X_val)[:, positive_index] if positive_index is not None else None
            metrics = evaluate(y_val, predicted, class_names, positive_index, score)
            candidates[name] = {
                "status": "ok",
                "fit_seconds": round(time.perf_counter() - started, 2),
                "selection_score": selection_score(metrics),
                "validation_metrics": metrics,
            }
            log(f"  validation selection score: {candidates[name]['selection_score']:.4f}")
        except Exception as exc:  # one failing model must not hide the results of the others
            candidates[name] = {"status": "failed", "error": f"{type(exc).__name__}: {exc}"[:300]}
            log(f"  FAILED: {candidates[name]['error']}")

    working = [n for n in model_names if candidates[n]["status"] == "ok"]
    if not working:
        raise RuntimeError(f"Every candidate model failed: {json.dumps({k: v.get('error') for k, v in candidates.items()})}")
    best = max(working, key=lambda n: candidates[n]["selection_score"])  # ties keep the first listed

    # ---- 5. refit the winner on all training data, evaluate ONCE on the test file -------------
    log(f"Selected on validation data: {MODEL_LABELS[best]}. Refitting on all training rows ...")
    final = new_pipeline(best)
    final.fit(X_train, y_train)
    test_pred = final.predict(X_test)
    test_score = final.predict_proba(X_test)[:, positive_index] if positive_index is not None else None
    test_metrics = evaluate(y_test, test_pred, class_names, positive_index, test_score)

    # ---- 6. save everything -------------------------------------------------------------------
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "model.joblib"
    joblib.dump(final, model_path, compress=3)
    digest = sha256_file(model_path)
    trained_at = datetime.now(timezone.utc)

    notes += [
        "The model was selected using the validation split only; the official test file was scored once, after selection.",
        "Predicted probabilities are not calibrated. Treat them as scores, not exact chances.",
        "Results describe this dataset only. Real-world traffic will differ and results will likely be worse.",
    ]
    metadata: dict[str, Any] = {
        "model_version": f"{task}-{trained_at.strftime('%Y%m%dT%H%M%SZ')}-{digest[:8]}",
        "task": task,
        "trained_at": trained_at.isoformat(),
        "selected_model": best,
        "selection": {"basis": "validation", "score": candidates[best]["selection_score"],
                      "metric": "attack-class F1" if task == "binary" else "macro F1"},
        "class_names": class_names,
        "classes_raw": classes,
        "positive_class_index": positive_index,
        "schema": schema.to_dict(),
        "dataset": {"train_file": train_name, "test_file": test_name, **counts,
                    "train_data_issues": {k: v for k, v in train_issues.items() if k != "unseen_categories"},
                    "test_data_issues": test_issues},
        "settings": {"models_requested": list(model_names), "class_weight": cw, "val_fraction": val_fraction,
                     "seed": seed, "rf_estimators": rf_estimators, "max_train_rows": max_train_rows},
        "candidates": candidates,
        "test_metrics": test_metrics,
        "library_versions": {"python": platform.python_version(), "scikit-learn": sklearn.__version__,
                             "pandas": pd.__version__, "numpy": np.__version__, "joblib": joblib.__version__},
        "model_sha256": digest,
        "notes": notes,
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    log(f"Saved model to {model_path}")
    return metadata


# ---------------------------------------------------------------------------------------------
# Report (Markdown generated from the measured numbers; nothing is typed in by hand)
# ---------------------------------------------------------------------------------------------
def _f(value: float | None, digits: int = 4) -> str:
    return "n/a" if value is None else f"{value:.{digits}f}"


def render_report(meta: dict[str, Any]) -> str:
    ds = meta["dataset"]
    binary = meta["task"] == "binary"
    out = [f"# Training report: {meta['task']} model", ""]
    out += [f"- Model version: `{meta['model_version']}`", f"- Trained at: {meta['trained_at']}",
            f"- Training file: `{ds['train_file']}` ({ds['train_rows_raw']:,} rows read)",
            f"- Testing file: `{ds['test_file']}` ({ds['test_rows_raw']:,} rows read)", ""]
    out += ["## Data preparation", ""]
    out += [f"- Training rows without a label dropped: {ds['train_rows_missing_label_dropped']:,}",
            f"- Exact duplicate training rows dropped: {ds['train_duplicate_rows_dropped']:,}",
            f"- Training rows used: {ds['train_rows_used']:,}",
            f"- Test rows used (test file not deduplicated): {ds['test_rows_used']:,}",
            f"- Features: {len(meta['schema']['numeric'])} numeric, {len(meta['schema']['categorical'])} categorical",
            f"- Columns deliberately excluded from the features: {', '.join(meta['schema']['excluded']) or 'none'}", ""]
    out += ["## Model comparison (validation split, used for selection)", ""]
    if binary:
        out += ["| Model | Status | Fit seconds | Accuracy | Precision | Recall | F1 | False-positive rate |", "|---|---|---|---|---|---|---|---|"]
    else:
        out += ["| Model | Status | Fit seconds | Accuracy | Macro precision | Macro recall | Macro F1 | Weighted F1 |", "|---|---|---|---|---|---|---|---|"]
    for name, cand in meta["candidates"].items():
        if cand["status"] != "ok":
            out.append(f"| {MODEL_LABELS[name]} | failed: {cand['error']} | | | | | | |")
            continue
        m = cand["validation_metrics"]
        if binary:
            d = m["detection"]
            row = [_f(m["accuracy"]), _f(d["precision"]), _f(d["recall"]), _f(d["f1"]), _f(d["false_positive_rate"])]
        else:
            row = [_f(m["accuracy"]), _f(m["macro_precision"]), _f(m["macro_recall"]), _f(m["macro_f1"]), _f(m["weighted_f1"])]
        out.append(f"| {MODEL_LABELS[name]} | ok | {cand['fit_seconds']} | " + " | ".join(row) + " |")
    out += ["", f"**Selected:** {MODEL_LABELS[meta['selected_model']]} (by {meta['selection']['metric']} on validation data).", ""]

    tm = meta["test_metrics"]
    out += ["## Final result on the official test file (scored once)", ""]
    out += [f"- Samples: {tm['n_samples']:,}", f"- Accuracy: {_f(tm['accuracy'])}"]
    if binary:
        d = tm["detection"]
        out += [f"- Precision ({d['positive_class']}): {_f(d['precision'])}", f"- Recall ({d['positive_class']}): {_f(d['recall'])}",
                f"- F1 ({d['positive_class']}): {_f(d['f1'])}", f"- False-positive rate: {_f(d['false_positive_rate'])}",
                f"- False-negative rate: {_f(d['false_negative_rate'])}", f"- ROC-AUC: {_f(d['roc_auc'])}"]
    else:
        out += [f"- Macro F1: {_f(tm['macro_f1'])}", f"- Weighted F1: {_f(tm['weighted_f1'])}"]
    out += ["", "### Per-class performance", "", "| Class | Precision | Recall | F1 | False-positive rate | Support |", "|---|---|---|---|---|---|"]
    for cls, v in tm["per_class"].items():
        out.append(f"| {cls} | {_f(v['precision'])} | {_f(v['recall'])} | {_f(v['f1'])} | {_f(v['false_positive_rate'])} | {v['support']:,} |")
    cm = tm["confusion_matrix"]
    out += ["", "### Confusion matrix (rows = true class, columns = predicted class)", "",
            "| true \\ predicted | " + " | ".join(cm["labels"]) + " |", "|---|" + "---|" * len(cm["labels"])]
    for label, row in zip(cm["labels"], cm["matrix"]):
        out.append(f"| {label} | " + " | ".join(f"{v:,}" for v in row) + " |")
    out += ["", "## Settings", "", "```json", json.dumps(meta["settings"], indent=2), "```", "", "## Caveats", ""]
    out += [f"- {n}" for n in meta["notes"]]
    out.append("")
    return "\n".join(out)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Train and compare detection models.")
    p.add_argument("--train", required=True, type=Path)
    p.add_argument("--test", required=True, type=Path)
    p.add_argument("--task", choices=["binary", "multiclass"], default="binary")
    p.add_argument("--label-col", default="label", help="attack/normal column (binary target)")
    p.add_argument("--category-col", default="attack_cat", help="attack-category column (multiclass target)")
    p.add_argument("--id-cols", default="id", help="comma-separated identifier columns to ignore")
    p.add_argument("--positive-label", default="1", help="value of the label column that means 'attack'")
    p.add_argument("--models", default="logreg,rf", help="comma-separated: logreg, rf, xgboost")
    p.add_argument("--class-weight", choices=["auto", "balanced", "none"], default="auto")
    p.add_argument("--val-fraction", type=float, default=0.2)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--rf-estimators", type=int, default=100)
    p.add_argument("--max-train-rows", type=int, default=None, help="use a random subset (quick trial runs)")
    p.add_argument("--output-dir", type=Path, default=None, help="default: models/<task>")
    p.add_argument("--report-dir", type=Path, default=config.REPORTS_DIR)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    output_dir = args.output_dir or (config.MODEL_DIR / args.task)
    for path in (args.train, args.test):
        if not path.is_file():
            print(f"Error: file not found: {path}", file=sys.stderr)
            return 1
    try:
        train_df = read_table(args.train)
        test_df = read_table(args.test)
        meta = run_training(
            train_df, test_df, output_dir=output_dir, task=args.task, label_col=args.label_col,
            category_col=args.category_col, id_cols=tuple(c.strip() for c in args.id_cols.split(",") if c.strip()),
            positive_label=args.positive_label, model_names=tuple(m.strip() for m in args.models.split(",") if m.strip()),
            class_weight=args.class_weight, val_fraction=args.val_fraction, seed=args.seed,
            rf_estimators=args.rf_estimators, max_train_rows=args.max_train_rows,
            train_name=args.train.name, test_name=args.test.name,
        )
    except (ValueError, RuntimeError, UnreadableTable) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    args.report_dir.mkdir(parents=True, exist_ok=True)
    report = render_report(meta)
    (args.report_dir / f"training_report_{args.task}.md").write_text(report, encoding="utf-8")
    (args.report_dir / f"training_metadata_{args.task}.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("\n" + report)
    print(f"Saved report to {args.report_dir / f'training_report_{args.task}.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
