"""
Global error handler middleware.

Catches unhandled exceptions and returns a safe JSON response.
Full tracebacks are logged server-side but never exposed to clients.
"""

from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Catches unhandled exceptions and returns a generic 500 JSON response.

    Stack traces are logged server-side but never included in the HTTP response.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled exception on %s %s", request.method, request.url.path
            )
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error",
                    "code": "INTERNAL_ERROR",
                },
            )
