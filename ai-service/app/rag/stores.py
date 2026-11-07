"""Places where chunks are stored and searched.

Both stores have the same four methods, so the rest of the code does not care which one is used:
    reset(), add(chunks), count(), search(query, k) -> list[Hit]
A Hit's score is higher for a better match. Scores from different stores are NOT comparable.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.rag.chunker import Chunk

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = frozenset(
    ("a an and are as at be but by for from has have in into is it its of on or that the their this to was were will with "
     "how what when where which who why do does did can could should would i me my we our you your about after before "
     "if not so than then there these those they them").split()
)


class StoreUnavailable(RuntimeError):
    """The chosen store cannot be used (package missing, index not built)."""


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    score: float


class Store(Protocol):
    name: str

    def reset(self) -> None: ...
    def add(self, chunks: list[Chunk]) -> None: ...
    def count(self) -> int: ...
    def search(self, query: str, k: int) -> list[Hit]: ...


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


class KeywordStore:
    """BM25 ranking in plain Python. Finds passages that share words with the question; it does not understand
    meaning (it will miss synonyms). Kept as a dependency-free fallback and for tests."""

    name = "keyword"

    def __init__(self, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1, self.b = k1, b
        self.reset()

    def reset(self) -> None:
        self._chunks: list[Chunk] = []
        self._tf: list[Counter] = []
        self._len: list[int] = []
        self._df: Counter = Counter()

    def add(self, chunks: list[Chunk]) -> None:
        for c in chunks:
            # the title and heading are searchable too: "ransomware guide" should find the ransomware guide
            tokens = tokenize(f"{c.title} {c.section} {c.text}")
            tf = Counter(tokens)
            self._chunks.append(c)
            self._tf.append(tf)
            self._len.append(len(tokens))
            self._df.update(tf.keys())

    def count(self) -> int:
        return len(self._chunks)

    def search(self, query: str, k: int) -> list[Hit]:
        terms = list(dict.fromkeys(tokenize(query)))
        n = len(self._chunks)
        if not terms or n == 0:
            return []
        avg = (sum(self._len) / n) or 1.0
        scored: list[Hit] = []
        for i, tf in enumerate(self._tf):
            score = 0.0
            for t in terms:
                f = tf.get(t, 0)
                if not f:
                    continue
                idf = math.log(1 + (n - self._df[t] + 0.5) / (self._df[t] + 0.5))
                score += idf * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self._len[i] / avg))
            if score > 0:  # no shared word = not a match, never a "closest guess"
                scored.append(Hit(self._chunks[i], score))
        scored.sort(key=lambda h: (-h.score, h.chunk.chunk_id))
        return scored[:k]


class ChromaStore:
    """Vector search with ChromaDB (stored on disk). Uses Chroma's built-in embedding model, which is downloaded
    the first time it is used (so that first run needs internet). Not exercised by the automated tests here."""

    name = "chroma"
    _COLLECTION = "soc_knowledge"

    def __init__(self, path: Path) -> None:
        try:
            import chromadb  # imported here so the rest of the service works without it
        except ImportError as exc:
            raise StoreUnavailable("chromadb is not installed. Run: pip install -r requirements.txt") from exc
        self._chromadb = chromadb
        self._client = chromadb.PersistentClient(path=str(path))

    def _collection(self, create: bool = True):
        if create:
            return self._client.get_or_create_collection(self._COLLECTION, metadata={"hnsw:space": "cosine"})
        return self._client.get_collection(self._COLLECTION)

    def reset(self) -> None:
        try:
            self._client.delete_collection(self._COLLECTION)
        except Exception:  # nothing to delete the first time
            pass
        self._collection()

    def add(self, chunks: list[Chunk]) -> None:
        col = self._collection()
        for i in range(0, len(chunks), 100):  # small batches
            part = chunks[i:i + 100]
            col.add(
                ids=[c.chunk_id for c in part],
                documents=[f"{c.title}. {c.section}. {c.text}" for c in part],
                metadatas=[
                    {"doc_id": c.doc_id, "title": c.title, "publisher": c.publisher, "url": c.url,
                     "reference": c.reference, "section": c.section, "index": c.index, "text": c.text}
                    for c in part
                ],
            )

    def count(self) -> int:
        try:
            return self._collection(create=False).count()
        except Exception:
            return 0

    def search(self, query: str, k: int) -> list[Hit]:
        try:
            col = self._collection(create=False)
        except Exception as exc:
            raise StoreUnavailable("The knowledge index has not been built. Run: python -m app.ingest") from exc
        if col.count() == 0:
            return []
        res = col.query(query_texts=[query], n_results=min(k, col.count()))
        hits = []
        for meta, dist, cid in zip(res["metadatas"][0], res["distances"][0], res["ids"][0]):
            chunk = Chunk(cid, meta["doc_id"], meta["title"], meta["publisher"], meta["url"], meta["reference"],
                          meta["section"], int(meta["index"]), meta["text"])
            hits.append(Hit(chunk, 1.0 - float(dist)))  # cosine distance -> similarity
        return hits


def make_store(kind: str, chroma_path: Path) -> Store:
    if kind == "keyword":
        return KeywordStore()
    if kind == "chroma":
        return ChromaStore(chroma_path)
    raise ValueError(f"Unknown RAG_STORE '{kind}'. Use 'chroma' or 'keyword'.")
