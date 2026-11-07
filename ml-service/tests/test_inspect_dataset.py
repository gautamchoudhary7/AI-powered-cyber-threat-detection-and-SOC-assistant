import json

import pandas as pd

from app.ml.inspect_dataset import compare_frames, inspect_frame, main
from tests.conftest import synthetic_frame


def test_inspect_frame_reports_what_is_really_in_the_data():
    df = pd.DataFrame(
        {
            "id": [1, 2, 3, 4, 5],
            "dur": [0.1, 0.2, None, 0.2, 0.2],
            "proto": ["tcp", "udp", "tcp", "udp", "udp"],
            "const": [7, 7, 7, 7, 7],
            "attack_cat": ["Normal", "DoS", "Normal", " DoS", "DoS"],
            "label": [0, 1, 0, 1, 1],
        }
    )
    report = inspect_frame(df, "toy.csv", "label", "attack_cat", ("id",))

    assert report["rows"] == 5 and report["n_columns"] == 6
    assert report["missing_cells"] == 1
    assert report["numeric_columns"] == ["id", "dur", "const", "label"]
    assert report["categorical_columns"] == ["proto", "attack_cat"]
    assert report["constant_columns"] == ["const"]
    assert report["class_distributions"]["label"] == {"1": 3, "0": 2}
    assert report["duplicate_rows_all_columns"] == 0
    assert any("spaces" in w for w in report["warnings"])  # ' DoS' vs 'DoS'


def test_duplicates_are_counted_with_and_without_ids():
    df = pd.DataFrame({"id": [1, 2, 3], "a": [5, 5, 6], "label": [0, 0, 1]})
    report = inspect_frame(df, "d.csv", "label", None, ("id",))
    assert report["duplicate_rows_all_columns"] == 0
    assert report["duplicate_rows_ignoring_ids"] == 1


def test_missing_label_column_gives_a_warning_not_a_crash():
    report = inspect_frame(pd.DataFrame({"a": [1, 2]}), "x.csv", "label", "attack_cat", ("id",))
    assert any("'label' does not exist" in w for w in report["warnings"])
    assert any("'attack_cat' does not exist" in w for w in report["warnings"])
    assert any("'id' does not exist" in w for w in report["warnings"])


def test_compare_finds_unseen_categories_extra_columns_and_shared_rows():
    train = pd.DataFrame({"id": [1, 2], "proto": ["tcp", "udp"], "x": [1, 2]})
    test = pd.DataFrame({"id": [9, 8], "proto": ["tcp", "sctp"], "x": [1, 3], "extra": [0, 0]})
    cmp = compare_frames(train, test, ("id",))
    assert cmp["columns_only_in_test"] == ["extra"]
    assert cmp["test_categories_unseen_in_train"]["proto"] == {"rows": 1, "values": ["sctp"]}
    assert cmp["test_rows_identical_to_a_train_row"] == 1


def test_command_line_writes_json_and_markdown_reports(tmp_path, capsys):
    train_csv, test_csv = tmp_path / "train.csv", tmp_path / "test.csv"
    synthetic_frame(60, seed=1).to_csv(train_csv, index=False)
    synthetic_frame(30, seed=2).to_csv(test_csv, index=False)
    out = tmp_path / "reports"

    code = main(["--train", str(train_csv), "--test", str(test_csv), "--out-dir", str(out)])
    assert code == 0
    saved = json.loads((out / "dataset_inspection.json").read_text())
    assert [f["rows"] for f in saved["files"]] == [60, 30]
    assert "comparison" in saved
    assert "# Dataset inspection report" in (out / "dataset_inspection.md").read_text()


def test_command_line_reports_a_missing_file_without_a_traceback(tmp_path, capsys):
    code = main(["--train", str(tmp_path / "nope.csv"), "--out-dir", str(tmp_path)])
    assert code == 1
    assert "File not found" in capsys.readouterr().err
