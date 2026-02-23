"""
Dual-backend database helper.

Provides a unified interface for SQLite and PostgreSQL backends.
Route modules use this instead of importing sqlite3 directly, so they
work on both local dev (SQLite) and Railway/Docker (PostgreSQL).

SQL queries should use ``?`` for positional parameters (SQLite style).
When running against PostgreSQL the helper automatically converts ``?``
to ``%s`` before execution.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------

_DB_BACKEND = os.environ.get("DB_BACKEND", "sqlite")
_HERE = Path(__file__).resolve().parent.parent
_SQLITE_PATH = os.environ.get("DB_SQLITE_PATH", str(_HERE / "saudi_stocks.db"))

# Matches single-quoted strings, double-quoted strings, or bare ? placeholders.
# Used by _convert_sql() to skip ? inside string literals.
_PLACEHOLDER_RE = re.compile(r"'[^']*'|\"[^\"]*\"|\?")


def is_postgres() -> bool:
    """Return True when running against PostgreSQL."""
    return _DB_BACKEND == "postgres"


# ---------------------------------------------------------------------------
# Connection factory
# ---------------------------------------------------------------------------


def get_conn():
    """Return a database connection for the active backend.

    * **SQLite**: opens ``saudi_stocks.db`` with ``sqlite3.Row`` factory.
    * **PostgreSQL**: delegates to ``api.dependencies.get_db_connection()``,
      which uses the connection pool managed by ``database.manager``.

    The caller **must** close the connection in a ``finally`` block.
    """
    if is_postgres():
        from api.dependencies import get_db_connection

        return get_db_connection()

    if not Path(_SQLITE_PATH).exists():
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail=f"SQLite database not found at {_SQLITE_PATH}. "
            "Run csv_to_sqlite.py to generate it.",
        )
    conn = sqlite3.connect(_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------


def _convert_sql(sql: str) -> str:
    """Convert ``?`` positional placeholders to ``%s`` for PostgreSQL.

    Skips ``?`` characters inside quoted string literals to avoid
    corrupting LIKE patterns and other literal strings.
    """
    if is_postgres():

        def _replace(m: re.Match) -> str:
            return "%s" if m.group(0) == "?" else m.group(0)

        return _PLACEHOLDER_RE.sub(_replace, sql)
    return sql


Params = Union[Tuple, List, Dict[str, Any], None]


def fetchall(conn: Any, sql: str, params: Params = None) -> List[Dict[str, Any]]:
    """Execute *sql* and return every row as a ``dict``.

    Works transparently with both SQLite and PostgreSQL connections.
    """
    converted = _convert_sql(sql)

    if is_postgres():
        import psycopg2.extras

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(converted, params or ())
            return [dict(r) for r in cur.fetchall()]

    rows = conn.execute(sql, params or ()).fetchall()
    return [dict(r) for r in rows]


def fetchone(conn: Any, sql: str, params: Params = None) -> Optional[Dict[str, Any]]:
    """Execute *sql* and return the first row as a ``dict``, or ``None``."""
    converted = _convert_sql(sql)

    if is_postgres():
        import psycopg2.extras

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(converted, params or ())
            row = cur.fetchone()
            return dict(row) if row else None

    row = conn.execute(sql, params or ()).fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Async wrappers (run sync DB I/O in a thread)
# ---------------------------------------------------------------------------


def _sync_fetchall(sql: str, params: Params = None) -> List[Dict[str, Any]]:
    """Open a connection, run fetchall, close. Designed for asyncio.to_thread."""
    if is_postgres():
        conn = get_conn()
        try:
            return fetchall(conn, sql, params)
        finally:
            conn.close()
    else:
        from services.sqlite_pool import get_pool

        with get_pool().connection() as conn:
            return fetchall(conn, sql, params)


def _sync_fetchone(sql: str, params: Params = None) -> Optional[Dict[str, Any]]:
    """Open a connection, run fetchone, close. Designed for asyncio.to_thread."""
    if is_postgres():
        conn = get_conn()
        try:
            return fetchone(conn, sql, params)
        finally:
            conn.close()
    else:
        from services.sqlite_pool import get_pool

        with get_pool().connection() as conn:
            return fetchone(conn, sql, params)


async def afetchall(sql: str, params: Params = None) -> List[Dict[str, Any]]:
    """Async wrapper: run a fetchall query in a background thread."""
    return await asyncio.to_thread(_sync_fetchall, sql, params)


async def afetchone(sql: str, params: Params = None) -> Optional[Dict[str, Any]]:
    """Async wrapper: run a fetchone query in a background thread."""
    return await asyncio.to_thread(_sync_fetchone, sql, params)
