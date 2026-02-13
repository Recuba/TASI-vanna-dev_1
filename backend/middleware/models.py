"""
Pydantic models for rate limiting.

Defines the RateLimitResult returned by the RateLimiter after evaluating
a request, and related configuration types.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class RateLimitResult(BaseModel):
    """Result of a rate limit check for a single request.

    Attributes
    ----------
    allowed : bool
        Whether the request is allowed to proceed.
    limit : int
        Maximum requests allowed in the current window.
    remaining : int
        Requests remaining in the current window.
    reset_after : int
        Seconds until the window resets (used for Retry-After header).
    identifier : str
        The rate limit key (user ID or IP address).
    bucket : str
        The rate limit bucket that was matched (e.g. path prefix or "_default").
    """

    allowed: bool
    limit: int
    remaining: int = Field(ge=0)
    reset_after: int = Field(ge=0)
    identifier: str
    bucket: str = "_default"
