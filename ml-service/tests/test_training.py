import importlib.util
import json

import joblib
import pandas as pd
import pytest

from app.ml import train
from app.ml.train import render_report, run_training, sha256_file

COMMON = dict(rf_estimators=10, n_jobs=1, log=lambda _m: None)


def features_of(meta):
    return set(meta["schema"]["numeric"]) | set(meta["schema"]["categorical"])


class TestArtifacts:
    def test_saves_model_metadata_and_a_matching_checksum(self, trained):
        folder = trained["root"] / "binary"
        meta = json.loads((folder / "metadata.json").read_text())
        assert (folder / "model.joblib").is_file()
        assert meta["model_sha256"] == sha256_file(folder / "model.joblib")
        assert meta["model_version"].startswith("binary-")
        for key in ("schema", "class_names", "candidates", "test_metrics", "library_versions", "dataset", "notes"):
            assert key in meta

    def test_saved_model_is_a_single_pipeline_that_includes_preprocessing(self, trained):
        pipeline = joblib.load(trained["root"] / "binary" / "model.joblib")
        assert [name for name, _ in pipeline.steps] == ["prep", "clf"]


class TestNoLabelLeakage:
    def test_binary_model_never_sees_the_category_label_or_id(self, trained):
        feats = features_of(trained["binary"])
        assert not feats & {"label", "attack_cat", "id"}

    def test_multiclass_model_never_sees_the_binary_label_or_id(self, trained):
        feats = features_of(trained["multiclass"])
        assert not feats & {"label", "attack_cat", "id"}


class TestMethod:
    def test_model_is_selected_on_validation_and_test_is_reported_separately(self, trained):
        meta = trained["binary"]
        assert meta["selection"]["basis"] == "validation"
        chosen = meta["candidates"][meta["selected_model"]]
        assert chosen["status"] == "ok"
        best_score = max(c["selection_score"] for c in meta["candidates"].values() if c["status"] == "ok")
        assert chosen["selection_score"] == best_score
        assert "test_metrics" not in chosen  # candidates carry no test results
        assert meta["test_metrics"]["n_samples"] == meta["dataset"]["test_rows_used"]

    def test_pipeline_works_on_clean_synthetic_data(self, trained):
        # A sanity check that the code learns something on separable synthetic data.
        # This is NOT a statement about real-world detection quality.
        assert trained["binary"]["test_metrics"]["accuracy"] > 0.8

    def test_same_seed_gives_the_same_result(self, frames, tmp_path):
        train_df, test_df = frames
        a = run_training(train_df, test_df, output_dir=tmp_path / "a", model_names=("logreg",), **COMMON)
        b = run_training(train_df, test_df, output_dir=tmp_path / "b", model_names=("logreg",), **COMMON)
        assert a["test_metrics"]["accuracy"] == b["test_metrics"]["accuracy"]
        assert a["test_metrics"]["confusion_matrix"] == b["test_metrics"]["confusion_matrix"]

    def test_binary_report_includes_false_positive_rate(self, trained):
        d = trained["binary"]["test_metrics"]["detection"]
        assert 0.0 <= d["false_positive_rate"] <= 1.0
        assert d["roc_auc"] is not None


class TestDataCleaning:
    def test_duplicates_and_unlabelled_rows_are_removed_from_training_only(self, frames, tmp_path):
        train_df, test_df = frames
        dupes = train_df.head(10).copy()
        dupes["id"] = range(10_000, 10_010)  # same content, different id
        unlabelled = train_df.head(3).copy()
        unlabelled["id"] = range(20_000, 20_003)
        unlabelled["label"] = None
        dirty_train = pd.concat([train_df, dupes, unlabelled], ignore_index=True)
        dirty_test = pd.concat([test_df, test_df.head(5)], ignore_index=True)  # test duplicates stay

        meta = run_training(dirty_train, dirty_test, output_dir=tmp_path, model_names=("logreg",), **COMMON)
        ds = meta["dataset"]
        assert ds["train_rows_missing_label_dropped"] == 3
        assert ds["train_duplicate_rows_dropped"] == 10
        assert ds["train_rows_used"] == len(train_df)
        assert ds["test_rows_used"] == len(test_df) + 5

    def test_labels_with_stray_spaces_are_treated_as_one_class(self, frames, tmp_path):
        train_df, test_df = frames
        messy = train_df.copy()
        messy["attack_cat"] = messy["attack_cat"].where(messy.index % 2 == 0, messy["attack_cat"] + " ")
        meta = run_training(messy, test_df, output_dir=tmp_path, task="multiclass", model_names=("logreg",), **COMMON)
        assert sorted(meta["class_names"]) == ["DoS", "Exploits", "Fuzzers", "Normal"]

    def test_max_train_rows_uses_a_subset(self, frames, tmp_path):
        train_df, test_df = frames
        meta = run_training(train_df, test_df, output_dir=tmp_path, model_names=("logreg",), max_train_rows=200, **COMMON)
        assert meta["dataset"]["train_rows_used"] == 200


