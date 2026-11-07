"""Loads knowledge documents from a folder.

Every document must say where it came from (title, publisher, url). A file without that is skipped and
reported, so nothing in the index can ever be shown without a citation. The text is treated as data.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

REQUIRED_FIELDS = ("title", "publisher", "url")
ALLOWED_SUFFIXES = {".md", ".txt"}
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


@dataclass(frozen=True)
class Document:
    doc_id: str
    title: str
    publisher: str
    url: str  # an http(s) link, or the word "local" for the project team's own notes
    reference: str  # optional extra label such as "SP 800-61 Rev. 2"
    text: str
    sha256: str


@dataclass
class LoadResult:
    documents: list[Document] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)  # {"file": ..., "reason": ...}


def parse_front_matter(raw: str) -> tuple[dict[str, str], str]:
    """Reads a leading block of `key: value` lines between two `---` lines. Returns (fields, body)."""
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        return {}, "\n".join(lines)
    meta: dict[str, str] = {}
    for i in range(1, len(lines)):
        line = lines[i]
        if line.strip() == "---":
            return meta, "\n".join(lines[i + 1:])
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip().lower()] = value.strip().strip("\"'")
    return {}, "\n".join(lines)  # never closed: treat as having no front matter


def _valid_url(url: str) -> bool:
    return url == "local" or bool(re.match(r"^https?://[^\s]+$", url))


def load_documents(folder: Path, max_bytes: int = 2 * 1024 * 1024) -> LoadResult:
    result = LoadResult()
    if not folder.is_dir():
        result.skipped.append({"file": str(folder), "reason": "knowledge folder does not exist"})
        return result

    for path in sorted(p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in ALLOWED_SUFFIXES):
        rel = path.relative_to(folder).as_posix()
        if path.name.lower() == "readme.md":
            continue  # instructions for people, not knowledge
        if path.stat().st_size > max_bytes:
            result.skipped.append({"file": rel, "reason": f"larger than {max_bytes} bytes"})
            continue
        try:
            raw = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            result.skipped.append({"file": rel, "reason": "not valid UTF-8 text"})
            continue

        meta, body = parse_front_matter(raw)
        missing = [f for f in REQUIRED_FIELDS if not meta.get(f)]
        if missing:
            result.skipped.append({"file": rel, "reason": f"missing front matter: {', '.join(missing)}"})
            continue
        if not _valid_url(meta["url"]):
            result.skipped.append({"file": rel, "reason": "url must start with http:// or https:// (or be 'local')"})
            continue
        text = _CONTROL.sub("", body).strip()
        if len(text) < 50:
            result.skipped.append({"file": rel, "reason": "no usable text"})
            continue

        result.documents.append(
            Document(
                doc_id=re.sub(r"[^a-z0-9]+", "-", rel.lower()).strip("-"),
                title=meta["title"][:200],
                publisher=meta["publisher"][:100],
                url=meta["url"],
                reference=meta.get("reference", "")[:100],
                text=text,
                sha256=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            )
        )
    return result
