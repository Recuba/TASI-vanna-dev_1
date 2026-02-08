"""
Authentication module for TASI AI Platform.

Provides JWT-based authentication with bcrypt password hashing,
access/refresh tokens, and FastAPI dependency injection.
"""

from auth.jwt_handler import create_access_token, create_refresh_token, decode_token
from auth.password import hash_password, verify_password
from auth.dependencies import get_current_user, require_admin
from auth.models import (
    UserCreate,
    UserLogin,
    TokenResponse,
    TokenRefreshRequest,
    UserProfile,
)

__all__ = [
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "hash_password",
    "verify_password",
    "get_current_user",
    "require_admin",
    "UserCreate",
    "UserLogin",
    "TokenResponse",
    "TokenRefreshRequest",
    "UserProfile",
]
