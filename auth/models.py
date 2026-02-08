"""
Pydantic models for authentication requests and responses.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    """Request body for user registration."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: Optional[str] = Field(None, max_length=100)


class UserLogin(BaseModel):
    """Request body for user login."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Response containing access and refresh tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


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
