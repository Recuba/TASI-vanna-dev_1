"""
Request logging middleware.

Logs method, path, status code, duration, and client IP for each request.
Uses Python logging with structured fields compatible with config/logging.py.
"""

from __future__ import annotations

import logging
import time
from typing import List

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("tasi.access")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs HTTP requests with timing information.

    Parameters
    ----------
    app : ASGIApp
        The ASGI application.
    skip_paths : list[str]
        Paths to exclude from logging (e.g. ["/health", "/favicon.ico"]).
    """

    def __init__(self, app, skip_paths: List[str] | None = None) -> None:
        super().__init__(app)
        self.skip_paths: set[str] = set(skip_paths or [])

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in self.skip_paths:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        start = time.perf_counter()

        response = await call_next(request)

        duration_ms = (time.perf_counter() - start) * 1000
        status_code = response.status_code

        msg = (
            f"{request.method} {path} {status_code} "
            f"{duration_ms:.1f}ms client={client_ip}"
        )

        if status_code < 400:
            logger.info(msg)
        elif status_code < 500:
            logger.warning(msg)
        else:
            logger.error(msg)

        return response
