"""
Authentication API routes.

Endpoints for user registration, login, guest access, token refresh,
and profile retrieval.
Delegates database operations to AuthService for separation of concerns.
The guest endpoint works without a database (generates anonymous tokens).
"""

from __future__ import annotations

import uuid
from typing import Any, Dict

import jwt
from fastapi import APIRouter, Depends, HTTPException, status

from auth.dependencies import get_current_user
from auth.jwt_handler import create_access_token, create_refresh_token, decode_token
from auth.models import (
    AuthResponse,
    TokenRefreshRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserProfile,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _get_auth_service():
    """Get AuthService, importing DB dependencies lazily.

    Returns None if the database backend is not available (e.g. SQLite mode).
    """
    try:
        from api.dependencies import get_db_connection
        from services.auth_service import AuthService

        return AuthService(get_conn=get_db_connection)
    except Exception:
        return None


def _build_tokens(user_id: str, email: str) -> Dict[str, str]:
    """Build access and refresh tokens for a user."""
    claims = {"sub": user_id, "email": email}
    return {
        "access_token": create_access_token(claims),
        "refresh_token": create_refresh_token(claims),
    }


@router.post(
    "/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
async def register(body: UserCreate):
    """Register a new user account.

    Creates a local auth user with bcrypt-hashed password.
    Returns access/refresh tokens and user info so the frontend can
    persist the session without a separate ``/me`` call.

    Raises 409 if the email is already registered.
    Raises 503 if the database backend is not available.
    """
    service = _get_auth_service()
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Registration requires PostgreSQL backend",
        )

    result = service.register(body.email, body.password, body.display_name)

    if not result.success:
        raise HTTPException(
            status_code=result.error_code,
            detail=result.error,
        )

    tokens = _build_tokens(result.user_id, result.email)
    return AuthResponse(
        token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user_id=result.user_id,
        name=body.display_name or body.email,
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: UserLogin):
    """Authenticate a user and return tokens with user info.

    Verifies the email/password against the users table.
    Only works for auth_provider='local' users.

    Raises 401 if credentials are invalid.
    Raises 503 if the database backend is not available.
    """
    service = _get_auth_service()
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login requires PostgreSQL backend",
        )

    result = service.login(body.email, body.password)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=result.error,
        )

    tokens = _build_tokens(result.user_id, result.email)
    return AuthResponse(
        token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user_id=result.user_id,
        name=result.email,
    )


@router.post("/guest", response_model=AuthResponse)
async def guest_login():
    """Generate a guest token for anonymous access.

    No credentials required. Creates a short-lived token with a
    unique guest ID that can be used to access the AI chat and
    other features without registration.
    """
    guest_id = f"guest-{uuid.uuid4().hex[:12]}"
    guest_email = f"{guest_id}@guest.local"
    tokens = _build_tokens(guest_id, guest_email)
    return AuthResponse(
        token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user_id=guest_id,
        name="Guest",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: TokenRefreshRequest):
    """Exchange a valid refresh token for a new access/refresh token pair.

    Raises 401 if the refresh token is expired or invalid.
    """
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
        )

    # For guest tokens, skip DB verification
    if not str(user_id).startswith("guest-"):
        service = _get_auth_service()
        if service is not None:
            result = service.verify_user_active(user_id)
            if not result.success:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=result.error,
                )

    tokens = _build_tokens(user_id, email)
    return TokenResponse(**tokens)


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserProfile(
        id=current_user["id"],
        email=current_user["email"],
        display_name=current_user.get("display_name"),
        subscription_tier=current_user["subscription_tier"],
        usage_count=current_user["usage_count"],
        is_active=current_user["is_active"],
        created_at=current_user.get("created_at"),
    )
