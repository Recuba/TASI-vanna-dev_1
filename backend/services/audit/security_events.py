"""Security event logger.

Records security-relevant events (SQL injection attempts, rate-limit hits,
auth failures, etc.) as structured log entries and optionally persists them
to the ``security_events`` database table.

Like :mod:`query_audit`, this logger is fire-and-forget: persistence failures
are logged but never propagated.

Usage::

    from backend.services.audit.security_events import SecurityEventLogger
    from backend.services.audit.models import SecurityEvent, SecurityEventType, SecuritySeverity

    sec = SecurityEventLogger()
    sec.log(SecurityEvent(
        event_type=SecurityEventType.SQL_INJECTION_ATTEMPT,
        severity=SecuritySeverity.HIGH,
        details="DROP TABLE detected in user input",
    ))
"""

from __future__ import annotations

import logging
from typing import Optional

from backend.services.audit.correlation import get_current_request_id
from backend.services.audit.models import SecurityEvent, SecuritySeverity

_log = logging.getLogger("tasi.audit.security")

# Map severity to Python log level.
_SEVERITY_TO_LEVEL: dict[SecuritySeverity, int] = {
    SecuritySeverity.LOW: logging.INFO,
    SecuritySeverity.MEDIUM: logging.WARNING,
    SecuritySeverity.HIGH: logging.ERROR,
    SecuritySeverity.CRITICAL: logging.CRITICAL,
}


class SecurityEventLogger:
    """Logs security events to structured logging and optionally to a database.

    Parameters
    ----------
    db_connection_factory:
        Optional callable returning a DB-API 2.0 connection.  When *None*,
        events are only written to the structured logger.
    """

    _INSERT_SQL = """
        INSERT INTO security_events (
            id, timestamp, event_type, severity, user_id,
            ip_address, details, request_id
        ) VALUES (
            %(id)s, %(timestamp)s, %(event_type)s, %(severity)s, %(user_id)s,
            %(ip_address)s, %(details)s, %(request_id)s
        )
    """

    def __init__(
        self,
        db_connection_factory: Optional[callable] = None,
    ) -> None:
        self._db_factory = db_connection_factory

    def log(self, event: SecurityEvent) -> None:
        """Record a security event.

        Always emits a structured log line at a level matching the event's
        severity.  If a database factory was provided, also persists the
        event to PostgreSQL.

        Args:
            event: The security event to record.
        """
        # Auto-fill request_id from correlation context if not set.
        if event.request_id is None:
            event.request_id = get_current_request_id()

        self._emit_log(event)

        if self._db_factory is not None:
            self._persist(event)

    def _emit_log(self, event: SecurityEvent) -> None:
        """Write the event to the structured logger at appropriate severity."""
        extra = event.model_dump(exclude_none=True, mode="json")
        level = _SEVERITY_TO_LEVEL.get(event.severity, logging.WARNING)
        _log.log(level, "security_event", extra=extra)

    def _persist(self, event: SecurityEvent) -> None:
        """Persist the event to the security_events table (best-effort)."""
        try:
            conn = self._db_factory()
            try:
                params = event.model_dump(mode="json")
                with conn.cursor() as cur:
                    cur.execute(self._INSERT_SQL, params)
                conn.commit()
            finally:
                conn.close()
        except Exception:
            _log.warning("Failed to persist security event", exc_info=True)
