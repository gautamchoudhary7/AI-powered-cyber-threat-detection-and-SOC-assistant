"""Chooses the language-model client from settings. Returns None when none is configured (never a fake)."""
from __future__ import annotations

from app import config
from app.assistant.llm import GeminiClient, LlmClient


def make_llm() -> LlmClient | None:
    if config.LLM_PROVIDER in ("", "none") or not config.LLM_API_KEY:
        return None
    if config.LLM_PROVIDER == "gemini":
        return GeminiClient(config.LLM_API_KEY, config.LLM_MODEL, config.LLM_TIMEOUT, config.LLM_MAX_OUTPUT_TOKENS)
    raise ValueError(f"Unknown LLM_PROVIDER '{config.LLM_PROVIDER}'. Use 'gemini' or 'none'.")
