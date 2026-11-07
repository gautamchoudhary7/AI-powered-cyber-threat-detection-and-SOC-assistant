"""Shared-secret check between our backend and this service.

Every assistant call can spend language-model quota, and this service has no user accounts, so only a caller that
knows INTERNAL_API_KEY may use it. If the key is not set the endpoints refuse to work (secure by default).
"""
from __future__ import annotations

import hmac


class AccessDenied(Exception):
    """The caller did not present the right key."""


class AccessNotConfigured(Exception):
    """INTERNAL_API_KEY is not set on this service."""


MIN_KEY_LENGTH = 16


def key_problem(expected: str) -> str | None:
    """Why the configured key cannot be used, or None if it is acceptable.

    A key copied from .env.example is public knowledge, and a short key is easy to guess, so both are refused.
    """
    if not expected:
        return "INTERNAL_API_KEY is not set, so the assistant is turned off."
    if expected.lower().startswith("replace") or len(expected) < MIN_KEY_LENGTH:
        return (
            f"INTERNAL_API_KEY is still the placeholder or shorter than {MIN_KEY_LENGTH} characters, "
            "so the assistant is turned off. Generate a long random value."
        )
    return None


def check_internal_key(provided: str | None, expected: str) -> None:
    problem = key_problem(expected)
    if problem:
        raise AccessNotConfigured(problem)
    # compare_digest takes the same time however many characters match, so the key cannot be guessed by timing
    if not provided or not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise AccessDenied("Not allowed")
