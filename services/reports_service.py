"""
Technical Reports Service
=========================
CRUD operations for the technical_reports table. Provides methods to store,
retrieve, and filter analyst research reports by ticker, recommendation,
report type, and date range.

Accepts a ``get_conn`` callable at init. When the connection pool is active,
use ``database.pool.get_pool_connection`` as the callable -- pool-returned
connections auto-return to the pool on ``close()``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras


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
        # Remove created_at so the DB default (NOW()) applies
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
        A zero-argument callable that returns a psycopg2 connection.
        The service calls ``conn.close()`` after each operation.
    """

    def __init__(self, get_conn):
        self._get_conn = get_conn

    # -- helpers -------------------------------------------------------------

    def _conn(self):
        return self._get_conn()

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

    # -- public API ----------------------------------------------------------

    def store_report(self, report: TechnicalReport) -> str:
        """Insert a single report. Returns the report id.

        Duplicates (same id) are silently skipped via ON CONFLICT DO NOTHING.
        """
        sql = """
            INSERT INTO technical_reports
                (id, ticker, title, summary, author, source_name, source_url,
                 published_at, recommendation, target_price,
                 current_price_at_report, report_type)
            VALUES
                (%(id)s, %(ticker)s, %(title)s, %(summary)s, %(author)s,
                 %(source_name)s, %(source_url)s, %(published_at)s,
                 %(recommendation)s, %(target_price)s,
                 %(current_price_at_report)s, %(report_type)s)
            ON CONFLICT (id) DO NOTHING
        """

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, report.to_dict())
            conn.commit()
            return report.id
        finally:
            conn.close()

    def store_reports(self, reports: List[TechnicalReport]) -> int:
        """Bulk insert reports. Returns the number of rows submitted.

        Duplicates (same id) are silently skipped via ON CONFLICT DO NOTHING.
        """
        if not reports:
            return 0

        sql = """
            INSERT INTO technical_reports
                (id, ticker, title, summary, author, source_name, source_url,
                 published_at, recommendation, target_price,
                 current_price_at_report, report_type)
            VALUES
                (%(id)s, %(ticker)s, %(title)s, %(summary)s, %(author)s,
                 %(source_name)s, %(source_url)s, %(published_at)s,
                 %(recommendation)s, %(target_price)s,
                 %(current_price_at_report)s, %(report_type)s)
            ON CONFLICT (id) DO NOTHING
        """

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.executemany(sql, [r.to_dict() for r in reports])
            conn.commit()
            return len(reports)
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
        clauses: List[str] = []
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if recommendation:
            clauses.append("r.recommendation ILIKE %(recommendation)s")
            params["recommendation"] = recommendation

        if report_type:
            clauses.append("r.report_type = %(report_type)s")
            params["report_type"] = report_type

        if since:
            clauses.append("r.published_at >= %(since)s")
            params["since"] = since

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        sql = f"""
            SELECT r.*
            FROM technical_reports r
            {where}
            ORDER BY r.published_at DESC NULLS LAST
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, params)
                return [self._row_to_report(r) for r in cur.fetchall()]
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
        clauses = ["r.ticker = %(ticker)s"]
        params: Dict[str, Any] = {
            "ticker": ticker,
            "limit": limit,
            "offset": offset,
        }

        if recommendation:
            clauses.append("r.recommendation ILIKE %(recommendation)s")
            params["recommendation"] = recommendation

        if since:
            clauses.append("r.published_at >= %(since)s")
            params["since"] = since

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT r.*
            FROM technical_reports r
            {where}
            ORDER BY r.published_at DESC NULLS LAST
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, params)
                return [self._row_to_report(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_report_by_id(self, report_id: str) -> Optional[TechnicalReport]:
        """Return a single report by its UUID, or None if not found."""
        sql = "SELECT * FROM technical_reports WHERE id = %(id)s"

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, {"id": report_id})
                row = cur.fetchone()
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
        clauses: List[str] = []
        params: Dict[str, Any] = {}

        if ticker:
            clauses.append("r.ticker = %(ticker)s")
            params["ticker"] = ticker

        if recommendation:
            clauses.append("r.recommendation ILIKE %(recommendation)s")
            params["recommendation"] = recommendation

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        sql = f"SELECT COUNT(*) FROM technical_reports r {where}"

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchone()[0]
        finally:
            conn.close()
