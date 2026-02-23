"""
Centralized Database Manager
=============================
Encapsulates connection handling for both SQLite and PostgreSQL backends.
Provides context-managed connections with automatic commit/rollback.

Usage::

    from database.manager import get_database_manager

    db = get_database_manager()

    # Context-managed (auto commit/rollback):
    with db.connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1")

    # As a FastAPI generator dependency:
    def get_db():
        yield from db.get_connection_dependency()
"""

from __future__ import annotations

import asyncio
import logging
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from functools import lru_cache
from typing import Any, Generator, Optional

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Centralized database connection factory.

    Supports both SQLite and PostgreSQL backends. For PostgreSQL, uses the
    connection pool when available, falling back to direct connections.

    Parameters
    ----------
    backend : str
        Either "sqlite" or "postgres".
    sqlite_path : str or None
        Path to SQLite database file (required when backend is "sqlite").
    pg_settings : object or None
        DatabaseSettings-like object with pg_host, pg_port, pg_database,
        pg_user, pg_password attributes (required when backend is "postgres").
    """

    def __init__(
        self,
        backend: str = "sqlite",
        sqlite_path: Optional[str] = None,
        pg_settings: Optional[Any] = None,
    ):
        self._backend = backend
        self._sqlite_path = sqlite_path
        self._pg_settings = pg_settings

    @property
    def backend(self) -> str:
        return self._backend

    def _get_raw_connection(self):
        """Return a raw database connection (caller must manage lifecycle)."""
        if self._backend == "sqlite":
            if not self._sqlite_path:
                raise RuntimeError("SQLite path not configured")
            conn = sqlite3.connect(self._sqlite_path)
            conn.row_factory = sqlite3.Row
            return conn

        # PostgreSQL: prefer pool, fall back to direct connection
        try:
            from database.pool import get_pool_connection, is_pool_initialized

            if is_pool_initialized():
                return get_pool_connection()
        except ImportError:
            # optional dependency: pool module unavailable, fall back to direct connection
            pass

        import psycopg2

        if not self._pg_settings:
            raise RuntimeError("PostgreSQL settings not configured")

        return psycopg2.connect(
            host=self._pg_settings.pg_host,
            port=self._pg_settings.pg_port,
            dbname=self._pg_settings.pg_database,
            user=self._pg_settings.pg_user,
            password=self._pg_settings.pg_password,
        )

    @contextmanager
    def connection(self):
        """Context manager that yields a connection.

        Commits on clean exit, rolls back on exception, and always closes
        the connection (returning it to pool if applicable).

        Usage::

            with db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT 1")
        """
        conn = self._get_raw_connection()
        try:
            yield conn
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception as rollback_exc:
                logger.debug(
                    "rollback failed during exception handling: %s", rollback_exc
                )
            raise
        finally:
            conn.close()

    @asynccontextmanager
    async def aconnection(self):
        """Async context manager that runs the sync connection in a thread.

        Usage::

            async with db_manager.aconnection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT 1")
        """
        conn = await asyncio.to_thread(self._get_raw_connection)
        try:
            yield conn
            await asyncio.to_thread(conn.commit)
        except Exception:
            try:
                await asyncio.to_thread(conn.rollback)
            except Exception as rollback_exc:
                logger.debug(
                    "async rollback failed during exception handling: %s", rollback_exc
                )
            raise
        finally:
            await asyncio.to_thread(conn.close)

    def get_connection_dependency(self) -> Generator:
        """FastAPI-compatible generator dependency.

        Yields a connection and ensures cleanup on exit. Unlike
        ``connection()``, this does NOT auto-commit -- callers that need
        to write should commit explicitly. Read-only queries need no action.

        Usage::

            @router.get("/items")
            def list_items(conn=Depends(db_manager.get_connection_dependency)):
                ...
        """
        conn = self._get_raw_connection()
        try:
            yield conn
        finally:
            conn.close()


@lru_cache(maxsize=1)
def get_database_manager() -> DatabaseManager:
    """Return a cached singleton DatabaseManager configured from app settings.

    Falls back gracefully if config module is unavailable (e.g., in tests).
    """
    try:
        from config import get_settings

        settings = get_settings()
        return DatabaseManager(
            backend=settings.db.backend,
            sqlite_path=str(settings.db.resolved_sqlite_path),
            pg_settings=settings.db if settings.db.backend == "postgres" else None,
        )
    except Exception as exc:
        logger.warning(
            "Could not load settings for DatabaseManager, "
            "returning unconfigured instance: %s",
            exc,
        )
        return DatabaseManager()
