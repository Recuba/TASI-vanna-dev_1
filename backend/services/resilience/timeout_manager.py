"""
Query timeout manager for database operations.

Provides deadline-enforced query execution with:
- Configurable timeouts per query type
- Slow query logging with duration and SQL preview
- PostgreSQL backend cancellation via pg_cancel_backend
"""

import asyncio
import logging
import time
from typing import Any, Callable, Optional, TypeVar

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

T = TypeVar("T")


class QueryTimeoutConfig(BaseModel):
    """Configuration for the query timeout manager."""

    default_timeout: float = Field(
        default=30.0, description="Default query timeout in seconds"
    )
    slow_query_threshold: float = Field(
        default=5.0, description="Log queries slower than this (seconds)"
    )
    max_timeout: float = Field(
        default=120.0, description="Absolute maximum timeout allowed"
    )
    cancel_on_timeout: bool = Field(
        default=True,
        description="Attempt pg_cancel_backend for PG queries that exceed timeout",
    )


class QueryTimeoutManager:
    """Manages query execution with timeouts and slow-query logging.

    For async query functions, wraps execution in ``asyncio.wait_for``.
    For synchronous queries, runs them in a thread executor with a deadline.

    When a PostgreSQL query exceeds the timeout and ``cancel_on_timeout`` is
    enabled, attempts to cancel the backend process via ``pg_cancel_backend``.

    Args:
        config: Timeout configuration. Uses defaults if not provided.
    """

    def __init__(self, config: Optional[QueryTimeoutConfig] = None) -> None:
        self._config = config or QueryTimeoutConfig()
        self._slow_query_count = 0
        self._timeout_count = 0
        self._total_queries = 0

        logger.info(
            "QueryTimeoutManager initialized: default_timeout=%.1fs, "
            "slow_threshold=%.1fs, max_timeout=%.1fs",
            self._config.default_timeout,
            self._config.slow_query_threshold,
            self._config.max_timeout,
        )

    @property
    def slow_query_count(self) -> int:
        """Number of queries that exceeded the slow query threshold."""
        return self._slow_query_count

    @property
    def timeout_count(self) -> int:
        """Number of queries that timed out."""
        return self._timeout_count

    @property
    def total_queries(self) -> int:
        """Total number of queries executed through this manager."""
        return self._total_queries

    async def execute_with_timeout(
        self,
        func: Callable[..., Any],
        *args: Any,
        timeout: Optional[float] = None,
        query_label: str = "unnamed",
        pg_pid: Optional[int] = None,
        **kwargs: Any,
    ) -> Any:
        """Execute a query function with a timeout deadline.

        Args:
            func: Async or sync callable to execute.
            *args: Positional arguments for *func*.
            timeout: Override timeout in seconds. Clamped to ``max_timeout``.
            query_label: Label for logging (e.g., SQL preview or query name).
            pg_pid: PostgreSQL backend PID for cancellation on timeout.
            **kwargs: Keyword arguments for *func*.

        Returns:
            The return value of *func*.

        Raises:
            asyncio.TimeoutError: If the query exceeds the timeout.
        """
        effective_timeout = min(
            timeout or self._config.default_timeout,
            self._config.max_timeout,
        )

        self._total_queries += 1
        start = time.monotonic()

        try:
            if asyncio.iscoroutinefunction(func):
                result = await asyncio.wait_for(
                    func(*args, **kwargs),
                    timeout=effective_timeout,
                )
            else:
                loop = asyncio.get_running_loop()
                result = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: func(*args, **kwargs)),
                    timeout=effective_timeout,
                )

            elapsed = time.monotonic() - start
            self._log_if_slow(query_label, elapsed)
            return result

        except asyncio.TimeoutError:
            elapsed = time.monotonic() - start
            self._timeout_count += 1

            logger.error(
                "Query timed out after %.2fs (limit=%.1fs): %s",
                elapsed,
                effective_timeout,
                query_label[:200],
            )

            if pg_pid is not None and self._config.cancel_on_timeout:
                await self._cancel_pg_backend(pg_pid, query_label)

            raise

    async def _cancel_pg_backend(self, pid: int, query_label: str) -> None:
        """Attempt to cancel a PostgreSQL backend process.

        Issues ``SELECT pg_cancel_backend(pid)`` to gracefully cancel a
        long-running query. Requires a superuser or the same role as the
        backend process.

        This is a best-effort operation; failures are logged but not raised.
        """
        try:
            from config import get_settings

            settings = get_settings()
            if settings.db.backend != "postgres":
                return

            import psycopg2

            conn = psycopg2.connect(
                host=settings.db.pg_host,
                port=settings.db.pg_port,
                dbname=settings.db.pg_database,
                user=settings.db.pg_user,
                password=settings.db.pg_password,
                connect_timeout=5,
            )
            try:
                conn.autocommit = True
                cur = conn.cursor()
                cur.execute("SELECT pg_cancel_backend(%s)", (pid,))
                cancelled = cur.fetchone()
                cur.close()

                if cancelled and cancelled[0]:
                    logger.info(
                        "Cancelled PG backend pid=%d for query: %s",
                        pid,
                        query_label[:200],
                    )
                else:
                    logger.warning(
                        "pg_cancel_backend returned False for pid=%d (process may have already ended)",
                        pid,
                    )
            finally:
                conn.close()

        except Exception as exc:
            logger.warning(
                "Failed to cancel PG backend pid=%d: %s",
                pid,
                str(exc)[:200],
            )

    def _log_if_slow(self, query_label: str, elapsed: float) -> None:
        """Log a warning if the query exceeded the slow query threshold."""
        if elapsed >= self._config.slow_query_threshold:
            self._slow_query_count += 1
            logger.warning(
                "Slow query (%.2fs, threshold=%.1fs): %s",
                elapsed,
                self._config.slow_query_threshold,
                query_label[:200],
            )

    def get_stats(self) -> dict:
        """Return a summary of timeout manager statistics."""
        return {
            "total_queries": self._total_queries,
            "slow_queries": self._slow_query_count,
            "timed_out": self._timeout_count,
            "config": {
                "default_timeout": self._config.default_timeout,
                "slow_query_threshold": self._config.slow_query_threshold,
                "max_timeout": self._config.max_timeout,
                "cancel_on_timeout": self._config.cancel_on_timeout,
            },
        }
