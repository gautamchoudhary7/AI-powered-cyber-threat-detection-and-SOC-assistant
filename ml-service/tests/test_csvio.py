import pandas as pd
import pytest

from app.ml.csvio import UnreadableTable, detect_separator, main, read_table

ROWS = [["id", "dur", "proto", "label"], ["1", "0.5", "tcp", "0"], ["2", "1.25", "udp", "1"]]


def write(path, sep, rows=ROWS, bom=False):
    text = "\n".join(sep.join(r) for r in rows) + "\n"
    path.write_text(("﻿" if bom else "") + text, encoding="utf-8")
    return path


@pytest.mark.parametrize("sep", [",", "\t", ";", "|"])
def test_every_supported_separator_gives_the_same_table(tmp_path, sep):
    frame = read_table(write(tmp_path / "t.csv", sep))
    assert list(frame.columns) == ["id", "dur", "proto", "label"]
    assert len(frame) == 2
    assert frame["proto"].tolist() == ["tcp", "udp"]


def test_a_byte_order_mark_does_not_hide_the_separator_or_rename_the_first_column(tmp_path):
    path = write(tmp_path / "bom.csv", "\t", bom=True)
    assert detect_separator(path) == "\t"
    assert list(read_table(path).columns)[0] == "id"


def test_comma_wins_a_tie(tmp_path):
    path = tmp_path / "tie.csv"
    path.write_text("a,b\tc\n1,2\t3\n", encoding="utf-8")
    assert detect_separator(path) == ","


def test_a_file_with_no_separator_is_refused_with_a_clear_message(tmp_path):
    path = tmp_path / "one.csv"
    path.write_text("justoneword\nvalue\n", encoding="utf-8")
    with pytest.raises(UnreadableTable) as err:
        read_table(path)
    assert "cannot be a table" in str(err.value)


def test_the_converter_writes_a_comma_file_with_the_same_content(tmp_path, capsys):
    source = write(tmp_path / "in.csv", "\t")
    target = tmp_path / "out.csv"
    assert main([str(source), str(target)]) == 0
    assert target.read_text(encoding="utf-8").splitlines()[0] == "id,dur,proto,label"
    again = pd.read_csv(target)
    assert again.equals(read_table(source))


def test_the_converter_will_not_overwrite_its_input(tmp_path):
    source = write(tmp_path / "in.csv", "\t")
    assert main([str(source), str(source)]) == 2
    assert source.read_text(encoding="utf-8").startswith("id\tdur")
