"""Password hashing and username generation (standard library only)."""

import hashlib
import hmac
import secrets
import string

_ALGORITHM = "sha256"
_ITERATIONS = 210_000
_USERNAME_CHARS = string.ascii_lowercase + string.digits
USERNAME_LENGTH = 6


def hash_password(password):
    """Return a string like 'pbkdf2_sha256$210000$<salt>$<hash>'."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        _ALGORITHM, password.encode("utf-8"), bytes.fromhex(salt), _ITERATIONS
    ).hex()
    return f"pbkdf2_{_ALGORITHM}${_ITERATIONS}${salt}${digest}"


def verify_password(password, stored_hash):
    """Check a plain password against a stored hash. Never raises."""
    try:
        scheme, iterations, salt, expected = stored_hash.split("$")
        algorithm = scheme.removeprefix("pbkdf2_")
        candidate = hashlib.pbkdf2_hmac(
            algorithm, password.encode("utf-8"), bytes.fromhex(salt), int(iterations)
        ).hex()
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(candidate, expected)


def generate_username():
    """Random 6-character username, e.g. 'k3x9qa'."""
    return "".join(secrets.choice(_USERNAME_CHARS) for _ in range(USERNAME_LENGTH))