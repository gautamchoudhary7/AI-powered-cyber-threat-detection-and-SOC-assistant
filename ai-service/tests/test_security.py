import pytest

from app.security import AccessDenied, AccessNotConfigured, check_internal_key


def test_the_right_key_is_accepted():
    check_internal_key("a-long-secret-value", "a-long-secret-value")


@pytest.mark.parametrize("provided", [None, "", "wrong", "a-long-secret-valu", "a-long-secret-value "])
def test_missing_or_wrong_keys_are_refused(provided):
    with pytest.raises(AccessDenied):
        check_internal_key(provided, "a-long-secret-value")


def test_no_configured_key_turns_the_feature_off_even_for_an_empty_header():
    for provided in (None, "", "anything"):
        with pytest.raises(AccessNotConfigured):
            check_internal_key(provided, "")


def test_non_ascii_input_does_not_crash():
    with pytest.raises(AccessDenied):
        check_internal_key("pässwörd-✓", "a-long-secret-value")


@pytest.mark.parametrize("weak", ["replace-me-with-a-long-random-value", "Replace-this", "short", "a" * 15])
def test_placeholder_or_short_keys_turn_the_feature_off(weak):
    with pytest.raises(AccessNotConfigured):
        check_internal_key(weak, weak)  # even a caller who sends the same weak value is refused


def test_a_16_character_key_is_accepted():
    key = "k" * 16
    check_internal_key(key, key)
