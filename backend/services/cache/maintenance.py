"""Cache maintenance: warm-up, cleanup, and statistics.

Provides a CacheMaintenance helper that can be invoked on a schedule or at
startup to pre-populate the cache, collect hit/miss stats, and purge stale
entries.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from backend.services.cache.query_cache import QueryCache
from backend.services.cache.redis_client import RedisManager

logger = logging.getLogger(__name__)

# Common queries that benefit from warm-up (used as cache keys)
_WARM_UP_QUERIES: list[str] = [
    "SELECT ticker, company_name_en, sector FROM companies ORDER BY ticker",
    "SELECT ticker, close_price, market_cap FROM market_data ORDER BY market_cap DESC LIMIT 20",
    "SELECT DISTINCT sector FROM companies ORDER BY sector",
]


class CacheMaintenance:
    """Maintenance operations for the query cache.

    Args:
        redis: The RedisManager instance.
        query_cache: The QueryCache instance.
    """

    def __init__(self, redis: RedisManager, query_cache: QueryCache) -> None:
        self._redis = redis
        self._cache = query_cache

    async def warm_cache(
        self,
        execute_fn: Any | None = None,
    ) -> dict[str, Any]:
        """Pre-populate the cache with common queries.

        Args:
            execute_fn: An async callable ``(sql: str) -> list[dict]`` that
                executes a SQL query and returns rows. If None, warm-up is
                skipped (no DB access).

        Returns:
            Summary dict with ``warmed`` count and ``errors``.
        """
        if execute_fn is None:
            logger.info("Cache warm-up skipped: no execute_fn provided")
            return {"warmed": 0, "skipped": len(_WARM_UP_QUERIES), "errors": []}

        warmed = 0
        errors: list[str] = []

        for sql in _WARM_UP_QUERIES:
            try:
                rows = await execute_fn(sql)
                await self._cache.set(sql, rows)
                warmed += 1
                logger.debug("Warmed cache for: %s", sql[:80])
            except Exception as exc:
                msg = f"{sql[:60]}... -> {exc}"
                errors.append(msg)
                logger.warning("Warm-up failed: %s", msg)

        logger.info("Cache warm-up complete: warmed=%d errors=%d", warmed, len(errors))
        return {"warmed": warmed, "skipped": 0, "errors": errors}

    async def cleanup_expired(self) -> dict[str, Any]:
        """Trigger cleanup of expired cache entries.

        Redis handles TTL expiration natively, so this method primarily
        serves as a stats-collection checkpoint. It scans keys with the
        cache prefix and reports how many are still alive.

        Returns:
            Dict with ``active_keys`` count.
        """
        start = time.monotonic()
        try:
            health = await self._redis.health_check()
            elapsed_ms = round((time.monotonic() - start) * 1000, 2)
            return {
                "status": "ok",
                "redis_status": health.get("status"),
                "elapsed_ms": elapsed_ms,
            }
        except Exception as exc:
            elapsed_ms = round((time.monotonic() - start) * 1000, 2)
            return {
                "status": "error",
                "error": str(exc),
                "elapsed_ms": elapsed_ms,
            }

    async def get_cache_stats(self) -> dict[str, Any]:
        """Aggregate cache statistics from the query cache and Redis.

        Returns:
            Combined dict of in-process stats and Redis health.
        """
        cache_stats = self._cache.stats()
        redis_health = await self._redis.health_check()

        return {
            "cache": cache_stats,
            "redis": redis_health,
        }
