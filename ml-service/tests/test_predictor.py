import json
import shutil

import joblib
import numpy as np
import pytest

from app.ml.predictor import InvalidRecords, ModelLoadError, ModelNotConfigured, Predictor
from app.ml.preprocessing import coerce_features
from app.ml.schema import FeatureSchema
from tests.conftest import records_from


@pytest.fixture
def detector(trained):
    folder = trained["root"] / "binary"
    return Predictor.load(folder / "model.joblib", folder / "metadata.json")


@pytest.fixture
def category_model(trained):
    folder = trained["root"] / "multiclass"
    return Predictor.load(folder / "model.joblib", folder / "metadata.json")


class TestPrediction:
    def test_returns_structured_results_with_version(self, detector, frames):
        out = detector.predict(records_from(frames[1], 5))
        assert out["count"] == 5
        assert out["model_version"] == detector.version
        for i, row in enumerate(out["results"]):
            assert row["index"] == i
            assert row["label"] in ("normal", "attack")
            assert 0.0 <= row["attack_probability"] <= 1.0
            assert row["is_attack"] == (row["label"] == "attack")

    def test_inference_matches_training_path_exactly(self, trained, detector, frames):
        """Records sent to the predictor must get the same scores as the training-side transform."""
        test_df = frames[1].head(40)
        pipeline = joblib.load(trained["root"] / "binary" / "model.joblib")
        schema = FeatureSchema.from_dict(trained["binary"]["schema"])
        X, _ = coerce_features(test_df, schema)
        expected = pipeline.predict_proba(X)[:, trained["binary"]["positive_class_index"]]

        got = [r["attack_probability"] for r in detector.predict(records_from(test_df, 40))["results"]]
        assert np.allclose(got, expected, atol=1e-6)

    def test_extra_columns_are_ignored_and_reported(self, detector, frames):
        # records_from keeps id, label and attack_cat, which the model must not use.
        out = detector.predict(records_from(frames[1], 3))
        assert any("Ignored" in w and "label" in w for w in out["warnings"])

    def test_multiclass_model_returns_a_category_and_confidence(self, category_model, frames):
        out = category_model.predict(records_from(frames[1], 4))
        for row in out["results"]:
            assert row["label"] in category_model.class_names
            assert 0.0 <= row["confidence"] <= 1.0

    def test_missing_and_unseen_values_are_handled_with_warnings(self, detector, frames):
        records = records_from(frames[1], 2)
        records[0]["rate"] = None
        records[1]["proto"] = "sctp"
        out = detector.predict(records)
        assert out["count"] == 2
        assert any("missing value" in w for w in out["warnings"])
        assert any("never seen in training" in w and "sctp" in w for w in out["warnings"])


class TestInvalidInput:
    def test_missing_required_column(self, detector, frames):
        records = records_from(frames[1], 2)
        for r in records:
            del r["rate"]
        with pytest.raises(InvalidRecords) as err:
            detector.predict(records)
        assert err.value.code == "missing_columns"
        assert err.value.details["missing_columns"] == ["rate"]

    def test_non_numeric_value_reports_row_and_column(self, detector, frames):
        records = records_from(frames[1], 3)
        records[2]["dur"] = "abc"
        with pytest.raises(InvalidRecords) as err:
            detector.predict(records)
        assert err.value.code == "invalid_values"
        assert err.value.details["examples"][0] == {"row": 2, "column": "dur", "value": "abc"}

    def test_nested_values_are_rejected(self, detector, frames):
        records = records_from(frames[1], 1)
        records[0]["dur"] = [1, 2, 3]
        with pytest.raises(InvalidRecords) as err:
            detector.predict(records)
        assert err.value.code == "invalid_record"

    def test_records_must_be_objects(self, detector):
        with pytest.raises(InvalidRecords) as err:
            detector.predict(["not a record"])
        assert err.value.code == "invalid_record"

    def test_empty_request(self, detector):
        with pytest.raises(InvalidRecords) as err:
            detector.predict([])
        assert err.value.code == "empty_request"


class TestLoading:
    def test_no_files_means_not_configured(self, tmp_path):
        with pytest.raises(ModelNotConfigured):
            Predictor.load(tmp_path / "model.joblib", tmp_path / "metadata.json")

    def test_only_one_of_the_two_files_is_still_not_configured(self, tmp_path, trained):
        shutil.copy(trained["root"] / "binary" / "model.joblib", tmp_path / "model.joblib")
        with pytest.raises(ModelNotConfigured):
            Predictor.load(tmp_path / "model.joblib", tmp_path / "metadata.json")

    def test_tampered_model_file_is_refused(self, tmp_path, trained):
        folder = tmp_path / "copy"
        shutil.copytree(trained["root"] / "binary", folder)
        with open(folder / "model.joblib", "ab") as handle:
            handle.write(b"tampered")
        with pytest.raises(ModelLoadError, match="checksum"):
            Predictor.load(folder / "model.joblib", folder / "metadata.json")

    def test_garbage_model_with_a_matching_checksum_is_refused_not_crashed(self, tmp_path, trained):
        from app.ml.train import sha256_file

        folder = tmp_path / "junk"
        shutil.copytree(trained["root"] / "binary", folder)
        (folder / "model.joblib").write_bytes(b"this is not a joblib file")
        meta = json.loads((folder / "metadata.json").read_text())
        meta["model_sha256"] = sha256_file(folder / "model.joblib")
        (folder / "metadata.json").write_text(json.dumps(meta))
        with pytest.raises(ModelLoadError):
            Predictor.load(folder / "model.joblib", folder / "metadata.json")

    def test_metadata_missing_required_keys_is_refused(self, tmp_path, trained):
        folder = tmp_path / "nometa"
        shutil.copytree(trained["root"] / "binary", folder)
        (folder / "metadata.json").write_text("{}")
        with pytest.raises(ModelLoadError, match="missing keys"):
            Predictor.load(folder / "model.joblib", folder / "metadata.json")

    def test_unreadable_metadata_is_refused(self, tmp_path, trained):
        folder = tmp_path / "badjson"
        shutil.copytree(trained["root"] / "binary", folder)
        (folder / "metadata.json").write_text("{not json")
        with pytest.raises(ModelLoadError):
            Predictor.load(folder / "model.joblib", folder / "metadata.json")
