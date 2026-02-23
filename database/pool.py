"""
PostgreSQL Connection Pool
==========================
Singleton connection pool using psycopg2's ThreadedConnectionPool.
Lazy-initialized via ``init_pool()`` -- never imports or connects at module level.

Important: FastAPI async handlers share a single event-loop thread, so the
default ThreadedConnectionPool key (thread ID) would cause all concurrent
requests to share one connection.  We use unique keys per checkout to avoid
this.

Usage::

    from database.pool import init_pool, get_connection, close_pool

    # At startup
    init_pool(settings.db)

    # In service code
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1")

    # At shutdown
    close_pool()
"""

from __future__ import annotations

import logging
import uuid
from contextlib import contextmanager
from typing import Optional

import psycopg2
from psycopg2.pool import ThreadedConnectionPool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singleton (lazy -- None until init_pool is called)
# ---------------------------------------------------------------------------
_pool: Optional[ThreadedConnectionPool] = None


def init_pool(
    db_settings,
    min_connections: int = 2,
    max_connections: int = 10,
) -> None:
    """Initialize the global connection pool.

    Parameters
    ----------
    db_settings : DatabaseSettings
        Must expose ``pg_host``, ``pg_port``, ``pg_database``, ``pg_user``,
        ``pg_password``.
    min_connections : int
        Minimum connections kept open (default 2).
    max_connections : int
        Maximum connections allowed (default 10).
    """
    global _pool

    if _pool is not None:
        logger.warning("Connection pool already initialized -- skipping")
        return

    try:
        _pool = ThreadedConnectionPool(
            minconn=min_connections,
            maxconn=max_connections,
            host=db_settings.pg_host,
            port=db_settings.pg_port,
            dbname=db_settings.pg_database,
            user=db_settings.pg_user,
            password=db_settings.pg_password,
        )
        logger.info(
            "PostgreSQL connection pool initialized (min=%d, max=%d)",
            min_connections,
            max_connections,
        )
    except psycopg2.Error as exc:
        logger.error("Failed to initialize connection pool: %s", exc)
        _pool = None
        raise


def _unique_key() -> str:
    """Generate a unique key for each pool checkout.

    ThreadedConnectionPool uses thread ID as the default key, which causes
    all async handlers (sharing one event-loop thread) to receive the same
    connection.  A UUID key ensures every checkout gets its own connection.
    """
    return uuid.uuid4().hex


@contextmanager
def get_connection():
    """Context manager that checks out a connection and returns it on exit.

    Commits on clean exit, rolls back on exception, and always returns the
    connection to the pool.

    Raises ``RuntimeError`` if the pool has not been initialized.
    """
    if _pool is None:
        raise RuntimeError(
            "Connection pool is not initialized. Call init_pool() first."
        )

    key = _unique_key()
    conn = _pool.getconn(key=key)
    try:
        yield conn
        conn.commit()
    except Exception:  # noqa: BLE001 — re-raises after rollback
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn, key=key)


class _PooledConnection:
    """Thin wrapper around a psycopg2 connection that returns it to the pool
    on ``close()`` instead of destroying it.

    psycopg2 connections are C extension objects whose ``close`` attribute
    is read-only, so we cannot monkey-patch it.  Instead we delegate all
    attribute access to the underlying connection while overriding ``close``.
    """

    __slots__ = ("_conn", "_pool", "_key")

    def __init__(self, conn, pool, key: str):
        object.__setattr__(self, "_conn", conn)
        object.__setattr__(self, "_pool", pool)
        object.__setattr__(self, "_key", key)

    def close(self):
        conn = object.__getattribute__(self, "_conn")
        pool = object.__getattribute__(self, "_pool")
        key = object.__getattribute__(self, "_key")
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001 — connection teardown, errors are non-fatal
            pass
        try:
            pool.putconn(conn, key=key)
        except Exception:  # noqa: BLE001 — pool return failed, fall back to hard close
            try:
                conn.close()
            except Exception:  # noqa: BLE001 — connection may already be dead
                pass

    def cursor(self, *args, **kwargs):
        return object.__getattribute__(self, "_conn").cursor(*args, **kwargs)

    def commit(self):
        return object.__getattribute__(self, "_conn").commit()

    def rollback(self):
        return object.__getattribute__(self, "_conn").rollback()

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_conn"), name)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def get_pool_connection():
    """Return a wrapped connection from the pool.

    The caller should call ``conn.close()`` when done -- this returns the
    connection to the pool instead of destroying it.

    Prefer :func:`get_connection` (context manager) instead when possible.

    This function exists so services that use the ``get_conn`` callable pattern
    can be wired to the pool: ``Service(get_conn=get_pool_connection)``.
    """
    if _pool is None:
        raise RuntimeError(
            "Connection pool is not initialized. Call init_pool() first."
        )
    key = _unique_key()
    conn = _pool.getconn(key=key)
    return _PooledConnection(conn, _pool, key)


def close_pool() -> None:
    """Close all connections in the pool. Safe to call even if not initialized."""
    global _pool
    if _pool is not None:
        try:
            _pool.closeall()
            logger.info("PostgreSQL connection pool closed")
        except Exception as exc:
            logger.error("Error closing connection pool: %s", exc)
        finally:
            _pool = None


def is_pool_initialized() -> bool:
    """Return True if the connection pool has been initialized."""
    return _pool is not None
