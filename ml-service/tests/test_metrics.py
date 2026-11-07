import numpy as np
import pytest

from app.ml.metrics import evaluate, selection_score


def test_binary_metrics_match_a_hand_calculation():
    # true:      0 0 0 0 1 1 1 1
    # predicted: 0 0 1 0 1 1 0 1
    # -> TN=3, FP=1, FN=1, TP=3
    y_true = np.array([0, 0, 0, 0, 1, 1, 1, 1])
    y_pred = np.array([0, 0, 1, 0, 1, 1, 0, 1])
    m = evaluate(y_true, y_pred, ["normal", "attack"], positive_index=1)

    d = m["detection"]
    assert (d["true_negatives"], d["false_positives"], d["false_negatives"], d["true_positives"]) == (3, 1, 1, 3)
    assert m["accuracy"] == pytest.approx(0.75)
    assert d["precision"] == pytest.approx(0.75)
    assert d["recall"] == pytest.approx(0.75)
    assert d["f1"] == pytest.approx(0.75)
    assert d["false_positive_rate"] == pytest.approx(0.25)  # 1 normal flow of 4 was flagged
    assert d["false_negative_rate"] == pytest.approx(0.25)
    assert m["confusion_matrix"]["matrix"] == [[3, 1], [1, 3]]
    assert m["per_class"]["normal"]["support"] == 4


def test_roc_auc_is_computed_from_scores_when_given():
    y_true = np.array([0, 0, 1, 1])
    perfect = evaluate(y_true, y_true, ["normal", "attack"], 1, y_score=np.array([0.1, 0.2, 0.8, 0.9]))
    assert perfect["detection"]["roc_auc"] == pytest.approx(1.0)
    none = evaluate(y_true, y_true, ["normal", "attack"], 1)
    assert none["detection"]["roc_auc"] is None


def test_multiclass_per_class_numbers_and_macro_average():
    y_true = np.array([0, 0, 1, 1, 2, 2])
    y_pred = np.array([0, 1, 1, 1, 2, 0])
    m = evaluate(y_true, y_pred, ["a", "b", "c"])
    assert "detection" not in m
    assert m["accuracy"] == pytest.approx(4 / 6)
    assert m["per_class"]["a"]["precision"] == pytest.approx(0.5)  # predicted a twice, once right
    assert m["per_class"]["a"]["recall"] == pytest.approx(0.5)
    assert m["per_class"]["b"]["recall"] == pytest.approx(1.0)
    assert m["per_class"]["c"]["false_positive_rate"] == pytest.approx(0.0)
    assert m["macro_f1"] == pytest.approx(np.mean([m["per_class"][k]["f1"] for k in "abc"]))


def test_a_class_that_never_appears_does_not_crash_or_divide_by_zero():
    m = evaluate(np.array([0, 0, 1]), np.array([0, 0, 1]), ["a", "b", "c"])
    assert m["per_class"]["c"]["support"] == 0
    assert m["per_class"]["c"]["recall"] == 0.0


def test_selection_score_uses_attack_f1_for_binary_and_macro_f1_otherwise():
    binary = evaluate(np.array([0, 1, 1]), np.array([0, 1, 0]), ["normal", "attack"], 1)
    assert selection_score(binary) == binary["detection"]["f1"]
    multi = evaluate(np.array([0, 1, 2]), np.array([0, 1, 1]), ["a", "b", "c"])
    assert selection_score(multi) == multi["macro_f1"]
