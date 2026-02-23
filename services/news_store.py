"""
News Store (SQLite)
====================
SQLite-compatible news storage service. Schema mirrors the PostgreSQL
``news_articles`` table from ``database/schema.sql`` so the same data
model works in both development (SQLite) and production (PostgreSQL).

Thread-safe: reuses one SQLite connection per thread via threading.local().

Usage:
    from services.news_store import NewsStore
    store = NewsStore("saudi_stocks.db")
    store.store_articles([{...}, ...])
    articles = store.get_latest_news(limit=20)
"""

from __future__ import annotations

import asyncio
import logging
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

_CREATE_TABLE_SQL = """\
CREATE TABLE IF NOT EXISTS news_articles (
    id TEXT PRIMARY KEY,
    ticker TEXT,
    title TEXT NOT NULL,
    body TEXT,
    source_name TEXT,
    source_url TEXT,
    published_at TEXT,
    sentiment_score REAL,
    sentiment_label TEXT,
    language TEXT DEFAULT 'ar',
    priority INTEGER DEFAULT 3,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(title, source_name)
)
"""

_CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_news_articles_created_at ON news_articles (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles (source_name)",
    "CREATE INDEX IF NOT EXISTS idx_news_articles_ticker ON news_articles (ticker)",
    "CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles (published_at DESC)",
]


