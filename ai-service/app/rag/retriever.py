"""Turns a question into cited passages. The retriever never writes an answer; it only finds evidence."""
from __future__ import annotations

from dataclasses import dataclass

from app.rag.stores import Store


class InvalidQuery(ValueError):
    pass


@dataclass(frozen=True)
class Citation:
    chunk_id: str
    title: str
    publisher: str
    url: str
    reference: str
    section: str
    snippet: str
    score: float


def clean_query(query: object, max_chars: int) -> str:
    if not isinstance(query, str):
        raise InvalidQuery("The question must be text.")
    text = " ".join(query.split())
    if not text:
        raise InvalidQuery("The question is empty.")
    if len(text) > max_chars:
        raise InvalidQuery(f"The question is too long (at most {max_chars} characters).")
    return text


def _snippet(text: str, limit: int) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


class Retriever:
    def __init__(self, store: Store, max_query_chars: int = 500, max_top_k: int = 10, snippet_chars: int = 600,
                 min_score: float = 0.0) -> None:
        self.store = store
        self.max_query_chars = max_query_chars
        self.max_top_k = max_top_k
        self.snippet_chars = snippet_chars
        self.min_score = min_score

    def retrieve(self, query: object, top_k: int = 4) -> list[Citation]:
        text = clean_query(query, self.max_query_chars)
        k = max(1, min(int(top_k), self.max_top_k))
        hits = [h for h in self.store.search(text, k) if h.score > self.min_score]
        return [
            Citation(h.chunk.chunk_id, h.chunk.title, h.chunk.publisher, h.chunk.url, h.chunk.reference,
                     h.chunk.section, _snippet(h.chunk.text, self.snippet_chars), round(h.score, 4))
            for h in hits
        ]
