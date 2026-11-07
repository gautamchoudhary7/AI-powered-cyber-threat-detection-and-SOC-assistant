"""Phase 1 health tests, updated for the Phase 3 registry. Needs fastapi."""
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def test_health_returns_ok(use_models, tmp_path):
    use_models(tmp_path / "empty")
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["service"] == "ml-service"
    assert body["status"] == "ok"


def test_health_reports_not_configured_when_files_are_missing(use_models, tmp_path):
    use_models(tmp_path / "empty")
    body = client.get("/health").json()
    assert body["model_loaded"] is False
    assert "not configured" in body["detection"]


def test_one_file_alone_does_not_count_as_a_model(use_models, tmp_path):
    folder = tmp_path / "half" / "binary"
    folder.mkdir(parents=True)
    (folder / "model.joblib").write_bytes(b"placeholder")
    use_models(tmp_path / "half", with_category=False)
    assert client.get("/health").json()["model_loaded"] is False
