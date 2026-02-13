"""Request correlation ID middleware using contextvars.

Assigns a UUID4 ``request_id`` to every incoming HTTP request, stores it in
a :mod:`contextvars` variable so it is accessible anywhere in the call stack
(including background tasks spawned by the same request), and returns it in
the ``X-Request-ID`` response header.

If the client sends an ``X-Request-ID`` header, that value is reused instead
of generating a new one, allowing end-to-end tracing across services.

Usage::

    from backend.services.audit.correlation import (
        CorrelationMiddleware,
        get_current_request_id,
    )

    # Register as ASGI middleware (add FIRST so it runs before others):
    app.add_middleware(CorrelationMiddleware)

    # Anywhere in request-handling code:
    rid = get_current_request_id()   # returns str | None
"""

from __future__ import annotations

import contextvars
import uuid
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Thread- and async-safe storage for the current request ID.
_request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)

_HEADER_NAME = "X-Request-ID"


def get_current_request_id() -> Optional[str]:
    """Return the correlation request ID for the current context, or *None*."""
    return _request_id_ctx.get()


class CorrelationMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that manages per-request correlation IDs.

    For every request:
    1. Reads ``X-Request-ID`` from the incoming headers, or generates a UUID4.
    2. Stores the ID in a :mod:`contextvars` variable (accessible via
       :func:`get_current_request_id`).
    3. Attaches the ID to ``request.state.request_id`` for downstream
       middleware that reads it from there (e.g. ``RequestLoggingMiddleware``).
    4. Sets ``X-Request-ID`` on the response headers for the caller.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Prefer client-supplied ID for distributed tracing; fall back to UUID4.
        request_id: str = request.headers.get(_HEADER_NAME) or uuid.uuid4().hex

        # Store in contextvar (available to loggers, services, etc.).
        token = _request_id_ctx.set(request_id)

        # Also set on request.state for middleware that reads it there.
        request.state.request_id = request_id

        try:
            response: Response = await call_next(request)
        finally:
            # Reset contextvar to prevent leakage between requests.
            _request_id_ctx.reset(token)

        response.headers[_HEADER_NAME] = request_id
        return response
