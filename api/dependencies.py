"""
Shared FastAPI dependencies for the TASI AI platform API.

Provides database connection factory and service instances
for dependency injection into route handlers.

Connections are managed through ``DatabaseManager`` which handles pool
integration, backend selection (SQLite/PostgreSQL), and configuration.

For PostgreSQL deployments, ``init_pg_pool()`` must be called at application
startup (from the FastAPI lifespan handler) before any requests are served.
All subsequent calls to ``get_db_connection()`` will draw from that pool.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Generator

from database.manager import get_database_manager
from services.news_service import NewsAggregationService
from services.reports_service import TechnicalReportsService
from services.announcement_service import AnnouncementService
from services.user_service import UserService
from services.audit_service import AuditService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PostgreSQL connection pool bootstrap
# ---------------------------------------------------------------------------


def init_pg_pool(dsn: str, minconn: int = 2, maxconn: int = 10) -> None:
    """Initialize the module-level PostgreSQL connection pool.

    Delegates to ``database.pool.init_pool`` which manages the singleton
    ``ThreadedConnectionPool``.  This wrapper exists so that application
    startup code (``app.py`` lifespan) has a single, stable import path in
    ``api.dependencies`` regardless of where the pool implementation lives.

    Must be called once during application startup before any request is
    handled.  Subsequent calls are no-ops (pool already initialized).

    Parameters
    ----------
    dsn:
        Full PostgreSQL connection string, e.g.
        ``postgresql://user:pass@host:5432/dbname``.
    minconn:
        Minimum number of connections to keep open (default 2).
    maxconn:
        Maximum number of connections allowed (default 10).
    """
    from database.pool import is_pool_initialized

    if is_pool_initialized():
        logger.debug("PostgreSQL connection pool already initialized -- skipping")
        return

    # database.pool.init_pool accepts a db_settings object; we pass a thin
    # namespace built from the DSN so callers only need the connection string.
    from psycopg2.pool import ThreadedConnectionPool as _TCP

    # Parse DSN into keyword args understood by psycopg2
    try:
        import urllib.parse as _urlparse

        parsed = _urlparse.urlparse(dsn)
        _pool_kwargs = dict(
            host=parsed.hostname,
            port=parsed.port or 5432,
            dbname=parsed.path.lstrip("/"),
            user=parsed.username,
            password=parsed.password,
        )
    except Exception as exc:
        logger.error("Failed to parse PostgreSQL DSN: %s", exc)
        raise

    from database import pool as _pool_module

    if _pool_module._pool is not None:
        logger.debug("PostgreSQL connection pool already initialized -- skipping")
        return

    _pool_module._pool = _TCP(minconn, maxconn, **_pool_kwargs)
    logger.info(
        "PostgreSQL connection pool initialized (min=%d, max=%d)", minconn, maxconn
    )


# ---------------------------------------------------------------------------
# Connection factory
# ---------------------------------------------------------------------------


def get_db_connection():
    """Get a database connection via the centralized DatabaseManager.

    For PostgreSQL backends the connection is drawn from the pool initialized
    by ``init_pg_pool()``.  If the pool has not been initialized a
    ``RuntimeError`` is raised so the misconfiguration is surfaced immediately
    rather than silently opening unbounded direct connections.

    Returns a raw connection. The caller is responsible for closing it
    (typically in a try/finally block). For pool-backed connections,
    ``close()`` returns the connection to the pool with an automatic rollback
    of uncommitted work.

    This function is used both as a direct call in route handlers and as
    a callable passed to services (get_conn=get_db_connection).
    """
    import os

    if os.environ.get("DB_BACKEND", "sqlite") == "postgres":
        from database.pool import get_pool_connection, is_pool_initialized

        if not is_pool_initialized():
            raise RuntimeError(
                "PostgreSQL connection pool is not initialized. "
                "Call init_pg_pool() during application startup."
            )
        return get_pool_connection()

    db = get_database_manager()
    return db._get_raw_connection()


def get_db_connection_dep() -> Generator:
    """FastAPI generator dependency that auto-closes connections.

    Use with ``Depends(get_db_connection_dep)`` for route handlers that
    need a connection with guaranteed cleanup::

        @router.get("/items")
        async def list_items(conn=Depends(get_db_connection_dep)):
            cur = conn.cursor()
            ...
    """
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Service singletons (each holds a reference to get_db_connection)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_news_service() -> NewsAggregationService:
    return NewsAggregationService(get_conn=get_db_connection)


@lru_cache(maxsize=1)
def get_reports_service() -> TechnicalReportsService:
    return TechnicalReportsService(get_conn=get_db_connection)


@lru_cache(maxsize=1)
def get_announcement_service() -> AnnouncementService:
    return AnnouncementService(get_conn=get_db_connection)


@lru_cache(maxsize=1)
def get_user_service() -> UserService:
    return UserService(get_conn=get_db_connection)


@lru_cache(maxsize=1)
def get_audit_service() -> AuditService:
    return AuditService(get_conn=get_db_connection)
