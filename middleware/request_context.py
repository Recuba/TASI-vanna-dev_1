"""
Request context — stores per-request metadata in a contextvars.ContextVar.
This allows service code to access request metadata (request_id) without
threading it through every function call.
"""

import logging
from contextvars import ContextVar

_request_id_var: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """Return the current request ID, or empty string if not in a request context."""
    return _request_id_var.get()


def set_request_id(request_id: str) -> None:
    """Set the request ID for the current async context."""
    _request_id_var.set(request_id)


class RequestIdFilter(logging.Filter):
    """Injects request_id into every LogRecord for structured logging."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True
