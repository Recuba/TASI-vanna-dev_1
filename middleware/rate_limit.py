"""
In-memory sliding window rate limiter middleware.

Tracks requests per IP address using a dict of timestamps.
Returns 429 Too Many Requests when the limit is exceeded.

Supports path-based tiered limits via ``path_limits``: a dict mapping
path prefixes to per-minute limits.  When a request matches a prefix,
it is tracked in a separate bucket with the specified limit.  Requests
that do not match any prefix use the default ``requests_per_minute``.
"""

from __future__ import annotations

import time
import logging
from collections import defaultdict, deque
from typing import Dict, List, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Cleanup stale entries every N requests
_CLEANUP_INTERVAL = 500


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding window rate limiter with optional path-based tiers.

    Parameters
    ----------
    app : ASGIApp
        The ASGI application.
    requests_per_minute : int
        Maximum requests allowed per IP per minute (default 60).
    skip_paths : list[str]
        Paths that bypass rate limiting (e.g. ["/health"]).
    path_limits : dict[str, int] | None
        Mapping of path prefixes to per-minute limits.
        Example: ``{"/api/auth": 10, "/api/v1/charts": 30}``
        The **longest matching prefix** wins.  If no prefix matches,
        the default ``requests_per_minute`` is used.
    """

    def __init__(
        self,
        app,
        requests_per_minute: int = 60,
        skip_paths: Optional[List[str]] = None,
        path_limits: Optional[Dict[str, int]] = None,
    ) -> None:
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60.0
        self.skip_paths: set[str] = set(skip_paths or [])
        # Sort path_limits by prefix length descending for longest-match-first
        self.path_limits: list[tuple[str, int]] = sorted(
            (path_limits or {}).items(), key=lambda x: len(x[0]), reverse=True
        )
        # (IP, bucket) -> deque of request timestamps
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._request_count = 0

    def _resolve_limit(self, path: str) -> tuple[str, int]:
        """Return (bucket_key, limit) for the given path.

        Returns the longest matching prefix from ``path_limits``, or
        ``("_default", self.requests_per_minute)`` if no prefix matches.
        """
        for prefix, limit in self.path_limits:
            if path.startswith(prefix):
                return prefix, limit
        return "_default", self.requests_per_minute

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in self.skip_paths:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()

        # Periodic cleanup of stale entries
        self._request_count += 1
        if self._request_count % _CLEANUP_INTERVAL == 0:
            self._cleanup(now)

        bucket, limit = self._resolve_limit(path)
        key = f"{client_ip}:{bucket}"

        # Sliding window: remove timestamps older than window
        timestamps = self._requests[key]
        cutoff = now - self.window_seconds
        # Remove expired entries from the front (O(1) with deque)
        while timestamps and timestamps[0] < cutoff:
            timestamps.popleft()

        if len(timestamps) >= limit:
            # Calculate Retry-After: time until the oldest request expires
            retry_after = int(timestamps[0] - cutoff) + 1
            request_id = getattr(request.state, "request_id", "unknown")
            logger.warning(
                "Rate limit exceeded for %s on %s %s (bucket=%s, limit=%d) [request_id=%s]",
                client_ip,
                request.method,
                path,
                bucket,
                limit,
                request_id,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Too many requests",
                        "request_id": request_id,
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)
        return await call_next(request)

    def _cleanup(self, now: float) -> None:
        """Remove keys with no recent requests."""
        cutoff = now - self.window_seconds
        stale_keys = [
            key
            for key, timestamps in self._requests.items()
            if not timestamps or timestamps[-1] < cutoff
        ]
        for key in stale_keys:
            del self._requests[key]
