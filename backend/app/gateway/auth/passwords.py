"""Password hashing helpers for the thin Gateway auth layer."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

PBKDF2_ITERATIONS = 120_000
HASH_NAME = "sha256"


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("password")
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac(HASH_NAME, password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    salt_b64 = base64.b64encode(salt).decode("ascii")
    hash_b64 = base64.b64encode(derived).decode("ascii")
    return f"pbkdf2_{HASH_NAME}${PBKDF2_ITERATIONS}${salt_b64}${hash_b64}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, iterations_raw, salt_b64, hash_b64 = stored_hash.split("$", 3)
    except ValueError:
        return False

    if algo != f"pbkdf2_{HASH_NAME}":
        return False

    try:
        iterations = int(iterations_raw)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(hash_b64.encode("ascii"))
    except Exception:
        return False

    candidate = hashlib.pbkdf2_hmac(HASH_NAME, password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, expected)
