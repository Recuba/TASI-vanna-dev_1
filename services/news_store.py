"""
News Store (SQLite)
====================
SQLite-compatible news storage service. Schema mirrors the PostgreSQL
``news_articles`` table from ``database/schema.sql`` so the same data
model works in both development (SQLite) and production (PostgreSQL).

Thread-safe: creates a new connection per operation.

Usage:
    from services.news_store import NewsStore
    store = NewsStore("saudi_stocks.db")
    store.store_articles([{...}, ...])
    articles = store.get_latest_news(limit=20)
"""

from __future__ import annotations

import logging
import sqlite3
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
        self._ensure_table()

    def _connect(self) -> sqlite3.Connection:
        """Create a new connection (thread-safe pattern)."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

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
        finally:
            conn.close()

    def store_articles(self, articles: List[Dict]) -> int:
        """Insert articles, skipping duplicates. Returns count of newly inserted."""
        if not articles:
            return 0

        conn = self._connect()
        inserted = 0
        try:
            for article in articles:
                article_id = article.get("id") or str(uuid.uuid4())
                try:
                    conn.execute(
                        """INSERT OR IGNORE INTO news_articles
                           (id, ticker, title, body, source_name, source_url,
                            published_at, sentiment_score, sentiment_label,
                            language, priority)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            article_id,
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
                        ),
                    )
                    if conn.execute("SELECT changes()").fetchone()[0] > 0:
                        inserted += 1
                except sqlite3.IntegrityError:
                    pass
            conn.commit()
            logger.info(
                "Stored %d new articles (of %d provided)", inserted, len(articles)
            )
        except Exception:
            conn.rollback()
            logger.error("Failed to store articles", exc_info=True)
            raise
        finally:
            conn.close()
        return inserted

    def get_latest_news(
        self,
        limit: int = 20,
        offset: int = 0,
        source: Optional[str] = None,
    ) -> List[Dict]:
        """Get latest news, optionally filtered by source_name."""
        conn = self._connect()
        try:
            if source:
                rows = conn.execute(
                    """SELECT * FROM news_articles
                       WHERE source_name = ?
                       ORDER BY priority ASC, created_at DESC
                       LIMIT ? OFFSET ?""",
                    (source, limit, offset),
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT * FROM news_articles
                       ORDER BY priority ASC, created_at DESC
                       LIMIT ? OFFSET ?""",
                    (limit, offset),
                ).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def get_article_by_id(self, article_id: str) -> Optional[Dict]:
        """Get a single article by ID."""
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM news_articles WHERE id = ?", (article_id,)
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def count_articles(self, source: Optional[str] = None) -> int:
        """Count articles, optionally filtered by source."""
        conn = self._connect()
        try:
            if source:
                row = conn.execute(
                    "SELECT COUNT(*) FROM news_articles WHERE source_name = ?",
                    (source,),
                ).fetchone()
            else:
                row = conn.execute("SELECT COUNT(*) FROM news_articles").fetchone()
            return row[0] if row else 0
        finally:
            conn.close()

    def search_articles(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict]:
        """Search articles by title or body text (case-insensitive LIKE)."""
        conn = self._connect()
        try:
            # Escape LIKE wildcards in user input to prevent pattern injection
            escaped = query.replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            rows = conn.execute(
                """SELECT * FROM news_articles
                   WHERE title LIKE ? OR body LIKE ?
                   ORDER BY priority ASC, created_at DESC
                   LIMIT ? OFFSET ?""",
                (pattern, pattern, limit, offset),
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def get_sources(self) -> List[Dict]:
        """Get list of sources with article counts."""
        conn = self._connect()
        try:
            rows = conn.execute(
                """SELECT source_name, COUNT(*) as count
                   FROM news_articles
                   GROUP BY source_name
                   ORDER BY count DESC"""
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

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
        finally:
            conn.close()
