"""
Authentication API routes.

Endpoints for user registration, login, token refresh, and profile retrieval.
All endpoints interact with the PostgreSQL `users` table.
"""

from __future__ import annotations

from typing import Any, Dict

import jwt
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_db_connection
from auth.dependencies import get_current_user
from auth.jwt_handler import create_access_token, create_refresh_token, decode_token
from auth.models import (
    TokenRefreshRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserProfile,
)
from auth.password import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_token_claims(user_id: str, email: str) -> Dict[str, Any]:
    """Build the JWT claims dict for a user."""
    return {"sub": user_id, "email": email}


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
async def register(body: UserCreate):
    """Register a new user account.

    Creates a local auth user with bcrypt-hashed password.
    Returns access and refresh tokens on success.

    Raises 409 if the email is already registered.
    """
    password_hash = hash_password(body.password)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check for existing user with same email
            cur.execute("SELECT id FROM users WHERE email = %s", (body.email,))
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already registered",
                )

            # Insert new user
            cur.execute(
                "INSERT INTO users (auth_provider, auth_provider_id, email, display_name) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                ("local", password_hash, body.email, body.display_name),
            )
            user_id = str(cur.fetchone()[0])
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    claims = _build_token_claims(user_id, body.email)
    return TokenResponse(
        access_token=create_access_token(claims),
        refresh_token=create_refresh_token(claims),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    """Authenticate a user and return tokens.

    Verifies the email/password against the users table.
    Only works for auth_provider='local' users.

    Raises 401 if credentials are invalid.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, auth_provider_id, is_active "
                "FROM users "
                "WHERE email = %s AND auth_provider = %s",
                (body.email, "local"),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user_id, stored_hash, is_active = str(row[0]), row[1], row[2]

    if not is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    if not verify_password(body.password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    claims = _build_token_claims(user_id, body.email)
    return TokenResponse(
        access_token=create_access_token(claims),
        refresh_token=create_refresh_token(claims),
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

    # Verify user still exists and is active
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT is_active FROM users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not row[0]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    claims = _build_token_claims(user_id, email)
    return TokenResponse(
        access_token=create_access_token(claims),
        refresh_token=create_refresh_token(claims),
    )


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
