"""
Pluggable error tracking for TASI AI Platform.

Provides an ErrorTracker interface with two implementations:
- LogErrorTracker (default): Reports errors via structured logging.
- SentryErrorTracker (optional): Forwards errors to Sentry.

Usage:
    from config.error_tracking import init_error_tracking, get_error_tracker

    init_error_tracking()  # Call once at startup
    tracker = get_error_tracker()
    tracker.capture_exception(exc)

Environment variables:
    ERROR_TRACKER   - "log" (default) or "sentry"
    SENTRY_DSN      - Sentry DSN (required when ERROR_TRACKER=sentry)
    ENVIRONMENT     - Passed to Sentry as environment tag
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Optional

logger = logging.getLogger(__name__)


class ErrorTracker(ABC):
    """Abstract interface for error tracking backends."""

    @abstractmethod
    def capture_exception(
        self,
        exc: BaseException,
        *,
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        """Report an exception to the tracking backend.

        Args:
            exc: The exception to report.
            context: Optional dict of extra context (user, request path, etc.).
        """

    @abstractmethod
    def capture_message(
        self,
        message: str,
        *,
        level: str = "error",
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        """Report a message (without an exception) to the tracking backend.

        Args:
            message: Human-readable description.
            level: Severity level (debug, info, warning, error, critical).
            context: Optional dict of extra context.
        """


class LogErrorTracker(ErrorTracker):
    """Default error tracker that logs errors via Python logging.

    Uses structured logging from config/logging_config.py so errors
    appear in JSON format in production and pretty format in dev.
    """

    def __init__(self) -> None:
        self._logger = logging.getLogger("tasi.errors")

    def capture_exception(
        self,
        exc: BaseException,
        *,
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        extra = {"error_context": context} if context else {}
        self._logger.error(
            "Captured exception: %s: %s",
            type(exc).__name__,
            exc,
            exc_info=exc,
            extra=extra,
        )

    def capture_message(
        self,
        message: str,
        *,
        level: str = "error",
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        log_level = getattr(logging, level.upper(), logging.ERROR)
        extra = {"error_context": context} if context else {}
        self._logger.log(log_level, message, extra=extra)


# ---------------------------------------------------------------------------
# Sentry integration (opt-in)
# ---------------------------------------------------------------------------
# To enable Sentry:
# 1. pip install sentry-sdk[fastapi]
# 2. Set ERROR_TRACKER=sentry and SENTRY_DSN=https://...@sentry.io/...
# 3. Optionally set ENVIRONMENT=production
#
# class SentryErrorTracker(ErrorTracker):
#     """Error tracker that forwards to Sentry."""
#
#     def __init__(self, dsn: str, environment: str = "production") -> None:
#         import sentry_sdk
#         from sentry_sdk.integrations.fastapi import FastApiIntegration
#         from sentry_sdk.integrations.logging import LoggingIntegration
#
#         sentry_sdk.init(
#             dsn=dsn,
#             environment=environment,
#             traces_sample_rate=0.1,  # 10% of transactions
#             integrations=[
#                 FastApiIntegration(transaction_style="endpoint"),
#                 LoggingIntegration(level=logging.WARNING, event_level=logging.ERROR),
#             ],
#         )
#         self._dsn = dsn
#
#     def capture_exception(
#         self,
#         exc: BaseException,
#         *,
#         context: Optional[dict[str, Any]] = None,
#     ) -> None:
#         import sentry_sdk
#         with sentry_sdk.push_scope() as scope:
#             if context:
#                 for key, value in context.items():
#                     scope.set_extra(key, value)
#             sentry_sdk.capture_exception(exc)
#
#     def capture_message(
#         self,
#         message: str,
#         *,
#         level: str = "error",
#         context: Optional[dict[str, Any]] = None,
#     ) -> None:
#         import sentry_sdk
#         with sentry_sdk.push_scope() as scope:
#             if context:
#                 for key, value in context.items():
#                     scope.set_extra(key, value)
#             sentry_sdk.capture_message(message, level=level)


# ---------------------------------------------------------------------------
# Singleton management
# ---------------------------------------------------------------------------
_tracker: Optional[ErrorTracker] = None


def init_error_tracking() -> ErrorTracker:
    """Initialize the error tracker based on environment configuration.

    Reads ERROR_TRACKER env var:
    - "log" (default): Uses LogErrorTracker (structured logging).
    - "sentry": Would use SentryErrorTracker (uncomment class above).

    Returns:
        The initialized ErrorTracker instance.
    """
    global _tracker

    backend = os.environ.get("ERROR_TRACKER", "log").lower()

    if backend == "sentry":
        dsn = os.environ.get("SENTRY_DSN", "")
        if not dsn:
            logger.warning(
                "ERROR_TRACKER=sentry but SENTRY_DSN not set; falling back to log tracker"
            )
            _tracker = LogErrorTracker()
        else:
            # Uncomment SentryErrorTracker class above and this block to enable:
            # environment = os.environ.get("ENVIRONMENT", "production")
            # _tracker = SentryErrorTracker(dsn=dsn, environment=environment)
            logger.warning(
                "Sentry tracker not yet enabled; uncomment SentryErrorTracker in "
                "config/error_tracking.py. Falling back to log tracker."
            )
            _tracker = LogErrorTracker()
    else:
        _tracker = LogErrorTracker()

    logger.info("Error tracking initialized: %s", type(_tracker).__name__)
    return _tracker


def get_error_tracker() -> ErrorTracker:
    """Return the current error tracker, initializing if needed.

    Returns:
        The active ErrorTracker instance.
    """
    global _tracker
    if _tracker is None:
        return init_error_tracking()
    return _tracker
