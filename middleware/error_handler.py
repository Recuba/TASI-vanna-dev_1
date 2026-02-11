"""
Global error handler middleware.

Catches unhandled exceptions and returns a safe JSON response with a
consistent ``{"error": {"code": ..., "message": ...}}`` structure.

Specific built-in exceptions are mapped to appropriate HTTP status codes:
- ``ValueError`` -> 400 (BAD_REQUEST)
- ``PermissionError`` -> 403 (FORBIDDEN)
- ``FileNotFoundError`` / ``KeyError`` -> 404 (NOT_FOUND)

Full tracebacks are logged server-side but never exposed to clients.
In debug mode (``SERVER_DEBUG=true``), the error message is included;
in production only a generic message is returned for unexpected errors.
"""

from __future__ import annotations

import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

_DEBUG = os.environ.get("SERVER_DEBUG", "false").lower() in ("true", "1", "yes")

# Maps exception types to (http_status, error_code).
_EXCEPTION_MAP: dict[type, tuple[int, str]] = {
    ValueError: (400, "BAD_REQUEST"),
    PermissionError: (403, "FORBIDDEN"),
    FileNotFoundError: (404, "NOT_FOUND"),
    KeyError: (404, "NOT_FOUND"),
}


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    """Build a consistent error JSON response."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Catches unhandled exceptions and returns a JSON error response.

    Known exception types are mapped to specific HTTP status codes.
    Unknown exceptions always return 500.  Stack traces are logged
    server-side but never included in the HTTP response (unless
    ``SERVER_DEBUG`` is enabled, in which case the error message is
    included for developer convenience).
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            # Check for a mapped exception type
            for exc_type, (status_code, code) in _EXCEPTION_MAP.items():
                if isinstance(exc, exc_type):
                    logger.warning(
                        "%s on %s %s: %s",
                        exc_type.__name__,
                        request.method,
                        request.url.path,
                        exc,
                    )
                    return _error_response(status_code, code, str(exc))

            # Unmapped / unexpected exception -> 500
            logger.exception(
                "Unhandled exception on %s %s", request.method, request.url.path
            )
            message = str(exc) if _DEBUG else "Internal server error"
            return _error_response(500, "INTERNAL_ERROR", message)
