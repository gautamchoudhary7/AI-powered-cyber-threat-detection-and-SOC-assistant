from app.rag.documents import load_documents, parse_front_matter
from tests.conftest import HEADER, RANSOM, write_doc


def test_front_matter_is_read_and_removed_from_the_body():
    meta, body = parse_front_matter("---\ntitle: T\nurl: https://x.org\n---\nHello")
    assert meta == {"title": "T", "url": "https://x.org"}
    assert body.strip() == "Hello"


def test_text_without_a_closed_header_has_no_metadata():
    assert parse_front_matter("no header here")[0] == {}
    assert parse_front_matter("---\ntitle: T\nnever closed")[0] == {}


def test_loads_documents_with_all_source_fields(knowledge):
    result = load_documents(knowledge)
    assert result.skipped == []
    by_title = {d.title: d for d in result.documents}
    assert set(by_title) == {"Ransomware Guide", "Scanning Notes"}
    d = by_title["Ransomware Guide"]
    assert (d.publisher, d.url, d.reference) == ("CISA", "https://example.org/ransomware", "Guide 1")
    assert d.doc_id == "ransomware-md" and len(d.sha256) == 64
    assert by_title["Scanning Notes"].doc_id == "sub-scanning-txt"  # subfolders work


def test_a_file_without_a_source_is_skipped_and_reported(tmp_path):
    (tmp_path / "bad.md").write_text("---\ntitle: Only a title\n---\n" + RANSOM, encoding="utf-8")
    (tmp_path / "nohdr.md").write_text(RANSOM, encoding="utf-8")
    result = load_documents(tmp_path)
    assert result.documents == []
    reasons = {s["file"]: s["reason"] for s in result.skipped}
    assert "publisher" in reasons["bad.md"] and "url" in reasons["bad.md"]
    assert "missing front matter" in reasons["nohdr.md"]


def test_bad_urls_are_rejected_but_local_is_allowed(tmp_path):
    write_doc(tmp_path, "js.md", url="javascript:alert(1)")
    write_doc(tmp_path, "own.md", url="local")
    result = load_documents(tmp_path)
    assert [d.doc_id for d in result.documents] == ["own-md"]
    assert result.skipped[0]["file"] == "js.md"


def test_readme_other_file_types_and_oversize_files_are_ignored_or_skipped(tmp_path):
    (tmp_path / "README.md").write_text("instructions for people", encoding="utf-8")
    (tmp_path / "notes.pdf").write_bytes(b"%PDF")
    write_doc(tmp_path, "big.md", body="x " * 5000)
    result = load_documents(tmp_path, max_bytes=1000)
    assert result.documents == []
    assert [s["file"] for s in result.skipped] == ["big.md"]


def test_control_characters_are_removed_and_tiny_files_skipped(tmp_path):
    write_doc(tmp_path, "ctl.md", body="Clean\x00 text\x07 here. " + "More words to pass the minimum length check. " * 3)
    (tmp_path / "tiny.md").write_text(HEADER.format(title="T", publisher="P", url="local", extra="") + "short", encoding="utf-8")
    result = load_documents(tmp_path)
    assert len(result.documents) == 1 and "\x00" not in result.documents[0].text and "\x07" not in result.documents[0].text
    assert result.skipped[0]["reason"] == "no usable text"


def test_missing_folder_is_reported_not_crashed(tmp_path):
    result = load_documents(tmp_path / "nope")
    assert result.documents == [] and "does not exist" in result.skipped[0]["reason"]
