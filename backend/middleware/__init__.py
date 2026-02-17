"""
Backend rate limiting middleware for Ra'd AI TASI Platform.

Provides a Redis-backed sliding window rate limiter with in-memory fallback,
Pydantic result models, and FastAPI middleware integration.

Usage::

    from backend.middleware import RateLimiter, RateLimitMiddleware, RateLimitResult

    limiter = RateLimiter(redis_url="redis://localhost:6379/1")
    app.add_middleware(
        RateLimitMiddleware,
        limiter=limiter,
        default_limit=60,
        default_window=60,
    )
"""

from backend.middleware.models import RateLimitResult
from backend.middleware.rate_limiter import RateLimiter
from backend.middleware.rate_limit_middleware import RateLimitMiddleware
from backend.middleware.rate_limit_config import RateLimitConfig, EndpointRateLimit
from backend.middleware.cost_controller import (
    CostController,
    CostLimitConfig,
    UsageSummary,
)
from backend.middleware.register import (
    register_middleware,
    get_rate_limiter,
    get_cost_controller,
    shutdown_middleware,
)

__all__ = [
    "CostController",
    "CostLimitConfig",
    "EndpointRateLimit",
    "RateLimitConfig",
    "RateLimiter",
    "RateLimitMiddleware",
    "RateLimitResult",
    "UsageSummary",
    "get_cost_controller",
    "get_rate_limiter",
    "register_middleware",
    "shutdown_middleware",
]
