"""Ties the pieces together for the API: opens the store, reports honest status, answers searches."""
from __future__ import annotations

import json
from pathlib import Path

from app import config
from app.ingest import build_index
from app.rag.retriever import Citation, Retriever
from app.rag.stores import Store, make_store


class NotIndexed(RuntimeError):
    """There is nothing to search yet (no documents indexed). Never answered with made-up results."""


class KnowledgeService:
    def __init__(self, store: Store, knowledge_dir: Path, manifest_path: Path | None, min_score: float = 0.0,
                 chunk_chars: int = 1200, overlap: int = 150) -> None:
        self.store = store
        self.knowledge_dir = knowledge_dir
        self.manifest_path = manifest_path
        self.retriever = Retriever(store, config.MAX_QUERY_CHARS, config.MAX_TOP_K, min_score=min_score)
        self._chunk_chars, self._overlap = chunk_chars, overlap
        self._ready = False

    @classmethod
    def from_config(cls) -> "KnowledgeService":
        return cls(make_store(config.STORE, config.CHROMA_PATH), config.KNOWLEDGE_DIR, config.INDEX_MANIFEST,
                   config.MIN_SCORE, config.CHUNK_CHARS, config.CHUNK_OVERLAP)

    def ensure_ready(self) -> None:
        # The keyword index exists only in memory, so it is built from the files on first use.
        # A chroma index is saved on disk by `python -m app.ingest`, so it is only opened here.
        if not self._ready and self.store.name == "keyword":
            build_index(self.store, self.knowledge_dir, self.manifest_path, self._chunk_chars, self._overlap)
        self._ready = True

    def _manifest(self) -> dict:
        if self.manifest_path and self.manifest_path.is_file():
            try:
                return json.loads(self.manifest_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                return {}
        return {}

    def status(self) -> dict:
        self.ensure_ready()
        chunks = self.store.count()
        m = self._manifest()
        return {
            "indexed": chunks > 0,
            "store": self.store.name,
            "chunk_count": chunks,
            "document_count": m.get("document_count", 0) if chunks else 0,
            "built_at": m.get("built_at") if chunks else None,
            "documents": [{"title": d["title"], "publisher": d["publisher"], "url": d["url"]} for d in m.get("documents", [])] if chunks else [],
            "skipped": m.get("skipped", []),
        }

    def search(self, query: object, top_k: int = 4) -> list[Citation]:
        self.ensure_ready()
        if self.store.count() == 0:
            raise NotIndexed("The knowledge base is empty. Add documents to knowledge/ and run: python -m app.ingest")
        return self.retriever.retrieve(query, top_k)
