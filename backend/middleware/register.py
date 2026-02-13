"""
Middleware registration for the Ra'd AI TASI Platform.

Provides a single ``register_middleware(app)`` function that app.py can call
to wire up rate limiting and cost control middleware.

Usage in app.py::

    from backend.middleware.register import register_middleware

    app = FastAPI()
    register_middleware(app)

Environment variables used (add to .env.example if not present):

    # Rate limiting (backend/middleware)
    RATELIMIT_ENABLED=true
    RATELIMIT_DEFAULT_LIMIT=60
    RATELIMIT_DEFAULT_WINDOW=60
    RATELIMIT_REDIS_URL=redis://localhost:6379/1
    RATELIMIT_SKIP_PATHS=
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI

from backend.middleware.cost_controller import CostController
from backend.middleware.rate_limit_config import RateLimitConfig
from backend.middleware.rate_limit_middleware import RateLimitMiddleware
from backend.middleware.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

# Module-level singletons for shutdown access
_rate_limiter: Optional[RateLimiter] = None
_cost_controller: Optional[CostController] = None


def register_middleware(app: FastAPI) -> None:
    """Register rate limiting middleware on the FastAPI application.

    Reads configuration from environment variables (RATELIMIT_* prefix).
    If rate limiting is disabled via ``RATELIMIT_ENABLED=false``, this
    function is a no-op.

    Parameters
    ----------
    app : FastAPI
        The FastAPI application instance.
    """
    global _rate_limiter, _cost_controller

    config = RateLimitConfig()
    config.log_config()

    if not config.enabled:
        logger.info("Rate limiting middleware is disabled")
        return

    # Initialize rate limiter (Redis db=1 with in-memory fallback)
    _rate_limiter = RateLimiter(redis_url=config.redis_url)

    # Initialize cost controller on same Redis instance
    _cost_controller = CostController(redis_url=config.redis_url)

    # Register the middleware
    app.add_middleware(
        RateLimitMiddleware,
        limiter=_rate_limiter,
        default_limit=config.default_limit,
        default_window=config.default_window,
        skip_paths=config.skip_paths_set,
        path_limits=config.to_path_limits(),
    )

    logger.info("Rate limiting middleware registered successfully")


def get_rate_limiter() -> Optional[RateLimiter]:
    """Return the global RateLimiter instance, or None if not initialized."""
    return _rate_limiter


def get_cost_controller() -> Optional[CostController]:
    """Return the global CostController instance, or None if not initialized."""
    return _cost_controller


def shutdown_middleware() -> None:
    """Close middleware connections. Call during app shutdown."""
    global _rate_limiter, _cost_controller

    if _rate_limiter is not None:
        _rate_limiter.close()
        _rate_limiter = None

    if _cost_controller is not None:
        _cost_controller.close()
        _cost_controller = None

    logger.info("Rate limiting middleware shut down")
