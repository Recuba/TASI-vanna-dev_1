"""
FastAPI rate limiting middleware.

Integrates with RateLimiter to enforce per-request rate limits.
Extracts client identity from JWT bearer token (user_id) or falls back
to the client IP address. Sets standard X-RateLimit-* response headers
and returns 429 JSON when the limit is exceeded.

Health and liveness endpoints are skipped by default.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Set

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from backend.middleware.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

# Default paths that bypass rate limiting
_DEFAULT_SKIP_PATHS: Set[str] = {
    "/health",
    "/health/live",
    "/health/ready",
    "/favicon.ico",
    "/docs",
    "/redoc",
    "/openapi.json",
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that enforces rate limits per client.

    Parameters
    ----------
    app : ASGIApp
        The ASGI application.
    limiter : RateLimiter
        The rate limiter instance (Redis or in-memory).
    default_limit : int
        Default requests per window if no path rule matches.
    default_window : int
        Default sliding window size in seconds.
    skip_paths : set[str] or None
        Exact paths that bypass rate limiting. Merged with built-in defaults.
    path_limits : dict[str, tuple[int, int]] or None
        Mapping of path prefix -> (limit, window_seconds).
        Example: {"/api/auth": (20, 60), "/api/v1/query": (50, 3600)}
        Longest matching prefix wins.
    """

    def __init__(
        self,
        app,
        limiter: RateLimiter,
        default_limit: int = 60,
        default_window: int = 60,
        skip_paths: Optional[Set[str]] = None,
        path_limits: Optional[Dict[str, tuple]] = None,
    ) -> None:
        super().__init__(app)
        self.limiter = limiter
        self.default_limit = default_limit
        self.default_window = default_window
        self.skip_paths = _DEFAULT_SKIP_PATHS | (skip_paths or set())

        # Sort path_limits by prefix length descending for longest-match-first
        self.path_limits: List[tuple] = sorted(
            (path_limits or {}).items(),
            key=lambda x: len(x[0]),
            reverse=True,
        )

    def _resolve_limit(self, path: str) -> tuple:
        """Return (bucket, limit, window) for the given request path.

        Matches the longest prefix from path_limits, or falls back to
        the default limit/window.
        """
        for prefix, (limit, window) in self.path_limits:
            if path.startswith(prefix):
                return prefix, limit, window
        return "_default", self.default_limit, self.default_window

    def _extract_identifier(self, request: Request) -> str:
        """Extract client identity: JWT user_id if present, else IP address.

        Reads the Authorization header for a Bearer token. On decode failure
        (expired, invalid, missing), falls back to the client IP.
        """
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                from auth.jwt_handler import decode_token

                payload = decode_token(token, expected_type="access")
                user_id = payload.get("sub")
                if user_id:
                    return f"user:{user_id}"
            except Exception:
                # Token invalid/expired -- fall through to IP
                pass

        # Fallback: client IP
        if request.client:
            return f"ip:{request.client.host}"
        return "ip:unknown"

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process each request through the rate limiter."""
        path = request.url.path

        # Skip health/docs endpoints
        if path in self.skip_paths:
            return await call_next(request)

        identifier = self._extract_identifier(request)
        bucket, limit, window = self._resolve_limit(path)

        result = self.limiter.check(
            identifier=identifier,
            limit=limit,
            window=window,
            bucket=bucket,
        )

        if not result.allowed:
            request_id = getattr(request.state, "request_id", "unknown")
            logger.warning(
                "Rate limit exceeded: identifier=%s path=%s bucket=%s limit=%d [request_id=%s]",
                identifier,
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
                        "message": "Too many requests. Please try again later.",
                        "request_id": request_id,
                        "retry_after": result.reset_after,
                    }
                },
                headers={
                    "Retry-After": str(result.reset_after),
                    "X-RateLimit-Limit": str(result.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(result.reset_after),
                },
            )

        # Request allowed -- add rate limit headers to the response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(result.limit)
        response.headers["X-RateLimit-Remaining"] = str(result.remaining)
        response.headers["X-RateLimit-Reset"] = str(result.reset_after)
        return response
