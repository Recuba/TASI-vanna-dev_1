"""
Pydantic models for authentication requests and responses.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    """Request body for user registration.

    Accepts both ``display_name`` and ``name`` for the user's display name
    so the frontend can send ``{ "name": "..." }`` while the backend stores
    it as ``display_name``.
    """

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: Optional[str] = Field(None, max_length=100, alias="name")

    model_config = {"populate_by_name": True}


class UserLogin(BaseModel):
    """Request body for user login."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Response containing access and refresh tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuthResponse(BaseModel):
    """Response returned by login and register endpoints.

    Includes both tokens and user info so the frontend can persist
    the user identity without an extra /me call.  Field names match
    what the frontend ``use-auth`` hook expects:
    ``token``, ``user_id``, ``name``.
    """

    token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    name: str


class TokenRefreshRequest(BaseModel):
    """Request body for refreshing an access token."""

    refresh_token: str


class UserProfile(BaseModel):
    """Response model for the current user's profile."""

    id: str
    email: str
    display_name: Optional[str] = None
    subscription_tier: str
    usage_count: int
    is_active: bool
    created_at: Optional[datetime] = None
