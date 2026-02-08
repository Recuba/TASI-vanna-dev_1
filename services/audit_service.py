"""
Audit Service
=============
Logging and retrieval for the query_audit_log table. Provides methods to
record every AI query and retrieve usage statistics per user or globally.

Requires a psycopg2 connection factory passed at init.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------
@dataclass
class AuditEntry:
    """Mirrors the query_audit_log table in database/schema.sql."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    natural_language_query: str = ""
    generated_sql: Optional[str] = None
    execution_time_ms: Optional[int] = None
    row_count: Optional[int] = None
    was_successful: Optional[bool] = None
    error_message: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class UsageStats:
    """Aggregated usage statistics for a time period."""

    period: str = ""  # e.g. '2026-02-07' or '2026-02'
    query_count: int = 0
    successful_count: int = 0
    failed_count: int = 0
    avg_execution_time_ms: Optional[float] = None
    unique_users: int = 0


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class AuditService:
    """Service layer for the query_audit_log table.

    Parameters
    ----------
    get_conn : callable
        A zero-argument callable that returns a psycopg2 connection.
        The service calls ``conn.close()`` after each operation.
    """

    def __init__(self, get_conn):
        self._get_conn = get_conn

    # -- helpers -------------------------------------------------------------

    def _conn(self):
        return self._get_conn()

    @staticmethod
    def _row_to_entry(row: Dict[str, Any]) -> AuditEntry:
        return AuditEntry(
            id=str(row["id"]),
            user_id=str(row["user_id"]) if row.get("user_id") else None,
            natural_language_query=row["natural_language_query"],
            generated_sql=row.get("generated_sql"),
            execution_time_ms=row.get("execution_time_ms"),
            row_count=row.get("row_count"),
            was_successful=row.get("was_successful"),
            error_message=row.get("error_message"),
            ip_address=str(row["ip_address"]) if row.get("ip_address") else None,
            user_agent=row.get("user_agent"),
            created_at=row.get("created_at"),
        )

    # -- public API ----------------------------------------------------------

    def log_query(
        self,
        natural_language_query: str,
        user_id: Optional[str] = None,
        generated_sql: Optional[str] = None,
        execution_time_ms: Optional[int] = None,
        row_count: Optional[int] = None,
        was_successful: Optional[bool] = None,
        error_message: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Insert an audit log entry. Returns the entry id."""
        entry_id = str(uuid.uuid4())

        sql = """
            INSERT INTO query_audit_log
                (id, user_id, natural_language_query, generated_sql,
                 execution_time_ms, row_count, was_successful,
                 error_message, ip_address, user_agent)
            VALUES
                (%(id)s, %(user_id)s, %(natural_language_query)s,
                 %(generated_sql)s, %(execution_time_ms)s, %(row_count)s,
                 %(was_successful)s, %(error_message)s,
                 %(ip_address)s::inet, %(user_agent)s)
        """

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, {
                    "id": entry_id,
                    "user_id": user_id,
                    "natural_language_query": natural_language_query,
                    "generated_sql": generated_sql,
                    "execution_time_ms": execution_time_ms,
                    "row_count": row_count,
                    "was_successful": was_successful,
                    "error_message": error_message,
                    "ip_address": ip_address,
                    "user_agent": user_agent,
                })
            conn.commit()
            return entry_id
        finally:
            conn.close()

    def get_user_query_history(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
        since: Optional[datetime] = None,
    ) -> List[AuditEntry]:
        """Return a user's query history, newest first."""
        clauses = ["q.user_id = %(user_id)s"]
        params: Dict[str, Any] = {
            "user_id": user_id,
            "limit": limit,
            "offset": offset,
        }

        if since:
            clauses.append("q.created_at >= %(since)s")
            params["since"] = since

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT q.*
            FROM query_audit_log q
            {where}
            ORDER BY q.created_at DESC
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, params)
                return [self._row_to_entry(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_usage_stats_daily(
        self,
        days: int = 30,
        user_id: Optional[str] = None,
    ) -> List[UsageStats]:
        """Return daily usage stats for the last N days."""
        clauses = ["q.created_at >= NOW() - %(interval)s::interval"]
        params: Dict[str, Any] = {"interval": f"{days} days"}

        if user_id:
            clauses.append("q.user_id = %(user_id)s")
            params["user_id"] = user_id

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT
                TO_CHAR(q.created_at, 'YYYY-MM-DD') AS period,
                COUNT(*)                             AS query_count,
                COUNT(*) FILTER (WHERE q.was_successful = TRUE)  AS successful_count,
                COUNT(*) FILTER (WHERE q.was_successful = FALSE) AS failed_count,
                AVG(q.execution_time_ms)             AS avg_execution_time_ms,
                COUNT(DISTINCT q.user_id)            AS unique_users
            FROM query_audit_log q
            {where}
            GROUP BY period
            ORDER BY period DESC
        """

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, params)
                return [
                    UsageStats(
                        period=r["period"],
                        query_count=r["query_count"],
                        successful_count=r["successful_count"],
                        failed_count=r["failed_count"],
                        avg_execution_time_ms=float(r["avg_execution_time_ms"])
                        if r.get("avg_execution_time_ms") is not None
                        else None,
                        unique_users=r["unique_users"],
                    )
                    for r in cur.fetchall()
                ]
        finally:
            conn.close()

    def get_usage_stats_monthly(
        self,
        months: int = 12,
        user_id: Optional[str] = None,
    ) -> List[UsageStats]:
        """Return monthly usage stats for the last N months."""
        clauses = ["q.created_at >= NOW() - %(interval)s::interval"]
        params: Dict[str, Any] = {"interval": f"{months} months"}

        if user_id:
            clauses.append("q.user_id = %(user_id)s")
            params["user_id"] = user_id

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT
                TO_CHAR(q.created_at, 'YYYY-MM')    AS period,
                COUNT(*)                             AS query_count,
                COUNT(*) FILTER (WHERE q.was_successful = TRUE)  AS successful_count,
                COUNT(*) FILTER (WHERE q.was_successful = FALSE) AS failed_count,
                AVG(q.execution_time_ms)             AS avg_execution_time_ms,
                COUNT(DISTINCT q.user_id)            AS unique_users
            FROM query_audit_log q
            {where}
            GROUP BY period
            ORDER BY period DESC
        """

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, params)
                return [
                    UsageStats(
                        period=r["period"],
                        query_count=r["query_count"],
                        successful_count=r["successful_count"],
                        failed_count=r["failed_count"],
                        avg_execution_time_ms=float(r["avg_execution_time_ms"])
                        if r.get("avg_execution_time_ms") is not None
                        else None,
                        unique_users=r["unique_users"],
                    )
                    for r in cur.fetchall()
                ]
        finally:
            conn.close()

    def count_queries(
        self,
        user_id: Optional[str] = None,
        was_successful: Optional[bool] = None,
    ) -> int:
        """Return total query count with optional filters."""
        clauses: List[str] = []
        params: Dict[str, Any] = {}

        if user_id:
            clauses.append("q.user_id = %(user_id)s")
            params["user_id"] = user_id

        if was_successful is not None:
            clauses.append("q.was_successful = %(was_successful)s")
            params["was_successful"] = was_successful

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        sql = f"SELECT COUNT(*) FROM query_audit_log q {where}"

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchone()[0]
        finally:
            conn.close()
