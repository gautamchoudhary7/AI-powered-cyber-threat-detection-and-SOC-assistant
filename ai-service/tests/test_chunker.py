import pytest

from app.rag.chunker import chunk_document
from app.rag.documents import Document


def doc(text):
    return Document("d1", "Title", "Pub", "https://example.org", "Ref", text, "0" * 64)


def test_short_document_is_one_chunk_with_its_source():
    chunks = chunk_document(doc("# Intro\n\nA short paragraph of text about incident response."))
    assert len(chunks) == 1
    c = chunks[0]
    assert (c.title, c.publisher, c.url, c.reference, c.section, c.index) == ("Title", "Pub", "https://example.org", "Ref", "Intro", 0)


def test_chunks_never_exceed_the_limit():
    text = "\n\n".join(f"Paragraph {i} " + "word " * 60 for i in range(40))
    chunks = chunk_document(doc(text), max_chars=500, overlap=50)
    assert len(chunks) > 5
    assert all(len(c.text) <= 500 for c in chunks)


def test_a_single_huge_paragraph_and_a_huge_token_are_split():
    chunks = chunk_document(doc("word " * 1000 + "\n\n" + "x" * 3000), max_chars=400, overlap=0)
    assert all(len(c.text) <= 400 for c in chunks)
    assert "".join(c.text for c in chunks).count("x") == 3000  # nothing lost


def test_each_chunk_remembers_its_heading():
    text = "# One\n\n" + "alpha " * 100 + "\n\n## Two\n\n" + "beta " * 100
    chunks = chunk_document(doc(text), max_chars=400, overlap=0)
    alpha = [c for c in chunks if "alpha" in c.text]
    beta = [c for c in chunks if "beta" in c.text]
    assert alpha and all(c.section == "One" for c in alpha)
    assert beta and beta[-1].section == "Two"


def test_overlap_repeats_the_end_of_the_previous_chunk():
    paras = [f"Sentence number {i} is here. " * 6 for i in range(8)]
    chunks = chunk_document(doc("\n\n".join(paras)), max_chars=500, overlap=100)
    assert len(chunks) >= 2
    for a, b in zip(chunks, chunks[1:]):
        tail = a.text[-60:].split(" ", 1)[-1]
        assert tail[:30] in b.text


def test_ids_are_stable_and_unique():
    text = "\n\n".join(f"Paragraph {i} " + "word " * 60 for i in range(20))
    a = chunk_document(doc(text), 500, 50)
    b = chunk_document(doc(text), 500, 50)
    assert [c.chunk_id for c in a] == [c.chunk_id for c in b]
    assert len({c.chunk_id for c in a}) == len(a)


def test_invalid_settings_are_refused():
    with pytest.raises(ValueError):
        chunk_document(doc("text"), max_chars=50)
    with pytest.raises(ValueError):
        chunk_document(doc("text"), max_chars=400, overlap=300)


def test_empty_text_gives_no_chunks():
    assert chunk_document(doc("   \n\n  ")) == []


def test_headings_start_new_chunks_and_a_bare_heading_is_not_a_chunk():
    text = "# Big title\n\n## Part A\n\nText of part A is long enough to count here.\n\n## Part B\n\nText of part B is also here."
    chunks = chunk_document(doc(text))
    assert [c.section for c in chunks] == ["Part A", "Part B"]  # "# Big title" alone is not a chunk
    assert "Part B" not in chunks[0].text.replace("## Part A", "")
