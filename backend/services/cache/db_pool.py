"""Async database connection pool manager using SQLAlchemy.

Wraps SQLAlchemy's async engine and session factory to provide connection
pool statistics, health checks, and graceful lifecycle management.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

from backend.services.cache.models import PoolConfig, PoolStats

logger = logging.getLogger(__name__)


class DatabasePoolManager:
    """Manages an async SQLAlchemy engine with pool monitoring.

    Args:
        config: Pool configuration (URL, sizes, timeouts).
    """

    def __init__(self, config: PoolConfig | None = None) -> None:
        self._config = config or PoolConfig()
        self._engine: AsyncEngine | None = None
        self._session_factory: sessionmaker | None = None

    @property
    def engine(self) -> AsyncEngine | None:
        """The underlying async engine, or None if not connected."""
        return self._engine

    async def connect(self) -> None:
        """Create the async engine and session factory."""
        if self._engine is not None:
            return

        cfg = self._config
        self._engine = create_async_engine(
            cfg.url,
            pool_size=cfg.pool_size,
            max_overflow=cfg.max_overflow,
            pool_timeout=cfg.pool_timeout,
            pool_recycle=cfg.pool_recycle,
            pool_pre_ping=True,
            echo=cfg.echo,
        )
        self._session_factory = sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        logger.info(
            "DB pool created: url=%s pool_size=%d max_overflow=%d",
            cfg.url,
            cfg.pool_size,
            cfg.max_overflow,
        )

    async def disconnect(self) -> None:
        """Dispose of the engine and release all pooled connections."""
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
            self._session_factory = None
            logger.info("DB pool disposed")

    def get_session(self) -> AsyncSession:
        """Return a new async session from the pool.

        Raises:
            RuntimeError: If connect() has not been called.
        """
        if self._session_factory is None:
            raise RuntimeError(
                "DatabasePoolManager.connect() must be called before get_session()"
            )
        return self._session_factory()

    def pool_stats(self) -> PoolStats:
        """Return a snapshot of pool utilization metrics.

        Returns an empty PoolStats if the engine is not initialized or if
        the underlying pool does not support status reporting (e.g. NullPool
        or StaticPool used by aiosqlite).
        """
        if self._engine is None:
            return PoolStats()

        pool = self._engine.pool
        if not isinstance(pool, QueuePool):
            return PoolStats(pool_size=self._config.pool_size)

        return PoolStats(
            pool_size=pool.size(),
            checked_out=pool.checkedout(),
            overflow=pool.overflow(),
            checked_in=pool.checkedin(),
        )

    async def health_check(self) -> dict[str, Any]:
        """Run a lightweight connectivity check against the database.

        Returns:
            Dict with ``status``, ``latency_ms``, and pool stats.
        """
        start = time.monotonic()
        try:
            if self._engine is None:
                raise RuntimeError("Engine not initialized")

            async with self._engine.connect() as conn:
                await conn.execute(text("SELECT 1"))

            latency_ms = round((time.monotonic() - start) * 1000, 2)
            stats = self.pool_stats()
            return {
                "status": "healthy",
                "latency_ms": latency_ms,
                "pool": stats.model_dump(),
            }
        except Exception as exc:
            latency_ms = round((time.monotonic() - start) * 1000, 2)
            return {
                "status": "unhealthy",
                "latency_ms": latency_ms,
                "error": str(exc),
            }
