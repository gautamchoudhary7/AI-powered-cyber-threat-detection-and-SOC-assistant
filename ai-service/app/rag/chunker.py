"""Splits a document into overlapping chunks, remembering which heading each chunk sits under."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from app.rag.documents import Document

_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(.*\S)\s*$")


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    doc_id: str
    title: str
    publisher: str
    url: str
    reference: str
    section: str
    index: int
    text: str


def _hard_split(block: str, size: int) -> list[str]:
    """Splits one very long block on spaces, so no piece is longer than `size`."""
    pieces, current = [], ""
    for word in block.split(" "):
        if len(word) > size:  # a single huge token: cut it
            if current:
                pieces.append(current)
                current = ""
            pieces.extend(word[i:i + size] for i in range(0, len(word), size))
            continue
        if len(current) + len(word) + 1 > size and current:
            pieces.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        pieces.append(current)
    return pieces


def _tail(text: str, overlap: int) -> str:
    """The last `overlap` characters, cut forward to a word boundary."""
    if overlap <= 0 or len(text) <= overlap:
        return text if overlap > 0 else ""
    cut = text[-overlap:]
    space = cut.find(" ")
    return cut[space + 1:] if space != -1 else cut


def chunk_document(doc: Document, max_chars: int = 1200, overlap: int = 150) -> list[Chunk]:
    if max_chars < 200:
        raise ValueError("max_chars must be at least 200")
    if not 0 <= overlap < max_chars // 2:
        raise ValueError("overlap must be between 0 and half of max_chars")

    # 1. blocks (paragraphs) with the heading that was active when each began
    blocks: list[tuple[str, str, bool]] = []  # (heading, text, starts_a_new_section)
    heading = ""
    for para in re.split(r"\n\s*\n", doc.text):
        para = para.strip()
        if not para:
            continue
        first = para.split("\n", 1)[0]
        m = _HEADING.match(first)
        if m:
            heading = m.group(1)
        new_section = bool(m)
        flat = re.sub(r"[ \t]*\n[ \t]*", "\n", para)
        for piece in ([flat] if len(flat) <= max_chars else _hard_split(flat.replace("\n", " "), max_chars)):
            blocks.append((heading, piece, new_section))
            new_section = False

    # 2. pack blocks into chunks
    chunks: list[Chunk] = []
    buf, buf_heading = "", ""

    def flush() -> None:
        nonlocal buf
        text = buf.strip()
        # A chunk made only of heading lines carries no information, so it is dropped.
        if text and not all(_HEADING.match(line) for line in text.split("\n") if line.strip()):
            idx = len(chunks)
            cid = hashlib.sha1(f"{doc.doc_id}:{idx}:{text}".encode("utf-8")).hexdigest()[:16]
            chunks.append(Chunk(cid, doc.doc_id, doc.title, doc.publisher, doc.url, doc.reference, buf_heading, idx, text))

    carried = ""  # overlap text that came from the previous chunk
    for heading, piece, new_section in blocks:
        if new_section and buf:
            # A heading always starts a new chunk, so the section shown in a citation matches its text.
            flush()
            buf, carried = "", ""
        candidate = f"{buf}\n\n{piece}" if buf else piece
        if buf and len(candidate) > max_chars:
            flush()
            carried = _tail(buf, overlap)
            buf = f"{carried}\n\n{piece}" if carried and len(carried) + len(piece) + 2 <= max_chars else piece
            buf_heading = heading
        else:
            if not buf:
                buf_heading = heading
            buf = candidate
    # the last chunk is skipped only if it holds nothing but the overlap copied from the one before
    if buf and buf.strip() != carried.strip():
        flush()
    return chunks
