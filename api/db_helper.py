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

import logging
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------

_DB_BACKEND = os.environ.get("DB_BACKEND", "sqlite")
_HERE = Path(__file__).resolve().parent.parent
_SQLITE_PATH = str(_HERE / "saudi_stocks.db")


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
    """Convert ``?`` positional placeholders to ``%s`` for PostgreSQL."""
    if is_postgres():
        return sql.replace("?", "%s")
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
