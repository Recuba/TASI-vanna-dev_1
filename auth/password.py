"""
Password hashing utilities using bcrypt.

All passwords are hashed with bcrypt before storage. Each hash includes
a unique salt, so identical passwords produce different hashes.
"""

import bcrypt


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt. Returns the hash string."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )
