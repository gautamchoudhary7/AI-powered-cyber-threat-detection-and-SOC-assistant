"""API tests. They need fastapi and httpx (pip install -r requirements-dev.txt)."""
import shutil

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app import config  # noqa: E402
from app.main import app  # noqa: E402
from tests.conftest import records_from  # noqa: E402

client = TestClient(app)


@pytest.fixture
def no_models(monkeypatch, tmp_path, use_models):
    use_models(tmp_path / "empty")


@pytest.fixture
def with_models(trained, use_models):
    use_models(trained["root"])


class TestHealthWithoutModel:
    def test_health_is_honest_when_no_model_exists(self, no_models):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["model_loaded"] is False
        assert "not configured" in body["detection"]
        assert body["model_version"] is None

    def test_predict_refuses_with_503_instead_of_inventing_results(self, no_models, frames):
        res = client.post("/predict", json={"records": records_from(frames[1], 2)})
        assert res.status_code == 503
        assert res.json()["error"]["code"] == "detection_not_configured"
        assert "results" not in res.json()

    def test_model_info_is_503_without_a_model(self, no_models):
        assert client.get("/model/info").status_code == 503


class TestHealthWithModel:
    def test_health_reports_the_loaded_model_version(self, with_models, trained):
        body = client.get("/health").json()
        assert body["model_loaded"] is True
        assert body["detection"] == "configured"
        assert body["model_version"] == trained["binary"]["model_version"]
        assert body["category_model_loaded"] is True

    def test_model_info_returns_measured_metrics(self, with_models, trained):
        info = client.get("/model/info").json()
        assert info["detector"]["model_version"] == trained["binary"]["model_version"]
        assert "test_metrics" in info["detector"]
        assert info["category_model"]["task"] == "multiclass"


class TestPredict:
    def test_returns_structured_predictions_with_category(self, with_models, frames, trained):
        res = client.post("/predict", json={"records": records_from(frames[1], 4)})
        assert res.status_code == 200
        body = res.json()
        assert body["count"] == 4
        assert body["model_version"] == trained["binary"]["model_version"]
        assert body["category_model_version"] == trained["multiclass"]["model_version"]
        row = body["results"][0]
        assert row["label"] in ("normal", "attack")
        assert 0.0 <= row["attack_probability"] <= 1.0
        assert row["category"]["label"]

    def test_works_without_the_optional_category_model(self, trained, use_models, frames):
        use_models(trained["root"], with_category=False)
        body = client.post("/predict", json={"records": records_from(frames[1], 2)}).json()
        assert body["category_model_version"] is None
        assert body["results"][0]["category"] is None

    def test_missing_columns_gives_422_with_the_column_names(self, with_models, frames):
        records = records_from(frames[1], 2)
        for r in records:
            del r["dur"]
        res = client.post("/predict", json={"records": records})
        assert res.status_code == 422
        error = res.json()["error"]
        assert error["code"] == "missing_columns"
        assert error["details"]["missing_columns"] == ["dur"]

    def test_non_numeric_value_gives_422(self, with_models, frames):
        records = records_from(frames[1], 2)
        records[1]["sbytes"] = "lots"
        res = client.post("/predict", json={"records": records})
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "invalid_values"

    @pytest.mark.parametrize(
        "payload",
        [{}, {"records": []}, {"records": "nope"}, {"records": [1, 2]}, {"records": [{}], "extra": 1}],
    )
    def test_malformed_requests_get_a_clean_422(self, with_models, payload):
        res = client.post("/predict", json=payload)
        assert res.status_code == 422
        assert "error" in res.json()

    def test_validation_errors_do_not_echo_the_submitted_data(self, with_models):
        res = client.post("/predict", json={"records": "SECRET-VALUE"})
        assert "SECRET-VALUE" not in res.text

    def test_too_many_records_gives_413(self, with_models, frames, monkeypatch):
        monkeypatch.setattr(config, "MAX_RECORDS", 3)
        res = client.post("/predict", json={"records": records_from(frames[1], 4)})
        assert res.status_code == 413
        assert res.json()["error"]["code"] == "too_many_records"

    def test_unsupported_method_is_rejected(self, with_models):
        assert client.get("/predict").status_code == 405


class TestBrokenModelFiles:
    def test_corrupted_model_gives_a_clear_500_not_a_crash(self, trained, use_models, tmp_path, frames):
        broken = tmp_path / "broken"
        shutil.copytree(trained["root"], broken)
        with open(broken / "binary" / "model.joblib", "ab") as handle:
            handle.write(b"corrupt")
        use_models(broken)

        health = client.get("/health").json()
        assert health["model_loaded"] is False
        assert "error" in health["detection"]

        res = client.post("/predict", json={"records": records_from(frames[1], 1)})
        assert res.status_code == 500
        assert res.json()["error"]["code"] == "model_load_failed"
        assert "checksum" not in res.text  # internal detail is not leaked
