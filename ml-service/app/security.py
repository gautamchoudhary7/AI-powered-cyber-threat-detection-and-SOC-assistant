"""Shared-secret check between our backend and the ML service.

The service has no user accounts, so when it can be reached from the internet only a caller that knows
ML_INTERNAL_KEY may score traffic or read model details. /health stays open (it shows no data) so hosting
platforms can check that the service is alive.
"""
from __future__ import annotations

import hmac

from app import config
from app.errors import ApiError

MIN_KEY_LENGTH = 16


def key_problem(expected: str, required: bool) -> str | None:
    """Why the configured key cannot be used, or None if the service may run."""
    if not expected:
        if required:
            return "ML_REQUIRE_KEY is true but ML_INTERNAL_KEY is not set, so the service is turned off."
        return None  # local development: no key, no check
    if expected.lower().startswith("replace") or len(expected) < MIN_KEY_LENGTH:
        return f"ML_INTERNAL_KEY is still the placeholder or shorter than {MIN_KEY_LENGTH} characters, so the service is turned off."
    return None


def check_internal_key(provided: str | None, expected: str, required: bool) -> None:
    problem = key_problem(expected, required)
    if problem:
        raise ApiError(503, "access_not_configured", problem)
    if not expected:
        return
    # compare_digest takes the same time however many characters match, so the key cannot be guessed by timing
    if not provided or not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise ApiError(403, "forbidden", "Not allowed")


def require_internal_key_value(provided: str | None) -> None:
    """Reads the settings at call time so tests (and a restart) can change them."""
    check_internal_key(provided, config.ML_INTERNAL_KEY, config.ML_REQUIRE_KEY)
