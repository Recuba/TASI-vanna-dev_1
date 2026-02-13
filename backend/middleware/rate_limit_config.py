"""
Rate limit configuration with per-endpoint rules.

Loads settings from environment variables (prefix RATELIMIT_) with sensible
defaults for the Ra'd AI TASI platform.

Default endpoint rules:
- /api/v1/query:    50 req / 3600s (1 hour)  -- LLM-backed, expensive
- /api/auth:        20 req / 60s  (1 minute) -- brute-force protection
- /api/v1/export:   10 req / 3600s (1 hour)  -- heavy data export
- /api/v1:         1000 req / 3600s (1 hour)  -- general API
- (default):         60 req / 60s  (1 minute) -- catch-all

Health endpoints (/health, /health/live, /health/ready) are always skipped.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Set, Tuple

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class EndpointRateLimit(BaseModel):
    """Rate limit rule for a path prefix.

    Attributes
    ----------
    path_prefix : str
        URL path prefix to match (longest prefix wins).
    limit : int
        Maximum requests allowed in the window.
    window : int
        Sliding window size in seconds.
    description : str
        Human-readable description of the rule.
    """

    path_prefix: str
    limit: int
    window: int
    description: str = ""


class RateLimitConfig(BaseSettings):
    """Rate limit settings loaded from environment variables.

    Environment variables use the RATELIMIT_ prefix. The per-endpoint rules
    are defined as defaults and can be overridden by subclassing or by
    passing custom rules at middleware registration time.
    """

    model_config = SettingsConfigDict(env_prefix="RATELIMIT_")

    # Global defaults
    default_limit: int = Field(default=60, description="Default requests per window")
    default_window: int = Field(default=60, description="Default window in seconds")

    # Redis connection for rate limiting (db=1, separate from cache db=0)
    redis_url: str = Field(
        default="redis://localhost:6379/1",
        description="Redis URL for rate limiting (uses db=1)",
    )

    # Whether to enable rate limiting at all
    enabled: bool = Field(default=True, description="Enable rate limiting middleware")

    # Additional paths to skip (merged with built-in health/docs paths)
    skip_paths: str = Field(
        default="",
        description="Comma-separated additional paths to skip",
    )

    @property
    def skip_paths_set(self) -> Set[str]:
        """Parse comma-separated skip paths into a set."""
        if not self.skip_paths:
            return set()
        return {p.strip() for p in self.skip_paths.split(",") if p.strip()}

    @property
    def endpoint_rules(self) -> List[EndpointRateLimit]:
        """Return the default per-endpoint rate limit rules.

        These are the built-in defaults for the Ra'd AI platform.
        Override by passing custom path_limits to the middleware.
        """
        return [
            EndpointRateLimit(
                path_prefix="/api/v1/query",
                limit=50,
                window=3600,
                description="LLM query endpoint (50/hour)",
            ),
            EndpointRateLimit(
                path_prefix="/api/auth",
                limit=20,
                window=60,
                description="Authentication (20/minute)",
            ),
            EndpointRateLimit(
                path_prefix="/api/v1/export",
                limit=10,
                window=3600,
                description="Data export (10/hour)",
            ),
            EndpointRateLimit(
                path_prefix="/api/v1",
                limit=1000,
                window=3600,
                description="General API (1000/hour)",
            ),
        ]

    def to_path_limits(self) -> Dict[str, Tuple[int, int]]:
        """Convert endpoint rules to the dict format expected by RateLimitMiddleware.

        Returns
        -------
        dict[str, tuple[int, int]]
            Mapping of path prefix -> (limit, window_seconds).
        """
        return {
            rule.path_prefix: (rule.limit, rule.window)
            for rule in self.endpoint_rules
        }

    def log_config(self) -> None:
        """Log the active rate limit configuration."""
        logger.info(
            "Rate limiting %s: default=%d/%ds, redis=%s",
            "enabled" if self.enabled else "disabled",
            self.default_limit,
            self.default_window,
            self.redis_url,
        )
        for rule in self.endpoint_rules:
            logger.info(
                "  %s: %d/%ds -- %s",
                rule.path_prefix,
                rule.limit,
                rule.window,
                rule.description,
            )
