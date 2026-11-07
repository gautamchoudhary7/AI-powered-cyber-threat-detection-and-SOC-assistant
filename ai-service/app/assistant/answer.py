"""Answers a question from retrieved passages and case data, then checks the citations the model used."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.assistant.llm import LlmClient
from app.assistant.prompt import build_prompt, clean_case_data
from app.rag.retriever import Citation, clean_query
from app.service import KnowledgeService, NotIndexed

_MARKER = re.compile(r"\[S(\d{1,3})\]")
MAX_ANSWER_CHARS = 4000


@dataclass
class Source:
    id: str
    title: str
    publisher: str
    url: str
    reference: str
    section: str
    snippet: str
    score: float
    cited: bool = False


@dataclass
class AssistantAnswer:
    question: str
    answer: str | None  # None when no language model produced text
    generated: bool
    sources: list[Source] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    model: str | None = None


def check_citations(text: str, source_count: int) -> tuple[str, set[int]]:
    """Removes [Sn] markers that point at no real passage and returns (clean text, numbers actually cited)."""
    used: set[int] = set()

    def keep(match: re.Match) -> str:
        n = int(match.group(1))
        if 1 <= n <= source_count:
            used.add(n)
            return match.group(0)
        return ""

    cleaned = _MARKER.sub(keep, text)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    return cleaned, used


def _to_sources(citations: list[Citation]) -> list[Source]:
    return [
        Source(f"S{i}", c.title, c.publisher, c.url, c.reference, c.section, c.snippet, c.score)
        for i, c in enumerate(citations, start=1)
    ]


def answer_question(question: object, case_data: object, hint: object, knowledge: KnowledgeService,
                    llm: LlmClient | None, top_k: int = 4, max_query_chars: int = 500) -> AssistantAnswer:
    q = clean_query(question, max_query_chars)
    sections = clean_case_data(case_data)
    notes: list[str] = []

    # The hint (for example the predicted attack category) helps find relevant documents; it is only a search word.
    search_text = q
    if isinstance(hint, str) and hint.strip():
        search_text = f"{q} {' '.join(hint.split())[:100]}"[:max_query_chars]

    try:
        citations = knowledge.search(search_text, top_k)
    except NotIndexed:
        citations = []
        notes.append("The knowledge base is empty, so no reference documents were used.")
    sources = _to_sources(citations)

    if llm is None:
        notes.append("No language model is configured, so no answer was written. These are the most relevant passages found.")
        return AssistantAnswer(q, None, False, sources, notes)

    if not citations and not sections:
        notes.append("Nothing in the knowledge base matches this question and no case data was given, so no answer was generated.")
        return AssistantAnswer(q, None, False, sources, notes, llm.model)

    system, user = build_prompt(q, citations, sections)
    result = llm.generate(system, user)  # LlmError propagates to the caller
    text, used = check_citations(result.text[:MAX_ANSWER_CHARS], len(sources))
    for s in sources:
        s.cited = int(s.id[1:]) in used

    if not citations:
        notes.append("No reference document supported this answer; it is based only on the case data provided.")
    elif not used:
        notes.append("The answer cites no source. Treat it as unverified.")
    return AssistantAnswer(q, text, True, sources, notes, llm.model)
