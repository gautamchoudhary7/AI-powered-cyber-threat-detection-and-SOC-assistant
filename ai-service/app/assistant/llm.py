"""Talks to the language model. Only Google's Gemini REST API is implemented, using the standard library.

The API key is sent in a header (never in the URL), is never logged, and is removed from any error text.
Every failure becomes an LlmError with a `kind`, so the caller can say what really happened.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol


class LlmError(Exception):
    # kind: not_configured | auth | model_not_found | rate_limited | blocked | unavailable | bad_response
    def __init__(self, kind: str, message: str) -> None:
        super().__init__(message)
        self.kind = kind


@dataclass(frozen=True)
class LlmResult:
    text: str
    finish_reason: str | None = None
    total_tokens: int | None = None


class LlmClient(Protocol):
    model: str

    def generate(self, system: str, user: str) -> LlmResult: ...


class GeminiClient:
    DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, api_key: str, model: str, timeout: float = 30.0, max_output_tokens: int = 700,
                 temperature: float = 0.2, base_url: str | None = None) -> None:
        if not api_key:
            raise LlmError("not_configured", "No API key is set.")
        if not model or not all(c.isalnum() or c in "-._" for c in model):
            raise LlmError("not_configured", "LLM_MODEL is missing or contains unexpected characters.")
        self._key = api_key
        self.model = model
        self.timeout = timeout
        self.max_output_tokens = max_output_tokens
        self.temperature = temperature
        self.base_url = (base_url or self.DEFAULT_BASE).rstrip("/")

    def _redact(self, text: str) -> str:
        return text.replace(self._key, "[key]")

    def generate(self, system: str, user: str) -> LlmResult:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": self.temperature, "maxOutputTokens": self.max_output_tokens},
        }
        request = urllib.request.Request(
            f"{self.base_url}/models/{self.model}:generateContent",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": self._key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 (fixed https base)
                raw = response.read(2_000_000)
        except urllib.error.HTTPError as exc:
            raise self._http_error(exc.code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise LlmError("unavailable", "The language model could not be reached (network error or timeout).") from None
        return self._parse(raw)

    @staticmethod
    def _http_error(status: int) -> LlmError:
        if status in (401, 403):
            return LlmError("auth", "The language-model API key was rejected. Check LLM_API_KEY.")
        if status == 404:
            return LlmError("model_not_found", "The language model was not found. Check LLM_MODEL.")
        if status == 429:
            return LlmError("rate_limited", "The language-model usage limit was reached. Wait a while and try again.")
        if status == 400:
            return LlmError("auth", "The language-model request was rejected (often an invalid API key or model setting).")
        return LlmError("unavailable", f"The language-model service returned an error (HTTP {status}).")

    def _parse(self, raw: bytes) -> LlmResult:
        try:
            data = json.loads(raw)
        except ValueError:
            raise LlmError("bad_response", "The language model returned something that is not JSON.") from None
        if not isinstance(data, dict):
            raise LlmError("bad_response", "The language model returned an unexpected format.")
        block = (data.get("promptFeedback") or {}).get("blockReason")
        if block:
            raise LlmError("blocked", "The language model declined to answer this request.")
        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates or not isinstance(candidates[0], dict):
            raise LlmError("bad_response", "The language model returned no answer.")
        cand = candidates[0]
        finish = cand.get("finishReason")
        if finish in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"):
            raise LlmError("blocked", "The language model declined to finish this answer.")
        parts = (cand.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()
        if not text:
            raise LlmError("bad_response", "The language model returned an empty answer.")
        usage = data.get("usageMetadata") or {}
        return LlmResult(self._redact(text), finish, usage.get("totalTokenCount"))