class NewsStore:
    """SQLite-backed news article storage."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._local = threading.local()
        self._ensure_table()

    def _connect(self) -> sqlite3.Connection:
        """Return a per-thread cached connection.

        Reuses the same connection within a thread to avoid the overhead of
        opening/closing SQLite connections on every operation. Each thread
        still gets its own connection (via threading.local), so there is no
        cross-thread contention.
        """
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.execute("SELECT 1")
                return conn
            except sqlite3.ProgrammingError:
                # Connection was closed externally
                pass
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        self._local.conn = conn
        return conn

    def close(self) -> None:
        """Close the current thread's cached connection, if any."""
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001 — thread-local conn teardown, non-fatal
                pass
            self._local.conn = None

    def _ensure_table(self) -> None:
        """Create the news_articles table and indexes if they don't exist."""
        conn = self._connect()
        try:
            conn.execute(_CREATE_TABLE_SQL)
            for idx_sql in _CREATE_INDEXES_SQL:
                conn.execute(idx_sql)
            conn.commit()
            logger.info("news_articles table ensured in %s", self.db_path)
        except Exception:
            conn.rollback()
            logger.error(
                "Failed to ensure news_articles table in %s",
                self.db_path,
                exc_info=True,
            )
            raise

    def store_articles(self, articles: List[Dict]) -> int:
        """Insert articles, skipping duplicates. Returns count of newly inserted.

        Uses a single ``executemany`` call (all-or-nothing batch). Duplicate
        rows are silently skipped by ``INSERT OR IGNORE`` at the SQLite engine
        level — no ``IntegrityError`` is raised for duplicates.  Any other
        unexpected error rolls back the entire batch.
        """
        if not articles:
            return 0

        conn = self._connect()
        try:
            rows = [
                (
                    article.get("id") or str(uuid.uuid4()),
                    article.get("ticker"),
                    article.get("title", ""),
                    article.get("body", ""),
                    article.get("source_name", ""),
                    article.get("source_url", ""),
                    article.get("published_at"),
                    article.get("sentiment_score"),
                    article.get("sentiment_label"),
                    article.get("language", "ar"),
                    article.get("priority", 3),
                )
                for article in articles
            ]
            before = conn.total_changes
            conn.executemany(
                """INSERT OR IGNORE INTO news_articles
                   (id, ticker, title, body, source_name, source_url,
                    published_at, sentiment_score, sentiment_label,
                    language, priority)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                rows,
            )
            inserted = conn.total_changes - before
            conn.commit()
            logger.info(
                "Stored %d new articles (of %d provided)", inserted, len(articles)
            )
        except Exception:
            conn.rollback()
            logger.error("Failed to store articles", exc_info=True)
            raise
        return inserted

    def _build_filters(
        self,
        source: Optional[str] = None,
        sentiment_label: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> tuple:
        """Build WHERE clause fragments and params for common filters.

        Returns (clauses: list[str], params: list).
        """
        clauses: List[str] = []
        params: list = []
        if source:
            clauses.append("source_name = ?")
            params.append(source)
        if sentiment_label:
            clauses.append("sentiment_label = ?")
            params.append(sentiment_label)
        if date_from:
            clauses.append("created_at >= ?")
            params.append(date_from)
        if date_to:
            # Include the full day by comparing with the next day boundary
            clauses.append("created_at <= ?")
            params.append(date_to + "T23:59:59")
        return clauses, params

    def get_latest_news(
        self,
        limit: int = 20,
        offset: int = 0,
        source: Optional[str] = None,
        sentiment_label: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> List[Dict]:
        """Get latest news, optionally filtered by source, sentiment, and date range.

        .. deprecated:: Use :meth:`aget_latest_news` in async contexts.
        """
        conn = self._connect()
        clauses, params = self._build_filters(
            source, sentiment_label, date_from, date_to
        )
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        params.extend([limit, offset])
        rows = conn.execute(
            f"""SELECT * FROM news_articles{where}
                ORDER BY created_at DESC, priority ASC
                LIMIT ? OFFSET ?""",
            params,
        ).fetchall()
        return [dict(row) for row in rows]

    def get_article_by_id(self, article_id: str) -> Optional[Dict]:
        """Get a single article by ID.

        .. deprecated:: Use :meth:`aget_article_by_id` in async contexts.
        """
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM news_articles WHERE id = ?", (article_id,)
        ).fetchone()
        return dict(row) if row else None

    def get_articles_by_ids(self, ids: List[str]) -> List[Dict]:
        """Get multiple articles by their IDs.

        .. deprecated:: Use :meth:`aget_articles_by_ids` in async contexts.
        """
        if not ids:
            return []
        conn = self._connect()
        placeholders = ",".join("?" for _ in ids)
        rows = conn.execute(
            f"SELECT * FROM news_articles WHERE id IN ({placeholders})"
            " ORDER BY created_at DESC",
            ids,
        ).fetchall()
        return [dict(row) for row in rows]

    def count_articles(
        self,
        source: Optional[str] = None,
        sentiment_label: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> int:
        """Count articles, optionally filtered by source, sentiment, and date range.

        .. deprecated:: Use :meth:`acount_articles` in async contexts.
        """
        conn = self._connect()
        clauses, params = self._build_filters(
            source, sentiment_label, date_from, date_to
        )
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        row = conn.execute(
            f"SELECT COUNT(*) FROM news_articles{where}", params
        ).fetchone()
        return row[0] if row else 0

    def search_articles(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        source: Optional[str] = None,
        sentiment_label: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> List[Dict]:
        """Search articles by title or body text, with optional filters.

        .. deprecated:: Use :meth:`asearch_articles` in async contexts.
        """
        conn = self._connect()
        escaped = query.replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        extra_clauses, extra_params = self._build_filters(
            source, sentiment_label, date_from, date_to
        )
        where = "(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')"
        params: list = [pattern, pattern]
        if extra_clauses:
            where += " AND " + " AND ".join(extra_clauses)
            params.extend(extra_params)
        params.extend([limit, offset])
        rows = conn.execute(
            f"""SELECT * FROM news_articles
                WHERE {where}
                ORDER BY created_at DESC, priority ASC
                LIMIT ? OFFSET ?""",
            params,
        ).fetchall()
        return [dict(row) for row in rows]

    def count_search(
        self,
        query: str,
        source: Optional[str] = None,
        sentiment_label: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> int:
        """Count total articles matching a search query with optional filters.

        .. deprecated:: Use :meth:`acount_search` in async contexts.
        """
        conn = self._connect()
        escaped = query.replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        extra_clauses, extra_params = self._build_filters(
            source, sentiment_label, date_from, date_to
        )
        where = "(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')"
        params: list = [pattern, pattern]
        if extra_clauses:
            where += " AND " + " AND ".join(extra_clauses)
            params.extend(extra_params)
        row = conn.execute(
            f"SELECT COUNT(*) FROM news_articles WHERE {where}", params
        ).fetchone()
        return row[0] if row else 0

    def get_sources(self) -> List[Dict]:
        """Get list of sources with article counts.

        .. deprecated:: Use :meth:`aget_sources` in async contexts.
        """
        conn = self._connect()
        rows = conn.execute(
            """SELECT source_name, COUNT(*) as count
               FROM news_articles
               GROUP BY source_name
               ORDER BY count DESC"""
        ).fetchall()
        return [dict(row) for row in rows]

    def cleanup_old(self, days: int = 7) -> int:
        """Delete articles older than N days. Returns count deleted."""
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        conn = self._connect()
        try:
            conn.execute("DELETE FROM news_articles WHERE created_at < ?", (cutoff,))
            deleted = conn.execute("SELECT changes()").fetchone()[0]
            conn.commit()
            if deleted:
                logger.info("Cleaned up %d articles older than %d days", deleted, days)
            return deleted
        except Exception:
            conn.rollback()
            logger.error("Failed to cleanup old articles", exc_info=True)
            raise

    # ------------------------------------------------------------------
    # Async wrappers (run sync I/O in a thread)
    # ------------------------------------------------------------------

    async def aget_latest_news(self, **kwargs) -> List[Dict]:
        return await asyncio.to_thread(self.get_latest_news, **kwargs)

    async def acount_articles(self, **kwargs) -> int:
        return await asyncio.to_thread(self.count_articles, **kwargs)

    async def aget_article_by_id(self, article_id: str) -> Optional[Dict]:
        return await asyncio.to_thread(self.get_article_by_id, article_id)

    async def asearch_articles(self, **kwargs) -> List[Dict]:
        return await asyncio.to_thread(self.search_articles, **kwargs)

    async def acount_search(self, **kwargs) -> int:
        return await asyncio.to_thread(self.count_search, **kwargs)

    async def aget_sources(self) -> List[Dict]:
        return await asyncio.to_thread(self.get_sources)

    async def aget_articles_by_ids(self, ids: List[str]) -> List[Dict]:
        return await asyncio.to_thread(self.get_articles_by_ids, ids)
