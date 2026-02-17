"""
Database Compatibility Layer
=============================
Provides backend-aware query helpers for code that needs to work with
both SQLite and PostgreSQL backends.

Primary consumers:
  - ``services/health_service.py`` (health checks that query entity/market data)

For route-level dual-backend queries, prefer ``api/db_helper.py`` instead.
"""

from __future__ import annotations

import logging
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import get_settings

logger = logging.getLogger(__name__)

_HERE = Path(__file__).resolve().parent.parent
_SQLITE_PATH = str(_HERE / "saudi_stocks.db")


def is_postgres() -> bool:
    """Return True when the active backend is PostgreSQL."""
    settings = get_settings()
    return settings.db.backend == "postgres"


def get_read_connection():
    """Return a read-only database connection for the active backend.

    * **SQLite**: opens ``saudi_stocks.db`` with ``sqlite3.Row`` factory.
    * **PostgreSQL**: checks the connection pool first, falls back to direct.

    The caller **must** close the connection in a ``finally`` block.
    """
    if is_postgres():
        try:
            from database.pool import is_pool_initialized, get_pool_connection

            if is_pool_initialized():
                return get_pool_connection()
        except ImportError:
            pass

        # Fallback to direct connection
        import psycopg2

        settings = get_settings()
        return psycopg2.connect(
            host=settings.db.pg_host,
            port=settings.db.pg_port,
            dbname=settings.db.pg_database,
            user=settings.db.pg_user,
            password=settings.db.pg_password,
            connect_timeout=5,
        )

    # SQLite
    db_path = _SQLITE_PATH
    settings = get_settings()
    if settings:
        db_path = str(settings.db.resolved_sqlite_path)

    conn = sqlite3.connect(db_path, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def fetchall_compat(
    conn, sql: str, params: Optional[tuple] = None
) -> List[Dict[str, Any]]:
    """Execute SQL and return all rows as dicts, for either backend."""
    if is_postgres():
        import psycopg2.extras

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return [dict(r) for r in cur.fetchall()]

    rows = conn.execute(sql, params or ()).fetchall()
    return [dict(r) for r in rows]


def fetchone_compat(
    conn, sql: str, params: Optional[tuple] = None
) -> Optional[Dict[str, Any]]:
    """Execute SQL and return first row as dict, for either backend."""
    if is_postgres():
        import psycopg2.extras

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return dict(row) if row else None

    row = conn.execute(sql, params or ()).fetchone()
    return dict(row) if row else None


def scalar_compat(conn, sql: str, params: Optional[tuple] = None) -> Any:
    """Execute SQL and return a single scalar value, for either backend."""
    if is_postgres():
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return row[0] if row else None

    row = conn.execute(sql, params or ()).fetchone()
    return row[0] if row else None


def table_exists(conn, table_name: str) -> bool:
    """Check if a table exists, for either backend."""
    if is_postgres():
        sql = (
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = %s"
        )
        with conn.cursor() as cur:
            cur.execute(sql, (table_name,))
            return cur.fetchone() is not None

    # SQLite
    sql = "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    row = conn.execute(sql, (table_name,)).fetchone()
    return row is not None


# Whitelist of allowed column names for datetime filtering
_ALLOWED_DATETIME_COLUMNS = frozenset({
    "created_at", "updated_at", "published_at", "fetched_at",
    "scraped_at", "timestamp", "date",
})

# Interval must match pattern like "1 day", "24 hours", "30 minutes"
_INTERVAL_PATTERN = re.compile(
    r"^\d+ (second|minute|hour|day|week|month|year)s?$", re.IGNORECASE
)


def datetime_recent(column: str, interval: str) -> str:
    """Return a WHERE clause fragment for recent records.

    Args:
        column: Column name - must be in the allowed whitelist.
        interval: Interval string (e.g. '1 day', '24 hours').

    Returns:
        SQL fragment like ``created_at > datetime('now', '-1 day')`` for SQLite
        or ``created_at > NOW() - INTERVAL '1 day'`` for PostgreSQL.

    Raises:
        ValueError: If column or interval fails validation.
    """
    if column not in _ALLOWED_DATETIME_COLUMNS:
        raise ValueError(
            f"Column '{column}' not in allowed list: "
            f"{sorted(_ALLOWED_DATETIME_COLUMNS)}"
        )
    if not _INTERVAL_PATTERN.match(interval):
        raise ValueError(
            f"Invalid interval format: '{interval}'. "
            "Expected '<number> <unit>' (e.g. '1 day', '24 hours')"
        )
    if is_postgres():
        return f"{column} > NOW() - INTERVAL '{interval}'"
    # SQLite: convert '1 day' -> '-1 day'
    return f"{column} > datetime('now', '-{interval}')"
