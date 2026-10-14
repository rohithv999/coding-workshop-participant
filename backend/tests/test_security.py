"""Unit tests: password hashing and username generation (core/security.py)."""

import string

from core.security import USERNAME_LENGTH, generate_username, hash_password, verify_password


def test_correct_password_verifies():
    stored = hash_password("Secret123")
    assert verify_password("Secret123", stored)


def test_wrong_password_is_rejected():
    stored = hash_password("Secret123")
    assert not verify_password("secret123", stored)
    assert not verify_password("", stored)


def test_same_password_gets_different_hashes():
    # A random salt per password means equal passwords don't produce equal hashes
    assert hash_password("Secret123") != hash_password("Secret123")


def test_hash_never_contains_the_plain_password():
    stored = hash_password("Secret123")
    assert "Secret123" not in stored
    assert stored.startswith("pbkdf2_sha256$")


def test_malformed_hash_returns_false_instead_of_crashing():
    for bad in ["", "not-a-hash", "pbkdf2_sha256$abc$def", None]:
        assert verify_password("Secret123", bad) is False


def test_usernames_are_six_lowercase_letters_or_digits():
    allowed = set(string.ascii_lowercase + string.digits)
    for _ in range(50):
        username = generate_username()
        assert len(username) == USERNAME_LENGTH == 6
        assert set(username) <= allowed


def test_usernames_are_random():
    assert len({generate_username() for _ in range(200)}) > 195
