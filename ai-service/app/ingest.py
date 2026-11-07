"""Builds the knowledge index from the files in knowledge/.

Run from the ai-service folder:
    python -m app.ingest            # uses RAG_STORE (default: chroma)
    python -m app.ingest --store keyword
Re-running rebuilds the index from scratch, so it always matches the files on disk.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from app import config
from app.rag.chunker import chunk_document
from app.rag.documents import load_documents
from app.rag.stores import Store, StoreUnavailable, make_store


def build_index(store: Store, knowledge_dir: Path, manifest_path: Path | None,
                chunk_chars: int = 1200, overlap: int = 150, max_bytes: int = 2 * 1024 * 1024) -> dict:
    loaded = load_documents(knowledge_dir, max_bytes)
    chunks = []
    for doc in loaded.documents:
        chunks.extend(chunk_document(doc, chunk_chars, overlap))

    store.reset()
    if chunks:
        store.add(chunks)

    manifest = {
        "store": store.name,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "documents": [
            {"doc_id": d.doc_id, "title": d.title, "publisher": d.publisher, "url": d.url, "sha256": d.sha256}
            for d in loaded.documents
        ],
        "document_count": len(loaded.documents),
        "chunk_count": len(chunks),
        "skipped": loaded.skipped,
    }
    if manifest_path is not None:
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the knowledge index.")
    parser.add_argument("--store", choices=["chroma", "keyword"], default=config.STORE)
    args = parser.parse_args(argv)

    try:
        store = make_store(args.store, config.CHROMA_PATH)
    except StoreUnavailable as exc:
        print(f"Cannot build the index: {exc}", file=sys.stderr)
        return 2

    m = build_index(store, config.KNOWLEDGE_DIR, config.INDEX_MANIFEST, config.CHUNK_CHARS, config.CHUNK_OVERLAP, config.MAX_FILE_BYTES)
    print(f"Store: {m['store']}  Documents: {m['document_count']}  Chunks: {m['chunk_count']}")
    for s in m["skipped"]:
        print(f"  skipped {s['file']}: {s['reason']}")
    if m["document_count"] == 0:
        print("No documents were indexed. See knowledge/README.md for how to add some.", file=sys.stderr)
        return 1
    if args.store == "keyword":
        print("Note: the keyword index lives in memory only. The API builds it itself on start; use chroma for a saved index.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
