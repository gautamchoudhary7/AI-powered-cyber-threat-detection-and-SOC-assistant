import numpy as np
import pandas as pd
import pytest
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

from app.ml.preprocessing import MissingColumnsError, build_preprocessor, coerce_features
from app.ml.schema import FeatureSchema, infer_schema


def small_frame():
    return pd.DataFrame(
        {
            "id": [1, 2, 3, 4],
            "dur": [0.1, 0.2, 0.3, 0.4],
            "bytes": [10, 20, 30, 40],
            "proto": ["tcp", "udp", "tcp", "icmp"],
            "attack_cat": ["Normal", "DoS", "Normal", "DoS"],
            "label": [0, 1, 0, 1],
        }
    )


class TestInferSchema:
    def test_splits_numeric_and_categorical_and_excludes_target_and_ids(self):
        schema = infer_schema(small_frame(), target="label", exclude=["id", "attack_cat"])
        assert schema.numeric == ["dur", "bytes"]
        assert schema.categorical == ["proto"]
        assert "label" not in schema.features and "id" not in schema.features
        assert "attack_cat" not in schema.features  # the other label would leak the answer
        assert schema.categories["proto"] == ["icmp", "tcp", "udp"]

    def test_drops_entirely_empty_columns(self):
        df = small_frame()
        df["empty"] = np.nan
        schema = infer_schema(df, target="label", exclude=["id", "attack_cat"])
        assert "empty" not in schema.features
        assert "empty" in schema.excluded

    def test_unknown_target_is_a_clear_error(self):
        with pytest.raises(ValueError, match="not found"):
            infer_schema(small_frame(), target="nope")

    def test_round_trips_through_a_dict(self):
        schema = infer_schema(small_frame(), target="label", exclude=["id", "attack_cat"])
        assert FeatureSchema.from_dict(schema.to_dict()) == schema


class TestCoerceFeatures:
    def schema(self):
        return infer_schema(small_frame(), target="label", exclude=["id", "attack_cat"])

    def test_returns_columns_in_schema_order_and_ignores_extras(self):
        df = small_frame()[["proto", "label", "bytes", "dur"]]  # shuffled, with an extra column
        X, issues = coerce_features(df, self.schema())
        assert list(X.columns) == ["dur", "bytes", "proto"]
        assert issues["invalid_numeric_count"] == 0

    def test_missing_required_column_raises_with_the_names(self):
        with pytest.raises(MissingColumnsError) as err:
            coerce_features(small_frame().drop(columns=["bytes"]), self.schema())
        assert err.value.columns == ["bytes"]

    def test_text_in_a_numeric_column_is_reported_not_hidden(self):
        df = small_frame().astype({"dur": object})
        df.loc[1, "dur"] = "abc"
        X, issues = coerce_features(df, self.schema())
        assert issues["invalid_numeric_count"] == 1
        assert issues["invalid_numeric"][0] == {"row": 1, "column": "dur", "value": "abc"}
        assert np.isnan(X.loc[1, "dur"])

    def test_infinite_values_become_missing_and_are_counted(self):
        df = small_frame()
        df.loc[0, "dur"] = np.inf
        X, issues = coerce_features(df, self.schema())
        assert issues["non_finite_replaced"] == 1
        assert np.isnan(X.loc[0, "dur"])
        assert issues["missing_cells"] == 1

    def test_unseen_category_is_reported_and_whitespace_is_stripped(self):
        df = small_frame()
        df.loc[0, "proto"] = "  tcp  "  # known value with spaces: fine
        df.loc[1, "proto"] = "sctp"  # never seen in training
        _, issues = coerce_features(df, self.schema())
        assert issues["unseen_categories"] == {"proto": ["sctp"]}


class TestPreprocessorPipeline:
    def test_handles_unseen_categories_and_missing_values_without_crashing(self):
        df = small_frame()
        schema = infer_schema(df, target="label", exclude=["id", "attack_cat"])
        X, _ = coerce_features(df, schema)
        pipe = Pipeline([("prep", build_preprocessor(schema)), ("clf", LogisticRegression())])
        pipe.fit(X, df["label"])

        new = pd.DataFrame({"dur": [None, 0.25], "bytes": [15, None], "proto": ["sctp", None]})
        X_new, _ = coerce_features(new, schema)
        probabilities = pipe.predict_proba(X_new)
        assert probabilities.shape == (2, 2)
        assert np.allclose(probabilities.sum(axis=1), 1.0)

    def test_scaling_uses_training_statistics_only(self):
        df = small_frame()
        schema = infer_schema(df, target="label", exclude=["id", "attack_cat"])
        X, _ = coerce_features(df, schema)
        prep = build_preprocessor(schema).fit(X)
        scaler = prep.named_transformers_["num"].named_steps["scale"]
        assert scaler.mean_[0] == pytest.approx(df["dur"].mean())
        # Transforming new data must not change what was learned from training.
        prep.transform(coerce_features(pd.DataFrame({"dur": [100.0], "bytes": [1000], "proto": ["tcp"]}), schema)[0])
        assert scaler.mean_[0] == pytest.approx(df["dur"].mean())
