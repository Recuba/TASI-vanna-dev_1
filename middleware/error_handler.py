"""
Global error handler middleware and exception handlers.

Catches unhandled exceptions and returns a safe JSON response with a
consistent ``{"error": {"code": ..., "message": ..., "request_id": ...}}``
structure.

Specific built-in exceptions are mapped to appropriate HTTP status codes:
- ``ValueError`` -> 400 (BAD_REQUEST)
- ``PermissionError`` -> 403 (FORBIDDEN)
- ``FileNotFoundError`` / ``KeyError`` -> 404 (NOT_FOUND)
- ``ConnectionError`` -> 503 (SERVICE_UNAVAILABLE)

Full tracebacks are logged server-side but never exposed to clients.
In debug mode (``SERVER_DEBUG=true``), the error message is included;
in production only a generic message is returned for unexpected errors.

Exception handlers for ``HTTPException`` and ``RequestValidationError``
are registered via ``install_exception_handlers()`` to ensure all error
responses use the same shape.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import TYPE_CHECKING

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

_DEBUG = os.environ.get("SERVER_DEBUG", "false").lower() in ("true", "1", "yes")

try:
    from middleware.request_context import set_request_id as _set_request_id_ctx
except ImportError:
    _set_request_id_ctx = None

# Maps exception types to (http_status, error_code).
_EXCEPTION_MAP: dict[type, tuple[int, str]] = {
    ValueError: (400, "BAD_REQUEST"),
    PermissionError: (403, "FORBIDDEN"),
    FileNotFoundError: (404, "NOT_FOUND"),
    KeyError: (404, "NOT_FOUND"),
    ConnectionError: (503, "SERVICE_UNAVAILABLE"),
}

# HTTP status -> default error code for HTTPException responses
_STATUS_CODE_MAP: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def _get_request_id(request: Request) -> str:
    """Get or generate a request ID for correlation."""
    # Check if request already has a request_id (set by logging middleware)
    request_id = getattr(request.state, "request_id", None)
    if request_id:
        return request_id
    # Check incoming header
    request_id = request.headers.get("x-request-id")
    if request_id:
        return request_id
    # Generate a new one
    return uuid.uuid4().hex[:16]


def _error_response(
    status_code: int, code: str, message: str, request_id: str
) -> JSONResponse:
    """Build a consistent error JSON response."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id,
            }
        },
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
        # Ensure request_id is available for the entire request lifecycle
        request_id = _get_request_id(request)
        request.state.request_id = request_id
        if _set_request_id_ctx is not None:
            _set_request_id_ctx(request_id)

        try:
            return await call_next(request)
        except Exception as exc:
            # Check for a mapped exception type
            for exc_type, (status_code, code) in _EXCEPTION_MAP.items():
                if isinstance(exc, exc_type):
                    logger.warning(
                        "%s on %s %s: %s [request_id=%s]",
                        exc_type.__name__,
                        request.method,
                        request.url.path,
                        exc,
                        request_id,
                    )
                    return _error_response(status_code, code, str(exc), request_id)

            # Unmapped / unexpected exception -> 500
            logger.exception(
                "Unhandled exception on %s %s [request_id=%s]",
                request.method,
                request.url.path,
                request_id,
            )
            message = str(exc) if _DEBUG else "Internal server error"
            return _error_response(500, "INTERNAL_ERROR", message, request_id)


def install_exception_handlers(app: "FastAPI") -> None:
    """Register custom exception handlers on the FastAPI app.

    This ensures that ``HTTPException`` and ``RequestValidationError``
    responses use the same ``{"error": {...}}`` shape as the middleware.
    Call this **after** creating the app but before starting the server.
    """
    from fastapi import HTTPException
    from fastapi.exceptions import RequestValidationError

    @app.exception_handler(HTTPException)
    async def _http_exception_handler(request: Request, exc: HTTPException):
        request_id = _get_request_id(request)
        code = _STATUS_CODE_MAP.get(exc.status_code, "ERROR")
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        logger.warning(
            "HTTPException %d on %s %s: %s [request_id=%s]",
            exc.status_code,
            request.method,
            request.url.path,
            message,
            request_id,
        )
        return _error_response(exc.status_code, code, message, request_id)

    @app.exception_handler(RequestValidationError)
    async def _validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        request_id = _get_request_id(request)
        # Summarize validation errors into a human-readable message
        errors = exc.errors()
        if errors:
            parts = []
            for err in errors[:5]:  # Limit to first 5 errors
                loc = " -> ".join(str(part) for part in err.get("loc", []))
                msg = err.get("msg", "invalid")
                parts.append(f"{loc}: {msg}")
            message = "; ".join(parts)
        else:
            message = "Request validation failed"

        logger.warning(
            "Validation error on %s %s: %s [request_id=%s]",
            request.method,
            request.url.path,
            message,
            request_id,
        )
        return _error_response(422, "VALIDATION_ERROR", message, request_id)
