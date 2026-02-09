"""
Authentication service for user registration, login, and token management.

Separates database operations and auth logic from route handlers.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from auth.jwt_handler import create_access_token, create_refresh_token, decode_token
from auth.password import hash_password, verify_password

logger = logging.getLogger(__name__)


@dataclass
class AuthResult:
    """Result of an authentication operation."""

    success: bool
    user_id: Optional[str] = None
    email: Optional[str] = None
    error: Optional[str] = None
    error_code: int = 401


class AuthService:
    """Handles user authentication against the PostgreSQL users table."""

    def __init__(self, get_conn: Callable):
        self._get_conn = get_conn

    def register(self, email: str, password: str, display_name: Optional[str] = None) -> AuthResult:
        """Register a new user account.

        Returns AuthResult with success=True and tokens on success,
        or success=False with error details on failure.
        """
        password_hash = hash_password(password)

        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                if cur.fetchone() is not None:
                    return AuthResult(success=False, error="Email already registered", error_code=409)

                cur.execute(
                    "INSERT INTO users (auth_provider, auth_provider_id, email, display_name) "
                    "VALUES (%s, %s, %s, %s) RETURNING id",
                    ("local", password_hash, email, display_name),
                )
                user_id = str(cur.fetchone()[0])
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return AuthResult(success=True, user_id=user_id, email=email)

    def login(self, email: str, password: str) -> AuthResult:
        """Authenticate a user by email and password.

        Returns AuthResult with user_id on success, or error on failure.
        """
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, auth_provider_id, is_active "
                    "FROM users "
                    "WHERE email = %s AND auth_provider = %s",
                    (email, "local"),
                )
                row = cur.fetchone()
        finally:
            conn.close()

        if row is None:
            return AuthResult(success=False, error="Invalid email or password")

        user_id, stored_hash, is_active = str(row[0]), row[1], row[2]

        if not is_active:
            return AuthResult(success=False, error="Account is deactivated")

        if not verify_password(password, stored_hash):
            return AuthResult(success=False, error="Invalid email or password")

        return AuthResult(success=True, user_id=user_id, email=email)

    def verify_user_active(self, user_id: str) -> AuthResult:
        """Verify that a user exists and is active."""
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT is_active FROM users WHERE id = %s", (user_id,))
                row = cur.fetchone()
        finally:
            conn.close()

        if row is None:
            return AuthResult(success=False, error="User not found")

        if not row[0]:
            return AuthResult(success=False, error="Account is deactivated")

        return AuthResult(success=True, user_id=user_id)

    @staticmethod
    def build_token_claims(user_id: str, email: str) -> Dict[str, Any]:
        """Build JWT claims for a user."""
        return {"sub": user_id, "email": email}

    @staticmethod
    def create_tokens(claims: Dict[str, Any]) -> Dict[str, str]:
        """Create access and refresh tokens from claims."""
        return {
            "access_token": create_access_token(claims),
            "refresh_token": create_refresh_token(claims),
        }
