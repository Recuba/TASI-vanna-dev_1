"""
Announcement Service
====================
CRUD operations for the announcements table. Provides methods to store,
retrieve, and filter CMA/Tadawul announcements by ticker, sector, category,
date range, and materiality.

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
class Announcement:
    """Mirrors the announcements table in database/schema.sql."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    ticker: Optional[str] = None
    title_ar: Optional[str] = None
    title_en: Optional[str] = None
    body_ar: Optional[str] = None
    body_en: Optional[str] = None
    source: Optional[str] = None  # 'CMA', 'Tadawul'
    announcement_date: Optional[datetime] = None
    category: Optional[str] = None
    classification: Optional[str] = None
    is_material: bool = False
    embedding_flag: bool = False
    source_url: Optional[str] = None
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
class AnnouncementService:
    """Service layer for the announcements table.

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
    def _row_to_announcement(row: Dict[str, Any]) -> Announcement:
        return Announcement(
            id=str(row["id"]),
            ticker=row.get("ticker"),
            title_ar=row.get("title_ar"),
            title_en=row.get("title_en"),
            body_ar=row.get("body_ar"),
            body_en=row.get("body_en"),
            source=row.get("source"),
            announcement_date=row.get("announcement_date"),
            category=row.get("category"),
            classification=row.get("classification"),
            is_material=row.get("is_material", False),
            embedding_flag=row.get("embedding_flag", False),
            source_url=row.get("source_url"),
            created_at=row.get("created_at"),
        )

    # -- public API ----------------------------------------------------------

    def store_announcements(self, announcements: List[Announcement]) -> int:
        """Insert one or more announcements. Returns the number of rows submitted.

        Duplicates (same id) are silently skipped via ON CONFLICT DO NOTHING.
        """
        if not announcements:
            return 0

        sql = """
            INSERT INTO announcements
                (id, ticker, title_ar, title_en, body_ar, body_en,
                 source, announcement_date, category, classification,
                 is_material, embedding_flag, source_url)
            VALUES
                (%(id)s, %(ticker)s, %(title_ar)s, %(title_en)s,
                 %(body_ar)s, %(body_en)s, %(source)s,
                 %(announcement_date)s, %(category)s, %(classification)s,
                 %(is_material)s, %(embedding_flag)s, %(source_url)s)
            ON CONFLICT (id) DO NOTHING
        """

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.executemany(sql, [a.to_dict() for a in announcements])
            conn.commit()
            return len(announcements)
        finally:
            conn.close()

    def get_announcements(
        self,
        limit: int = 20,
        offset: int = 0,
        ticker: Optional[str] = None,
        category: Optional[str] = None,
        source: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> List[Announcement]:
        """Return announcements with optional filters, newest first."""
        clauses: List[str] = []
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if ticker:
            clauses.append("a.ticker = %(ticker)s")
            params["ticker"] = ticker

        if category:
            clauses.append("a.category ILIKE %(category)s")
            params["category"] = category

        if source:
            clauses.append("a.source ILIKE %(source)s")
            params["source"] = source

        if since:
            clauses.append("a.announcement_date >= %(since)s")
            params["since"] = since

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        sql = f"""
            SELECT a.*
            FROM announcements a
            {where}
            ORDER BY a.announcement_date DESC NULLS LAST
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, params)
                return [self._row_to_announcement(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_material_events(
        self,
        limit: int = 20,
        offset: int = 0,
        ticker: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> List[Announcement]:
        """Return only material announcements (is_material = TRUE), newest first."""
        clauses = ["a.is_material = TRUE"]
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if ticker:
            clauses.append("a.ticker = %(ticker)s")
            params["ticker"] = ticker

        if since:
            clauses.append("a.announcement_date >= %(since)s")
            params["since"] = since

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT a.*
            FROM announcements a
            {where}
            ORDER BY a.announcement_date DESC NULLS LAST
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, params)
                return [self._row_to_announcement(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_announcements_by_sector(
        self,
        sector: str,
        limit: int = 20,
        offset: int = 0,
        since: Optional[datetime] = None,
    ) -> List[Announcement]:
        """Return announcements for all companies in a sector, newest first."""
        clauses = ["c.sector ILIKE %(sector)s"]
        params: Dict[str, Any] = {
            "sector": sector,
            "limit": limit,
            "offset": offset,
        }

        if since:
            clauses.append("a.announcement_date >= %(since)s")
            params["since"] = since

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT a.*
            FROM announcements a
            JOIN companies c ON c.ticker = a.ticker
            {where}
            ORDER BY a.announcement_date DESC NULLS LAST
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, params)
                return [self._row_to_announcement(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_announcement_by_id(
        self, announcement_id: str
    ) -> Optional[Announcement]:
        """Return a single announcement by its UUID, or None if not found."""
        sql = "SELECT * FROM announcements WHERE id = %(id)s"

        conn = self._conn()
        try:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                cur.execute(sql, {"id": announcement_id})
                row = cur.fetchone()
                if row is None:
                    return None
                return self._row_to_announcement(row)
        finally:
            conn.close()

    def count_announcements(
        self,
        ticker: Optional[str] = None,
        is_material: Optional[bool] = None,
    ) -> int:
        """Return total announcement count with optional filters."""
        clauses: List[str] = []
        params: Dict[str, Any] = {}

        if ticker:
            clauses.append("a.ticker = %(ticker)s")
            params["ticker"] = ticker

        if is_material is not None:
            clauses.append("a.is_material = %(is_material)s")
            params["is_material"] = is_material

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        sql = f"SELECT COUNT(*) FROM announcements a {where}"

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchone()[0]
        finally:
            conn.close()
