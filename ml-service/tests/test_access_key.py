"""Shared-secret check between the backend and the ML service.

The unit tests need no web framework. The endpoint tests need fastapi and are skipped without it.
"""
import pytest

from app import config
from app.errors import ApiError
from app.security import check_internal_key, key_problem

KEY = "a-long-random-secret-value"


def test_no_key_and_not_required_means_no_check():
    check_internal_key(None, "", False)  # local development: allowed


def test_required_but_not_set_turns_the_service_off():
    with pytest.raises(ApiError) as err:
        check_internal_key(None, "", True)
    assert err.value.status_code == 503 and err.value.code == "access_not_configured"


@pytest.mark.parametrize("weak", ["short", "replace-with-a-long-random-value"])
def test_placeholder_or_short_key_is_refused(weak):
    assert key_problem(weak, False) is not None
    with pytest.raises(ApiError) as err:
        check_internal_key(weak, weak, False)
    assert err.value.status_code == 503


@pytest.mark.parametrize("provided", [None, "", "wrong-wrong-wrong-wrong", KEY + "x"])
def test_wrong_or_missing_key_is_forbidden(provided):
    with pytest.raises(ApiError) as err:
        check_internal_key(provided, KEY, False)
    assert err.value.status_code == 403 and err.value.code == "forbidden"
    assert KEY not in err.value.message  # the real key is never echoed


def test_right_key_passes():
    check_internal_key(KEY, KEY, True)


# ---- endpoint tests (need fastapi) ---------------------------------------------------------------
def _client():
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def test_health_stays_open_even_when_a_key_is_set(monkeypatch, use_models, tmp_path):
    use_models(tmp_path / "empty")
    monkeypatch.setattr(config, "ML_INTERNAL_KEY", KEY)
    assert _client().get("/health").status_code == 200


@pytest.mark.parametrize("method,path", [("get", "/model/info"), ("post", "/predict")])
def test_protected_endpoints_refuse_a_missing_or_wrong_key(monkeypatch, use_models, tmp_path, method, path):
    use_models(tmp_path / "empty")
    monkeypatch.setattr(config, "ML_INTERNAL_KEY", KEY)
    client = _client()
    body = {"json": {"records": [{"dur": 1}]}} if method == "post" else {}
    assert getattr(client, method)(path, **body).status_code == 403
    assert getattr(client, method)(path, headers={"x-internal-key": "wrong-wrong-wrong-wrong"}, **body).status_code == 403


def test_right_key_reaches_the_endpoint(monkeypatch, use_models, tmp_path):
    use_models(tmp_path / "empty")  # no model files: after the key check the service says "not configured"
    monkeypatch.setattr(config, "ML_INTERNAL_KEY", KEY)
    res = _client().post("/predict", json={"records": [{"dur": 1}]}, headers={"x-internal-key": KEY})
    assert res.status_code == 503 and res.json()["error"]["code"] == "detection_not_configured"


def test_without_a_key_setting_local_use_still_works(monkeypatch, use_models, tmp_path):
    use_models(tmp_path / "empty")
    monkeypatch.setattr(config, "ML_INTERNAL_KEY", "")
    monkeypatch.setattr(config, "ML_REQUIRE_KEY", False)
    res = _client().post("/predict", json={"records": [{"dur": 1}]})
    assert res.status_code == 503 and res.json()["error"]["code"] == "detection_not_configured"


def test_required_but_missing_key_blocks_everything_protected(monkeypatch, use_models, tmp_path):
    use_models(tmp_path / "empty")
    monkeypatch.setattr(config, "ML_INTERNAL_KEY", "")
    monkeypatch.setattr(config, "ML_REQUIRE_KEY", True)
    res = _client().post("/predict", json={"records": [{"dur": 1}]})
    assert res.status_code == 503 and res.json()["error"]["code"] == "access_not_configured"
