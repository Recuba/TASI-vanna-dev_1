"""
Technical Reports Service
=========================
CRUD operations for the technical_reports table. Provides methods to store,
retrieve, and filter analyst research reports by ticker, recommendation,
report type, and date range.

Supports both SQLite and PostgreSQL backends. The backend is detected at
runtime from the connection type returned by ``get_conn``.
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    import psycopg2
    import psycopg2.extras

    _HAS_PSYCOPG2 = True
except ImportError:
    _HAS_PSYCOPG2 = False

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------
@dataclass
class TechnicalReport:
    """Mirrors the technical_reports table in database/schema.sql."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    ticker: Optional[str] = None
    title: str = ""
    summary: Optional[str] = None
    author: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    published_at: Optional[datetime] = None
    recommendation: Optional[str] = None
    target_price: Optional[float] = None
    current_price_at_report: Optional[float] = None
    report_type: Optional[str] = None
    created_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict suitable for database insertion."""
        d = asdict(self)
        # Remove created_at so the DB default applies
        if d["created_at"] is None:
            del d["created_at"]
        return d


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class TechnicalReportsService:
    """Service layer for the technical_reports table.

    Parameters
    ----------
    get_conn : callable
        A zero-argument callable that returns a database connection
        (sqlite3.Connection or psycopg2 connection).
        The service calls ``conn.close()`` after each operation.
    """

    # SQLite CREATE TABLE (run once per connection when table is missing)
    _SQLITE_CREATE_TABLE = """
        CREATE TABLE IF NOT EXISTS technical_reports (
            id                      TEXT PRIMARY KEY,
            ticker                  TEXT,
            title                   TEXT NOT NULL,
            summary                 TEXT,
            author                  TEXT,
            source_name             TEXT,
            source_url              TEXT,
            published_at            TEXT,
            recommendation          TEXT,
            target_price            REAL,
            current_price_at_report REAL,
            report_type             TEXT,
            created_at              TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """

    def __init__(self, get_conn):
        self._get_conn = get_conn

    # -- helpers -------------------------------------------------------------

    def _conn(self):
        conn = self._get_conn()
        if self._is_sqlite(conn):
            self._ensure_table(conn)
        return conn

    @staticmethod
    def _is_sqlite(conn) -> bool:
        return isinstance(conn, sqlite3.Connection)

    @classmethod
    def _ensure_table(cls, conn: sqlite3.Connection):
        """Create the technical_reports table in SQLite if it doesn't exist."""
        conn.execute(cls._SQLITE_CREATE_TABLE)
        conn.commit()

    @staticmethod
    def _fetchall(conn, sql: str, params) -> List[Dict[str, Any]]:
        """Execute SQL and return all rows as dicts, for either backend."""
        if isinstance(conn, sqlite3.Connection):
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
        # PostgreSQL
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]

    @staticmethod
    def _fetchone(conn, sql: str, params) -> Optional[Dict[str, Any]]:
        """Execute SQL and return first row as dict, for either backend."""
        if isinstance(conn, sqlite3.Connection):
            row = conn.execute(sql, params).fetchone()
            return dict(row) if row else None
        # PostgreSQL
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return dict(row) if row else None

    @staticmethod
    def _scalar(conn, sql: str, params):
        """Execute SQL and return a single scalar value."""
        if isinstance(conn, sqlite3.Connection):
            row = conn.execute(sql, params).fetchone()
            return row[0] if row else None
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return row[0] if row else None

    @staticmethod
    def _execute(conn, sql: str, params):
        """Execute a write statement."""
        if isinstance(conn, sqlite3.Connection):
            conn.execute(sql, params)
        else:
            with conn.cursor() as cur:
                cur.execute(sql, params)

    @staticmethod
    def _executemany(conn, sql: str, params_list: list):
        """Execute a write statement for many rows."""
        if isinstance(conn, sqlite3.Connection):
            conn.executemany(sql, params_list)
        else:
            with conn.cursor() as cur:
                cur.executemany(sql, params_list)

    @staticmethod
    def _row_to_report(row: Dict[str, Any]) -> TechnicalReport:
        return TechnicalReport(
            id=str(row["id"]),
            ticker=row.get("ticker"),
            title=row["title"],
            summary=row.get("summary"),
            author=row.get("author"),
            source_name=row.get("source_name"),
            source_url=row.get("source_url"),
            published_at=row.get("published_at"),
            recommendation=row.get("recommendation"),
            target_price=float(row["target_price"])
            if row.get("target_price") is not None
            else None,
            current_price_at_report=float(row["current_price_at_report"])
            if row.get("current_price_at_report") is not None
            else None,
            report_type=row.get("report_type"),
            created_at=row.get("created_at"),
        )

    # -- SQL builders --------------------------------------------------------

    @staticmethod
    def _like_op(is_sqlite: bool) -> str:
        """LIKE is case-insensitive in SQLite by default for ASCII; use LIKE
        for SQLite and ILIKE for PostgreSQL."""
        return "LIKE" if is_sqlite else "ILIKE"

    @staticmethod
    def _nulls_last(is_sqlite: bool) -> str:
        """SQLite doesn't support NULLS LAST syntax."""
        return "" if is_sqlite else "NULLS LAST"

    @staticmethod
    def _conflict_ignore(is_sqlite: bool) -> str:
        return "OR IGNORE" if is_sqlite else ""

    @staticmethod
    def _on_conflict(is_sqlite: bool) -> str:
        return "" if is_sqlite else "ON CONFLICT (id) DO NOTHING"

    def _build_insert_sql(self, is_sqlite: bool) -> str:
        """Build INSERT SQL for the active backend."""
        cols = (
            "id, ticker, title, summary, author, source_name, source_url, "
            "published_at, recommendation, target_price, "
            "current_price_at_report, report_type"
        )
        if is_sqlite:
            placeholders = ", ".join(["?"] * 12)
            return (
                f"INSERT OR IGNORE INTO technical_reports ({cols}) "
                f"VALUES ({placeholders})"
            )
        # PostgreSQL — named params
        placeholders = (
            "%(id)s, %(ticker)s, %(title)s, %(summary)s, %(author)s, "
            "%(source_name)s, %(source_url)s, %(published_at)s, "
            "%(recommendation)s, %(target_price)s, "
            "%(current_price_at_report)s, %(report_type)s"
        )
        return (
            f"INSERT INTO technical_reports ({cols}) "
            f"VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
        )

    @staticmethod
    def _to_insert_params(report: TechnicalReport, is_sqlite: bool):
        """Convert report to params suitable for the backend."""
        d = report.to_dict()
        if is_sqlite:
            return (
                d["id"],
                d.get("ticker"),
                d["title"],
                d.get("summary"),
                d.get("author"),
                d.get("source_name"),
                d.get("source_url"),
                d.get("published_at") and str(d["published_at"]),
                d.get("recommendation"),
                d.get("target_price"),
                d.get("current_price_at_report"),
                d.get("report_type"),
            )
        return d

    # -- public API ----------------------------------------------------------

    def store_report(self, report: TechnicalReport) -> str:
        """Insert a single report. Returns the report id.

        Duplicates (same id) are silently skipped.
        """
        conn = self._conn()
        is_sqlite = self._is_sqlite(conn)
        sql = self._build_insert_sql(is_sqlite)
        params = self._to_insert_params(report, is_sqlite)

        try:
            self._execute(conn, sql, params)
            conn.commit()
            return report.id
        except Exception:
            conn.rollback()
            logger.error("Failed to store report %s", report.id, exc_info=True)
            raise
        finally:
            conn.close()

    def store_reports(self, reports: List[TechnicalReport]) -> int:
        """Bulk insert reports. Returns the number of rows submitted.

        Duplicates (same id) are silently skipped.
        """
        if not reports:
            return 0

        conn = self._conn()
        is_sqlite = self._is_sqlite(conn)
        sql = self._build_insert_sql(is_sqlite)
        params_list = [self._to_insert_params(r, is_sqlite) for r in reports]

        try:
            self._executemany(conn, sql, params_list)
            conn.commit()
            return len(reports)
        except Exception:
            conn.rollback()
            logger.error("Failed to store %d reports", len(reports), exc_info=True)
            raise
        finally:
            conn.close()

    def get_reports(
        self,
        limit: int = 20,
        offset: int = 0,
        recommendation: Optional[str] = None,
        report_type: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> List[TechnicalReport]:
        """Return the most recent reports across all tickers."""
        conn = self._conn()
        is_sqlite = self._is_sqlite(conn)
        like = self._like_op(is_sqlite)
        nulls_last = self._nulls_last(is_sqlite)

        clauses: List[str] = []
        if is_sqlite:
            params: list = []
            if recommendation:
                clauses.append(f"r.recommendation {like} ?")
                params.append(recommendation)
            if report_type:
                clauses.append("r.report_type = ?")
                params.append(report_type)
            if since:
                clauses.append("r.published_at >= ?")
                params.append(str(since))
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            sql = (
                f"SELECT r.* FROM technical_reports r {where} "
                f"ORDER BY r.published_at DESC {nulls_last} "
                f"LIMIT ? OFFSET ?"
            )
            params.extend([limit, offset])
        else:
            pg_params: Dict[str, Any] = {"limit": limit, "offset": offset}
            if recommendation:
                clauses.append(f"r.recommendation {like} %(recommendation)s")
                pg_params["recommendation"] = recommendation
            if report_type:
                clauses.append("r.report_type = %(report_type)s")
                pg_params["report_type"] = report_type
            if since:
                clauses.append("r.published_at >= %(since)s")
                pg_params["since"] = since
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            sql = (
                f"SELECT r.* FROM technical_reports r {where} "
                f"ORDER BY r.published_at DESC {nulls_last} "
                f"LIMIT %(limit)s OFFSET %(offset)s"
            )
            params = pg_params  # type: ignore[assignment]

        try:
            rows = self._fetchall(conn, sql, params)
            return [self._row_to_report(r) for r in rows]
        finally:
            conn.close()

    def get_reports_by_ticker(
        self,
        ticker: str,
        limit: int = 20,
        offset: int = 0,
        recommendation: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> List[TechnicalReport]:
        """Return reports for a specific ticker, newest first."""
        conn = self._conn()
        is_sqlite = self._is_sqlite(conn)
        like = self._like_op(is_sqlite)
        nulls_last = self._nulls_last(is_sqlite)

        if is_sqlite:
            clauses = ["r.ticker = ?"]
            params: list = [ticker]
            if recommendation:
                clauses.append(f"r.recommendation {like} ?")
                params.append(recommendation)
            if since:
                clauses.append("r.published_at >= ?")
                params.append(str(since))
            where = "WHERE " + " AND ".join(clauses)
            sql = (
                f"SELECT r.* FROM technical_reports r {where} "
                f"ORDER BY r.published_at DESC {nulls_last} "
                f"LIMIT ? OFFSET ?"
            )
            params.extend([limit, offset])
        else:
            clauses_pg = ["r.ticker = %(ticker)s"]
            pg_params: Dict[str, Any] = {
                "ticker": ticker,
                "limit": limit,
                "offset": offset,
            }
            if recommendation:
                clauses_pg.append(f"r.recommendation {like} %(recommendation)s")
                pg_params["recommendation"] = recommendation
            if since:
                clauses_pg.append("r.published_at >= %(since)s")
                pg_params["since"] = since
            where = "WHERE " + " AND ".join(clauses_pg)
            sql = (
                f"SELECT r.* FROM technical_reports r {where} "
                f"ORDER BY r.published_at DESC {nulls_last} "
                f"LIMIT %(limit)s OFFSET %(offset)s"
            )
            params = pg_params  # type: ignore[assignment]

        try:
            rows = self._fetchall(conn, sql, params)
            return [self._row_to_report(r) for r in rows]
        finally:
            conn.close()

    def get_report_by_id(self, report_id: str) -> Optional[TechnicalReport]:
        """Return a single report by its UUID, or None if not found."""
        conn = self._conn()
        is_sqlite = self._is_sqlite(conn)

        if is_sqlite:
            sql = "SELECT * FROM technical_reports WHERE id = ?"
            params: Any = (report_id,)
        else:
            sql = "SELECT * FROM technical_reports WHERE id = %(id)s"
            params = {"id": report_id}

        try:
            row = self._fetchone(conn, sql, params)
            if row is None:
                return None
            return self._row_to_report(row)
        finally:
            conn.close()

    def count_reports(
        self,
        ticker: Optional[str] = None,
        recommendation: Optional[str] = None,
    ) -> int:
        """Return total report count with optional ticker/recommendation filter."""
        conn = self._conn()
        is_sqlite = self._is_sqlite(conn)
        like = self._like_op(is_sqlite)

        if is_sqlite:
            clauses: List[str] = []
            params: list = []
            if ticker:
                clauses.append("r.ticker = ?")
                params.append(ticker)
            if recommendation:
                clauses.append(f"r.recommendation {like} ?")
                params.append(recommendation)
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            sql = f"SELECT COUNT(*) FROM technical_reports r {where}"
        else:
            clauses_pg: List[str] = []
            pg_params: Dict[str, Any] = {}
            if ticker:
                clauses_pg.append("r.ticker = %(ticker)s")
                pg_params["ticker"] = ticker
            if recommendation:
                clauses_pg.append(f"r.recommendation {like} %(recommendation)s")
                pg_params["recommendation"] = recommendation
            where = ("WHERE " + " AND ".join(clauses_pg)) if clauses_pg else ""
            sql = f"SELECT COUNT(*) FROM technical_reports r {where}"
            params = pg_params  # type: ignore[assignment]

        try:
            return self._scalar(conn, sql, params) or 0
        finally:
            conn.close()
