"""Shared test fixtures.

IMPORTANT: the tables below are SYNTHETIC test fixtures, generated with a fixed random seed so the
tests are repeatable and need no download. They only exist to exercise the code. They are not the
UNSW-NB15 dataset, and no accuracy measured on them says anything about real detection quality.
"""
import numpy as np
import pandas as pd
import pytest

from app import config, registry
from app.ml.train import run_training


def synthetic_frame(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    label = rng.integers(0, 2, n)
    attack = label == 1
    proto = np.where(
        attack,
        rng.choice(["udp", "tcp", "icmp"], n, p=[0.5, 0.3, 0.2]),
        rng.choice(["udp", "tcp", "icmp"], n, p=[0.1, 0.8, 0.1]),
    )
    return pd.DataFrame(
        {
            "id": np.arange(n),
            "dur": np.where(attack, rng.exponential(0.5, n), rng.exponential(2.0, n)),
            "sbytes": rng.integers(0, 20000, n) + np.where(attack, 5000, 0),
            "rate": np.where(attack, rng.normal(160, 40, n), rng.normal(90, 40, n)),
            "proto": proto,
            "service": rng.choice(["-", "http", "dns"], n),
            "state": rng.choice(["FIN", "CON", "INT"], n),
            "attack_cat": np.where(attack, rng.choice(["DoS", "Exploits", "Fuzzers"], n), "Normal"),
            "label": label,
        }
    )


@pytest.fixture(scope="session")
def frames():
    return synthetic_frame(800, seed=1), synthetic_frame(300, seed=2)


def _quiet(_message: str) -> None:
    pass


@pytest.fixture(scope="session")
def trained(tmp_path_factory, frames):
    """Trains a small binary and a small multiclass model once for the whole test session."""
    train_df, test_df = frames
    root = tmp_path_factory.mktemp("models")
    common = dict(model_names=("logreg", "rf"), rf_estimators=15, n_jobs=1, log=_quiet)
    binary = run_training(train_df, test_df, output_dir=root / "binary", task="binary", **common)
    multiclass = run_training(train_df, test_df, output_dir=root / "multiclass", task="multiclass", **common)
    return {"root": root, "binary": binary, "multiclass": multiclass}


@pytest.fixture
def use_models(monkeypatch):
    """Point the service at a models folder and clear the model cache. Returns a function."""

    def _use(root, with_category=True):
        monkeypatch.setattr(config, "MODEL_FILE", root / "binary" / "model.joblib")
        monkeypatch.setattr(config, "METADATA_FILE", root / "binary" / "metadata.json")
        category = root / "multiclass" if with_category else root / "no-such-folder"
        monkeypatch.setattr(config, "CATEGORY_MODEL_FILE", category / "model.joblib")
        monkeypatch.setattr(config, "CATEGORY_METADATA_FILE", category / "metadata.json")
        registry.clear_cache()

    yield _use
    registry.clear_cache()


def records_from(df: pd.DataFrame, n: int = 10) -> list[dict]:
    """DataFrame rows as plain JSON-style records (missing values become None)."""
    part = df.head(n).astype(object)
    return part.where(part.notna(), None).to_dict("records")
