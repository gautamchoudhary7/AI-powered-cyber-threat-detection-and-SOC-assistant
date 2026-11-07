"""Reading dataset files whose separator is not a comma.

The UNSW-NB15 files that were downloaded for this project turned out to be separated by TABS, not commas. Read as
comma-separated, every line becomes ONE huge column, and nothing downstream makes sense. This module looks at the
header line, picks the separator that appears most often, and refuses files that still have only one column.

Command line (writes a normal comma-separated copy, which the web app's upload page needs):

    python -m app.ml.csvio data/raw/UNSW_NB15_testing-set.csv data/raw/UNSW_NB15_testing-set.comma.csv
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

CANDIDATES = [",", "\t", ";", "|"]


class UnreadableTable(Exception):
    """The file could not be read as a table with more than one column."""


def detect_separator(path: str | Path) -> str:
    """Pick the separator that occurs most often in the first line. Comma wins ties."""
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as handle:
        first_line = handle.readline().lstrip("﻿")
    counts = {sep: first_line.count(sep) for sep in CANDIDATES}
    best = max(CANDIDATES, key=lambda s: (counts[s], s == ","))
    if counts[best] == 0:
        raise UnreadableTable(
            f"{Path(path).name}: the first line has no comma, tab, semicolon or pipe, so it cannot be a table "
            "with several columns. Is this the right file?"
        )
    return best


def read_table(path: str | Path) -> pd.DataFrame:
    """Read a delimited text file, detecting the separator. Never returns a one-column table."""
    sep = detect_separator(path)
    frame = pd.read_csv(path, sep=sep, low_memory=False, encoding="utf-8-sig", encoding_errors="replace")
    if frame.shape[1] < 2:
        raise UnreadableTable(f"{Path(path).name}: only one column was found with separator {sep!r}.")
    return frame


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python -m app.ml.csvio <input file> <output comma-separated file>")
        return 2
    source, target = Path(argv[0]), Path(argv[1])
    if source.resolve() == target.resolve():
        print("The output file must be a different file from the input.")
        return 2
    try:
        frame = read_table(source)
    except UnreadableTable as err:
        print(f"Error: {err}")
        return 1
    frame.to_csv(target, index=False)
    print(f"Read {len(frame):,} rows and {frame.shape[1]} columns from {source.name}; wrote {target} (comma-separated).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
