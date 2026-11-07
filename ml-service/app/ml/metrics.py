"""Evaluation metrics. Every number is computed from predictions; nothing is estimated or invented."""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support, roc_auc_score


def _ratio(numerator: float, denominator: float) -> float | None:
    return float(numerator / denominator) if denominator else None


def evaluate(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    class_names: list[str],
    positive_index: int | None = None,
    y_score: np.ndarray | None = None,
) -> dict[str, Any]:
    """Compute accuracy, per-class precision/recall/F1/FPR, confusion matrix.

    For a binary task, pass `positive_index` (the "attack" class) to also get detection-level
    numbers: precision, recall, F1, false-positive rate, false-negative rate and, if scores are
    given, ROC-AUC. False-positive rate = normal traffic wrongly flagged / all normal traffic.
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    labels = list(range(len(class_names)))
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    total = int(cm.sum())
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )

    per_class: dict[str, Any] = {}
    for i, name in enumerate(class_names):
        fp = int(cm[:, i].sum() - cm[i, i])
        tn = int(total - cm[i, :].sum() - cm[:, i].sum() + cm[i, i])
        per_class[name] = {
            "precision": float(precision[i]),
            "recall": float(recall[i]),
            "f1": float(f1[i]),
            "support": int(support[i]),
            "false_positive_rate": _ratio(fp, fp + tn),
        }

    weights = support / support.sum() if support.sum() else np.zeros(len(labels))
    result: dict[str, Any] = {
        "n_samples": total,
        "accuracy": _ratio(np.trace(cm), total),
        "macro_precision": float(np.mean(precision)),
        "macro_recall": float(np.mean(recall)),
        "macro_f1": float(np.mean(f1)),
        "weighted_f1": float(np.sum(f1 * weights)),
        "per_class": per_class,
        "confusion_matrix": {"labels": list(class_names), "matrix": cm.tolist()},
    }

    if positive_index is not None:
        tp = int(cm[positive_index, positive_index])
        fn = int(cm[positive_index, :].sum() - tp)
        fp = int(cm[:, positive_index].sum() - tp)
        tn = total - tp - fn - fp
        detection: dict[str, Any] = {
            "positive_class": class_names[positive_index],
            "true_positives": tp,
            "false_positives": fp,
            "true_negatives": tn,
            "false_negatives": fn,
            "precision": _ratio(tp, tp + fp),
            "recall": _ratio(tp, tp + fn),
            "f1": per_class[class_names[positive_index]]["f1"],
            "false_positive_rate": _ratio(fp, fp + tn),
            "false_negative_rate": _ratio(fn, fn + tp),
            "roc_auc": None,
        }
        if y_score is not None and len(np.unique(y_true)) == 2:
            detection["roc_auc"] = float(roc_auc_score((y_true == positive_index).astype(int), y_score))
        result["detection"] = detection
    return result


def selection_score(metrics: dict[str, Any]) -> float:
    """The single number used to pick the best model on VALIDATION data.

    Binary task: F1 of the attack class. Multiclass task: macro-F1 (every class counts equally,
    so rare attack types are not ignored).
    """
    if "detection" in metrics:
        return float(metrics["detection"]["f1"])
    return float(metrics["macro_f1"])
