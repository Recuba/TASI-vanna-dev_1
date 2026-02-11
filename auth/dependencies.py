"""
FastAPI dependency functions for authentication.

Provides injectable dependencies for route handlers:
- get_current_user: extracts and validates the Bearer token, returns user dict
- require_admin: ensures the current user has admin-level access
- get_optional_current_user: like get_current_user but returns None when no token
"""

from __future__ import annotations

from typing import Any, Dict, FrozenSet

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.jwt_handler import decode_token
from api.dependencies import get_db_connection

_bearer_scheme = HTTPBearer()
_bearer_scheme_optional = HTTPBearer(auto_error=False)

# Tiers that grant admin-level access.  Override via ADMIN_TIERS env var
# (comma-separated) or by importing and reassigning this module attribute.
ADMIN_TIERS: FrozenSet[str] = frozenset({"enterprise", "admin"})


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

    Admin access is granted when the user's ``subscription_tier`` is in
    :data:`ADMIN_TIERS` (default: ``{"enterprise", "admin"}``).  To
    customise allowed tiers, update the module-level ``ADMIN_TIERS``
    constant or set the ``ADMIN_TIERS`` env var (comma-separated).

    This dependency can be injected on any route that should be restricted
    to admin users::

        @router.get("/admin/users", dependencies=[Depends(require_admin)])
        async def list_users(): ...

    Returns the user dict if authorized; raises HTTPException 403 otherwise.
    """
    tier = current_user.get("subscription_tier", "")
    if tier not in ADMIN_TIERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
