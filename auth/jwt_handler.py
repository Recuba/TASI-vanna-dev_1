"""
JWT token creation and verification.

Uses PyJWT with HS256 for signing. Supports two token types:
- access: short-lived, carries user claims for API authorization
- refresh: long-lived, used only to obtain new access tokens
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt

from config import get_settings


def _get_auth_settings():
    return get_settings().auth


def create_access_token(data: Dict[str, Any]) -> str:
    """Create a short-lived access token.

    Parameters
    ----------
    data : dict
        Claims to include in the token. Must include "sub" (user ID).

    Returns
    -------
    str
        Encoded JWT string.
    """
    auth = _get_auth_settings()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=auth.access_token_expire_minutes)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, auth.jwt_secret, algorithm=auth.jwt_algorithm)


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create a long-lived refresh token.

    Parameters
    ----------
    data : dict
        Claims to include in the token. Must include "sub" (user ID).

    Returns
    -------
    str
        Encoded JWT string.
    """
    auth = _get_auth_settings()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=auth.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, auth.jwt_secret, algorithm=auth.jwt_algorithm)


def decode_token(token: str, expected_type: Optional[str] = None) -> Dict[str, Any]:
    """Decode and validate a JWT token.

    Parameters
    ----------
    token : str
        The encoded JWT string.
    expected_type : str, optional
        If provided, verify the token's "type" claim matches. Use "access"
        or "refresh".

    Returns
    -------
    dict
        Decoded token payload.

    Raises
    ------
    jwt.ExpiredSignatureError
        If the token has expired.
    jwt.InvalidTokenError
        If the token is malformed or signature is invalid.
    ValueError
        If expected_type is provided and does not match the token's type claim.
    """
    auth = _get_auth_settings()
    payload = jwt.decode(token, auth.jwt_secret, algorithms=[auth.jwt_algorithm])

    if expected_type is not None:
        token_type = payload.get("type")
        if token_type != expected_type:
            raise ValueError(f"Expected token type '{expected_type}', got '{token_type}'")

    return payload
