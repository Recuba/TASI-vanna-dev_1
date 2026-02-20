"""
PostgreSQL utility helpers shared across the codebase.

These helpers are intentionally lightweight and import-safe:
they only import psycopg2 inside functions so the module can be
imported even when psycopg2 is not installed (SQLite-only installs).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def pg_available(timeout: int = 3) -> bool:
    """Return True if PostgreSQL is reachable via current env vars.

    Checks POSTGRES_HOST first; returns False immediately if unset.
    Attempts a real connection with *timeout* seconds connect_timeout.
    Logs a debug message on failure to avoid noisy test output.
    """
    if not os.environ.get("POSTGRES_HOST"):
        return False
    try:
        import psycopg2

        conn = psycopg2.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
            user=os.environ.get("POSTGRES_USER", "tasi_user"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
            connect_timeout=timeout,
        )
        conn.close()
        return True
    except Exception as exc:
        logger.debug("PostgreSQL not available: %s", exc)
        return False


def pg_connection_params() -> dict:
    """Return a dict of psycopg2 connection parameters from environment.

    Useful for building connection strings without repeating env-var logic.
    Does NOT include connect_timeout; callers add as needed.

    Example::

        import psycopg2
        from database.postgres_utils import pg_connection_params
        conn = psycopg2.connect(**pg_connection_params(), connect_timeout=5)
    """
    try:
        port = int(os.environ.get("POSTGRES_PORT", "5432"))
    except (ValueError, TypeError):
        logger.warning("Invalid POSTGRES_PORT value; defaulting to 5432")
        port = 5432
    return {
        "host": os.environ.get("POSTGRES_HOST", "localhost"),
        "port": port,
        "dbname": os.environ.get("POSTGRES_DB", "tasi_platform"),
        "user": os.environ.get("POSTGRES_USER", "tasi_user"),
        "password": os.environ.get("POSTGRES_PASSWORD", ""),
    }
