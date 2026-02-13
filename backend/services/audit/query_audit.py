"""Query audit logger.

Records every NL-to-SQL query lifecycle event as a structured log entry and
(when a database connection is available) persists it to the ``query_audit_log``
table.

The logger is intentionally fire-and-forget: failures to persist an audit
record are logged as warnings but never raise exceptions or block the
request.  This keeps the audit trail from becoming a reliability liability.

Usage::

    from backend.services.audit.query_audit import QueryAuditLogger

    audit = QueryAuditLogger()
    audit.log(QueryAuditEvent(nl_query="show me top 10 stocks", ...))
"""

from __future__ import annotations

import logging
from typing import Optional

from backend.services.audit.correlation import get_current_request_id
from backend.services.audit.models import QueryAuditEvent

_log = logging.getLogger("tasi.audit.query")


class QueryAuditLogger:
    """Logs query audit events to structured logging and optionally to a database.

    Parameters
    ----------
    db_connection_factory:
        Optional callable that returns a DB-API 2.0 connection (e.g. psycopg2).
        If *None*, events are only written to the structured logger.
    """

    _INSERT_SQL = """
        INSERT INTO query_audit_log (
            id, request_id, user_id, natural_language_query, generated_sql,
            validation_result, execution_time_ms, row_count, was_successful,
            error_message, ip_address, risk_score, created_at
        ) VALUES (
            %(id)s, %(request_id)s, %(user_id)s, %(nl_query)s, %(generated_sql)s,
            %(validation_result)s, %(execution_time_ms)s, %(row_count)s,
            %(was_successful)s, %(error)s, %(ip_address)s, %(risk_score)s,
            %(timestamp)s
        )
    """

    def __init__(
        self,
        db_connection_factory: Optional[callable] = None,
    ) -> None:
        self._db_factory = db_connection_factory

    def log(self, event: QueryAuditEvent) -> None:
        """Record a query audit event.

        Always emits a structured log line.  If a database factory was
        provided, also persists the event to PostgreSQL.

        Args:
            event: The query audit event to record.
        """
        # Auto-fill request_id from correlation context if not set.
        if event.request_id is None:
            event.request_id = get_current_request_id()

        self._emit_log(event)

        if self._db_factory is not None:
            self._persist(event)

    def _emit_log(self, event: QueryAuditEvent) -> None:
        """Write the event to the structured logger."""
        extra = event.model_dump(exclude_none=True)
        level = logging.WARNING if event.error else logging.INFO
        _log.log(level, "query_audit", extra=extra)

    def _persist(self, event: QueryAuditEvent) -> None:
        """Persist the event to the query_audit_log table (best-effort)."""
        try:
            conn = self._db_factory()
            try:
                params = event.model_dump()
                params["was_successful"] = event.error is None
                with conn.cursor() as cur:
                    cur.execute(self._INSERT_SQL, params)
                conn.commit()
            finally:
                conn.close()
        except Exception:
            _log.warning("Failed to persist query audit event", exc_info=True)