class TestFailureHandling:
    def test_test_file_with_an_unseen_class_is_rejected(self, frames, tmp_path):
        train_df, test_df = frames
        bad = test_df.copy()
        bad.loc[0, "attack_cat"] = "Worms"
        with pytest.raises(ValueError, match="never seen in training"):
            run_training(train_df, bad, output_dir=tmp_path, task="multiclass", model_names=("logreg",), **COMMON)

    def test_missing_target_column_is_a_clear_error(self, frames, tmp_path):
        train_df, test_df = frames
        with pytest.raises(ValueError, match="Target column 'label' not found"):
            run_training(train_df.drop(columns=["label"]), test_df, output_dir=tmp_path, **COMMON)

    def test_test_file_missing_a_feature_column_is_a_clear_error(self, frames, tmp_path):
        train_df, test_df = frames
        with pytest.raises(ValueError, match="missing columns"):
            run_training(train_df, test_df.drop(columns=["rate"]), output_dir=tmp_path, model_names=("logreg",), **COMMON)

    def test_wrong_positive_label_is_rejected(self, frames, tmp_path):
        train_df, test_df = frames
        with pytest.raises(ValueError, match="positive-label"):
            run_training(train_df, test_df, output_dir=tmp_path, positive_label="9", **COMMON)

    def test_a_binary_task_on_a_multiclass_column_is_rejected(self, frames, tmp_path):
        train_df, test_df = frames
        with pytest.raises(ValueError, match="exactly 2 classes"):
            run_training(train_df, test_df, output_dir=tmp_path, label_col="attack_cat", category_col="label", **COMMON)

    def test_unknown_model_name_is_rejected_before_any_training(self, frames, tmp_path):
        train_df, test_df = frames
        with pytest.raises(ValueError, match="Unknown model"):
            run_training(train_df, test_df, output_dir=tmp_path, model_names=("magic",), **COMMON)

    @pytest.mark.skipif(importlib.util.find_spec("xgboost") is not None, reason="xgboost is installed")
    def test_requesting_xgboost_without_it_installed_fails_clearly(self, frames, tmp_path):
        train_df, test_df = frames
        with pytest.raises(ValueError, match="xgboost"):
            run_training(train_df, test_df, output_dir=tmp_path, model_names=("logreg", "xgboost"), **COMMON)

    def test_one_failing_model_is_recorded_and_the_others_still_run(self, frames, tmp_path, monkeypatch):
        train_df, test_df = frames
        original = train._make_estimator

        def flaky(name, *args, **kwargs):
            if name == "logreg":
                raise RuntimeError("boom")
            return original(name, *args, **kwargs)

        monkeypatch.setattr(train, "_make_estimator", flaky)
        meta = run_training(train_df, test_df, output_dir=tmp_path, model_names=("logreg", "rf"), **COMMON)
        assert meta["candidates"]["logreg"]["status"] == "failed"
        assert "boom" in meta["candidates"]["logreg"]["error"]
        assert meta["selected_model"] == "rf"

    def test_if_every_model_fails_training_stops_with_an_error(self, frames, tmp_path, monkeypatch):
        train_df, test_df = frames

        def always_fail(*args, **kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(train, "_make_estimator", always_fail)
        with pytest.raises(RuntimeError, match="Every candidate model failed"):
            run_training(train_df, test_df, output_dir=tmp_path, model_names=("logreg",), **COMMON)
        assert not (tmp_path / "model.joblib").exists()  # nothing half-trained is saved


class TestReport:
    def test_report_is_generated_from_the_measured_numbers(self, trained):
        meta = trained["binary"]
        report = render_report(meta)
        assert meta["model_version"] in report
        assert f"{meta['test_metrics']['accuracy']:.4f}" in report
        assert "False-positive rate" in report
        assert "Confusion matrix" in report
        assert "not calibrated" in report

    def test_multiclass_report_lists_every_class(self, trained):
        report = render_report(trained["multiclass"])
        for name in trained["multiclass"]["class_names"]:
            assert f"| {name} |" in report
