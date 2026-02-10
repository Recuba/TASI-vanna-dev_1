"""
FastAPI dependency functions for authentication.

Provides injectable dependencies for route handlers:
- get_current_user: extracts and validates the Bearer token, returns user dict
- require_admin: ensures the current user has admin-level access
"""

from __future__ import annotations

from typing import Any, Dict

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.jwt_handler import decode_token
from api.dependencies import get_db_connection

_bearer_scheme = HTTPBearer()
_bearer_scheme_optional = HTTPBearer(auto_error=False)


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        _bearer_scheme_optional
    ),
) -> Dict[str, Any] | None:
    """Extract and validate the access token if present.

    Returns the user dict if a valid token is provided, or None if no
    Authorization header is present.  Used by read endpoints that should
    degrade gracefully for unauthenticated callers.
    """
    if credentials is None:
        return None
    # Delegate to the strict version; let its HTTPExceptions propagate
    # (expired / invalid tokens should still be rejected).
    return get_current_user(credentials)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> Dict[str, Any]:
    """Extract and validate the access token from the Authorization header.

    Returns a dict with user fields from the database:
    id, email, display_name, subscription_tier, usage_count, is_active.

    Raises HTTPException 401 if the token is missing, expired, or invalid,
    or if the user account is deactivated.
    """
    token = credentials.credentials
    try:
        payload = decode_token(token, expected_type="access")
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch user from database to ensure they still exist and are active
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, display_name, subscription_tier, "
                "usage_count, is_active, created_at "
                "FROM users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = {
        "id": str(row[0]),
        "email": row[1],
        "display_name": row[2],
        "subscription_tier": row[3],
        "usage_count": row[4],
        "is_active": row[5],
        "created_at": row[6],
    }

    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_admin(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Ensure the current user has admin-level access.

    Admin access is granted to users with subscription_tier 'enterprise'.

    Returns the user dict if authorized; raises HTTPException 403 otherwise.
    """
    if current_user.get("subscription_tier") != "enterprise":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
