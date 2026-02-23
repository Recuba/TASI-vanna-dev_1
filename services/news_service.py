"""
News Aggregation Service
========================
CRUD operations for news_articles table. Provides methods to store, retrieve,
and filter news articles by ticker, sector, date range, and sentiment.

Accepts a ``get_conn`` callable at init. When the connection pool is active,
use ``database.pool.get_pool_connection`` as the callable -- pool-returned
connections auto-return to the pool on ``close()``.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------
@dataclass
class NewsArticle:
    """Mirrors the news_articles table in database/schema.sql."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    ticker: Optional[str] = None
    title: str = ""
    body: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    published_at: Optional[datetime] = None
    sentiment_score: Optional[float] = None
    sentiment_label: Optional[str] = None
    entities_extracted: Optional[Dict[str, Any]] = None
    language: str = "ar"
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
class NewsAggregationService:
    """Service layer for the news_articles table.

    Parameters
    ----------
    get_conn : callable
        A zero-argument callable that returns a psycopg2 connection.
        The service calls ``conn.close()`` after each operation so the
        caller can supply a connection-pool checkout (e.g.
        ``pool.getconn``).
    """

    def __init__(self, get_conn):
        self._get_conn = get_conn

    # -- helpers -------------------------------------------------------------

    def _conn(self):
        return self._get_conn()

    @staticmethod
    def _row_to_article(row: Dict[str, Any]) -> NewsArticle:
        return NewsArticle(
            id=str(row["id"]),
            ticker=row.get("ticker"),
            title=row["title"],
            body=row.get("body"),
            source_name=row.get("source_name"),
            source_url=row.get("source_url"),
            published_at=row.get("published_at"),
            sentiment_score=float(row["sentiment_score"])
            if row.get("sentiment_score") is not None
            else None,
            sentiment_label=row.get("sentiment_label"),
            entities_extracted=row.get("entities_extracted"),
            language=row.get("language", "ar"),
            created_at=row.get("created_at"),
        )

    # -- public API ----------------------------------------------------------

    def store_articles(self, articles: List[NewsArticle]) -> int:
        """Insert one or more articles. Returns the number of rows inserted.

        Duplicates (same id) are silently skipped via ON CONFLICT DO NOTHING.
        """
        if not articles:
            return 0

        sql = """
            INSERT INTO news_articles
                (id, ticker, title, body, source_name, source_url,
                 published_at, sentiment_score, sentiment_label,
                 entities_extracted, language)
            VALUES
                (%(id)s, %(ticker)s, %(title)s, %(body)s, %(source_name)s,
                 %(source_url)s, %(published_at)s, %(sentiment_score)s,
                 %(sentiment_label)s, %(entities_extracted)s, %(language)s)
            ON CONFLICT (id) DO NOTHING
        """

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                # Use Json adapter for JSONB column
                rows = []
                for a in articles:
                    d = a.to_dict()
                    d["entities_extracted"] = psycopg2.extras.Json(
                        d.get("entities_extracted")
                    )
                    rows.append(d)
                cur.executemany(sql, rows)
            conn.commit()
            return len(articles)
        except Exception as exc:  # noqa: BLE001 — re-raises after rollback
            conn.rollback()
            logger.error(
                "Failed to store %d articles: %s", len(articles), exc, exc_info=True
            )
            raise
        finally:
            conn.close()

    def get_latest_news(
        self,
        limit: int = 20,
        offset: int = 0,
        language: Optional[str] = None,
    ) -> List[NewsArticle]:
        """Return the most recent articles across all tickers."""
        clauses: List[str] = []
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if language:
            clauses.append("n.language = %(language)s")
            params["language"] = language

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        sql = f"""
            SELECT n.*
            FROM news_articles n
            {where}
            ORDER BY n.published_at DESC NULLS LAST
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                return [self._row_to_article(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_news_by_ticker(
        self,
        ticker: str,
        limit: int = 20,
        offset: int = 0,
        sentiment_label: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> List[NewsArticle]:
        """Return articles for a specific ticker, newest first."""
        clauses = ["n.ticker = %(ticker)s"]
        params: Dict[str, Any] = {
            "ticker": ticker,
            "limit": limit,
            "offset": offset,
        }

        if sentiment_label:
            clauses.append("n.sentiment_label = %(sentiment_label)s")
            params["sentiment_label"] = sentiment_label

        if since:
            clauses.append("n.published_at >= %(since)s")
            params["since"] = since

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT n.*
            FROM news_articles n
            {where}
            ORDER BY n.published_at DESC NULLS LAST
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                return [self._row_to_article(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_news_by_sector(
        self,
        sector: str,
        limit: int = 20,
        offset: int = 0,
        since: Optional[datetime] = None,
    ) -> List[NewsArticle]:
        """Return articles for all companies in a given sector, newest first.

        Joins news_articles to companies on ticker to filter by sector.
        """
        clauses = ["c.sector ILIKE %(sector)s"]
        params: Dict[str, Any] = {
            "sector": sector,
            "limit": limit,
            "offset": offset,
        }

        if since:
            clauses.append("n.published_at >= %(since)s")
            params["since"] = since

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT n.*
            FROM news_articles n
            JOIN companies c ON c.ticker = n.ticker
            {where}
            ORDER BY n.published_at DESC NULLS LAST
            LIMIT %(limit)s OFFSET %(offset)s
        """

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                return [self._row_to_article(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_article_by_id(self, article_id: str) -> Optional[NewsArticle]:
        """Return a single article by its UUID, or None if not found."""
        sql = "SELECT * FROM news_articles WHERE id = %(id)s"

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, {"id": article_id})
                row = cur.fetchone()
                if row is None:
                    return None
                return self._row_to_article(row)
        finally:
            conn.close()

    def count_articles(
        self,
        ticker: Optional[str] = None,
        sector: Optional[str] = None,
    ) -> int:
        """Return total article count with optional ticker/sector filter."""
        clauses: List[str] = []
        params: Dict[str, Any] = {}
        join_companies = False

        if ticker:
            clauses.append("n.ticker = %(ticker)s")
            params["ticker"] = ticker

        if sector:
            clauses.append("c.sector ILIKE %(sector)s")
            params["sector"] = sector
            join_companies = True

        join = "JOIN companies c ON c.ticker = n.ticker" if join_companies else ""
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        sql = f"SELECT COUNT(*) FROM news_articles n {join} {where}"

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchone()[0]
        finally:
            conn.close()
