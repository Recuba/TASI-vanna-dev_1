"""
Structured logging configuration for TASI AI Platform.

Provides JSON-structured logging for production and human-readable output
for development. Integrates with config/settings.py and coordinates with
middleware/request_logging.py for consistent log formatting.

Usage:
    from config.logging_config import setup_logging, get_logger

    setup_logging()  # Call once at startup
    logger = get_logger(__name__)
    logger.info("Server started", extra={"port": 8084})

Environment variables:
    LOG_LEVEL          - Root log level (default: INFO)
    IS_DEVELOPMENT     - "true" for dev-friendly output (also checks SERVER_DEBUG)
    SERVER_ENVIRONMENT - "development" enables pretty logging
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Optional


class JsonFormatter(logging.Formatter):
    """Structured JSON log formatter for production.

    Produces one JSON object per line with fields:
    timestamp, level, logger, message, and optional exception/extra fields.
    Compatible with Railway log aggregation and common log parsers.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include exception traceback if present
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Include extra fields from middleware (e.g. request_id, duration_ms)
        _skip = {
            "name", "msg", "args", "created", "relativeCreated",
            "exc_info", "exc_text", "stack_info", "lineno", "funcName",
            "pathname", "filename", "module", "levelno", "levelname",
            "thread", "threadName", "process", "processName",
            "getMessage", "message", "msecs", "taskName",
        }
        for key, value in record.__dict__.items():
            if key not in _skip and not key.startswith("_"):
                log_entry[key] = value

        return json.dumps(log_entry, ensure_ascii=False, default=str)


class PrettyFormatter(logging.Formatter):
    """Human-readable log formatter for development.

    Format: HH:MM:SS | LEVEL    | logger.name | message
    Aligned with middleware/request_logging.py output style.
    """

    FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

    def __init__(self):
        super().__init__(fmt=self.FORMAT, datefmt="%H:%M:%S")


def _is_dev_mode() -> bool:
    """Determine if running in development mode.

    Checks (in order):
    1. IS_DEVELOPMENT env var ("true", "1", "yes")
    2. SERVER_DEBUG env var ("true", "1", "yes")
    3. SERVER_ENVIRONMENT / ENVIRONMENT env var (== "development")

    Returns True if any indicate development mode.
    """
    truthy = ("true", "1", "yes")

    if os.environ.get("IS_DEVELOPMENT", "").lower() in truthy:
        return True
    if os.environ.get("SERVER_DEBUG", "").lower() in truthy:
        return True

    env = os.environ.get(
        "SERVER_ENVIRONMENT", os.environ.get("ENVIRONMENT", "development")
    )
    return env.lower() == "development"


# Noisy third-party loggers to suppress (set to WARNING)
_NOISY_LOGGERS = [
    "uvicorn.access",
    "uvicorn.error",
    "httpcore",
    "httpx",
    "yfinance",
    "urllib3",
    "watchfiles",
]


def setup_logging(
    level: Optional[str] = None,
    json_output: Optional[bool] = None,
) -> None:
    """Configure the root logger for the application.

    Call this once during application startup (e.g. in the FastAPI lifespan).
    Safe to call multiple times; handlers are cleared before reconfiguration.

    Args:
        level: Log level string (DEBUG, INFO, WARNING, ERROR, CRITICAL).
               Falls back to LOG_LEVEL env var, then defaults to INFO.
        json_output: If True, use JSON formatter. If False, use pretty formatter.
                     If None, auto-detect from environment (dev = pretty, prod = JSON).
    """
    log_level = (level or os.environ.get("LOG_LEVEL", "INFO")).upper()

    if json_output is None:
        json_output = not _is_dev_mode()

    # Configure root logger
    root = logging.getLogger()
    root.setLevel(getattr(logging, log_level, logging.INFO))

    # Remove existing handlers to avoid duplicates on re-init
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if json_output else PrettyFormatter())
    root.addHandler(handler)

    # Suppress noisy third-party loggers
    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger for the given module.

    Convenience wrapper that ensures consistent logger naming across
    the codebase. Typically called as:

        logger = get_logger(__name__)

    Args:
        name: Logger name, usually __name__ of the calling module.

    Returns:
        A configured logging.Logger instance.
    """
    return logging.getLogger(name)
