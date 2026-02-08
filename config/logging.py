"""
Logging configuration for TASI AI Platform.
JSON format in production, pretty colored output in development.
Controlled via LOG_LEVEL and SERVER_DEBUG env vars.
"""

import logging
import os
import sys
from typing import Optional


class JsonFormatter(logging.Formatter):
    """Structured JSON log formatter for production."""

    def format(self, record: logging.LogRecord) -> str:
        import json

        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)


class PrettyFormatter(logging.Formatter):
    """Human-readable log formatter for development."""

    FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

    def __init__(self):
        super().__init__(fmt=self.FORMAT, datefmt="%H:%M:%S")


def setup_logging(
    level: Optional[str] = None, json_output: Optional[bool] = None
) -> None:
    """
    Configure the root logger.

    Args:
        level: Log level string (DEBUG, INFO, WARNING, ERROR, CRITICAL).
               Falls back to LOG_LEVEL env var, then defaults to INFO.
        json_output: If True, use JSON formatter. If None, auto-detect
                     from SERVER_DEBUG (debug=true -> pretty, else JSON).
    """
    log_level = (level or os.environ.get("LOG_LEVEL", "INFO")).upper()

    if json_output is None:
        debug_mode = os.environ.get("SERVER_DEBUG", "false").lower() in (
            "true",
            "1",
            "yes",
        )
        json_output = not debug_mode

    root = logging.getLogger()
    root.setLevel(getattr(logging, log_level, logging.INFO))

    # Remove existing handlers to avoid duplicates on re-init
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if json_output else PrettyFormatter())
    root.addHandler(handler)

    # Quiet noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
