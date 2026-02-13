"""Structured logging for the audit subsystem.

Provides a JSON formatter and configuration function that integrate with
the existing ``config.logging_config`` module.  The audit logger adds
request-correlation fields (``request_id``) pulled from *contextvars*
so every log line emitted during a request can be traced back.

Usage::

    from backend.services.audit.structured_logger import configure_logging, get_logger

    configure_logging()                     # call once at startup
    logger = get_logger(__name__)
    logger.info("query executed", extra={"rows": 42})

Environment variables:
    LOG_LEVEL   - Root log level (default: INFO)
    LOG_FORMAT  - "json" (default) or "text" for human-readable output
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Optional

from backend.services.audit.correlation import get_current_request_id


class JSONFormatter(logging.Formatter):
    """One-JSON-object-per-line formatter for production log aggregators.

    Automatically injects ``request_id`` from the correlation *contextvar*
    when available, ensuring every log line can be traced to an HTTP request.
    Extra fields passed via ``extra={}`` are merged into the JSON object.
    """

    # Standard LogRecord attributes to exclude from the "extra" sweep.
    _SKIP_ATTRS: frozenset[str] = frozenset({
        "name", "msg", "args", "created", "relativeCreated",
        "exc_info", "exc_text", "stack_info", "lineno", "funcName",
        "pathname", "filename", "module", "levelno", "levelname",
        "thread", "threadName", "process", "processName",
        "getMessage", "message", "msecs", "taskName",
    })

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Inject correlation request_id when inside a request context.
        request_id = get_current_request_id()
        if request_id is not None:
            log_entry["request_id"] = request_id

        # Include exception traceback if present.
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Merge any extra fields the caller passed.
        for key, value in record.__dict__.items():
            if key not in self._SKIP_ATTRS and not key.startswith("_"):
                log_entry[key] = value

        return json.dumps(log_entry, ensure_ascii=False, default=str)


class _PrettyFormatter(logging.Formatter):
    """Human-readable formatter for development (non-JSON)."""

    _FMT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

    def __init__(self) -> None:
        super().__init__(fmt=self._FMT, datefmt="%H:%M:%S")


def configure_logging(
    log_level: Optional[str] = None,
    json_format: Optional[bool] = None,
) -> None:
    """Configure the root logger for the audit subsystem.

    Safe to call multiple times; existing handlers are cleared first.

    Args:
        log_level: Logging level string (DEBUG, INFO, WARNING, ERROR, CRITICAL).
                   Falls back to ``LOG_LEVEL`` env var, then ``INFO``.
        json_format: If *True*, use :class:`JSONFormatter`.  If *False*, use
                     human-readable output.  If *None*, auto-detect from
                     ``LOG_FORMAT`` env var (``"json"`` vs ``"text"``).
    """
    level_name = (log_level or os.environ.get("LOG_LEVEL", "INFO")).upper()

    if json_format is None:
        log_fmt = os.environ.get("LOG_FORMAT", "json").lower()
        json_format = log_fmt != "text"

    root = logging.getLogger()
    root.setLevel(getattr(logging, level_name, logging.INFO))

    # Clear existing handlers to prevent duplicate output on re-init.
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter() if json_format else _PrettyFormatter())
    root.addHandler(handler)

    # Suppress noisy third-party loggers.
    for noisy in ("uvicorn.access", "uvicorn.error", "httpcore", "httpx",
                  "urllib3", "watchfiles", "yfinance"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger.

    Convenience wrapper matching ``config.logging_config.get_logger`` so
    audit code can import from a single place.

    Args:
        name: Logger name, usually ``__name__``.
    """
    return logging.getLogger(name)
