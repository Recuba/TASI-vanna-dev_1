"""
In-memory sliding window rate limiter middleware.

Tracks requests per IP address using a dict of timestamps.
Returns 429 Too Many Requests when the limit is exceeded.
"""

from __future__ import annotations

import time
import logging
from collections import defaultdict, deque
from typing import List

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Cleanup stale entries every N requests
_CLEANUP_INTERVAL = 500


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding window rate limiter.

    Parameters
    ----------
    app : ASGIApp
        The ASGI application.
    requests_per_minute : int
        Maximum requests allowed per IP per minute (default 60).
    skip_paths : list[str]
        Paths that bypass rate limiting (e.g. ["/health"]).
    """

    def __init__(
        self,
        app,
        requests_per_minute: int = 60,
        skip_paths: List[str] | None = None,
    ) -> None:
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60.0
        self.skip_paths: set[str] = set(skip_paths or [])
        # IP -> deque of request timestamps (O(1) popleft vs O(n) list.pop(0))
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._request_count = 0

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

        # Sliding window: remove timestamps older than window
        timestamps = self._requests[client_ip]
        cutoff = now - self.window_seconds
        # Remove expired entries from the front (O(1) with deque)
        while timestamps and timestamps[0] < cutoff:
            timestamps.popleft()

        if len(timestamps) >= self.requests_per_minute:
            # Calculate Retry-After: time until the oldest request expires
            retry_after = int(timestamps[0] - cutoff) + 1
            logger.warning(
                "Rate limit exceeded for %s on %s %s",
                client_ip,
                request.method,
                path,
            )
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)
        return await call_next(request)

    def _cleanup(self, now: float) -> None:
        """Remove IPs with no recent requests."""
        cutoff = now - self.window_seconds
        stale_ips = [
            ip
            for ip, timestamps in self._requests.items()
            if not timestamps or timestamps[-1] < cutoff
        ]
        for ip in stale_ips:
            del self._requests[ip]
