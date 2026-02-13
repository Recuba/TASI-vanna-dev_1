"""Query-level cache built on top of RedisManager.

Provides SHA-256 keyed caching with tiered TTLs (market / historical /
schema) and msgpack serialization for compact Redis storage.
"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Any

import msgpack

from backend.services.cache.models import CachedResult, TTLTier
from backend.services.cache.redis_client import RedisManager

logger = logging.getLogger(__name__)

_KEY_PREFIX = "raid:qcache:"


def _normalize_sql(sql: str) -> str:
    """Collapse whitespace and lowercase for consistent hashing."""
    return " ".join(sql.split()).strip().lower()


def _make_key(sql: str) -> str:
    """Return the Redis key for a given SQL query."""
    digest = hashlib.sha256(_normalize_sql(sql).encode("utf-8")).hexdigest()
    return f"{_KEY_PREFIX}{digest}"


def classify_tier(sql: str) -> TTLTier:
    """Heuristically classify a SQL query into a TTL tier.

    Rules (applied against the lowercased, whitespace-normalized SQL):
    - Contains ``information_schema``, ``sqlite_master``, ``pg_catalog``,
      or looks like a ``DESCRIBE``/``SHOW`` statement -> SCHEMA.
    - Contains date-range predicates (``period_type``, ``period_index``,
      ``WHERE.*date``) or targets ``balance_sheet``, ``income_statement``,
      ``cash_flow`` -> HISTORICAL.
    - Everything else (``market_data``, ``companies``, etc.) -> MARKET.
    """
    norm = _normalize_sql(sql)

    # Schema / metadata queries
    schema_indicators = (
        "information_schema",
        "sqlite_master",
        "pg_catalog",
        "describe ",
        "show tables",
        "show columns",
    )
    if any(ind in norm for ind in schema_indicators):
        return TTLTier.SCHEMA

    # Historical / financial-statement queries
    historical_indicators = (
        "balance_sheet",
        "income_statement",
        "cash_flow",
        "period_type",
        "period_index",
        "financial_summary",
    )
    if any(ind in norm for ind in historical_indicators):
        return TTLTier.HISTORICAL

    # Default: live market data
    return TTLTier.MARKET


class QueryCache:
    """Tiered query cache backed by Redis + msgpack.

    Args:
        redis: An initialized RedisManager instance.
        enabled: Master switch; when False all operations are no-ops.
    """

    def __init__(self, redis: RedisManager, *, enabled: bool = True) -> None:
        self._redis = redis
        self._enabled = enabled
        self._hits = 0
        self._misses = 0

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def hit_count(self) -> int:
        return self._hits

    @property
    def miss_count(self) -> int:
        return self._misses

    @property
    def hit_rate(self) -> float:
        total = self._hits + self._misses
        return self._hits / total if total > 0 else 0.0

    async def get(self, sql: str) -> list[dict[str, Any]] | None:
        """Look up a cached result for *sql*.

        Returns:
            The cached row list, or ``None`` on a miss.
        """
        if not self._enabled:
            return None

        key = _make_key(sql)
        try:
            raw = await self._redis.get(key)
        except Exception:
            logger.warning("Cache read error for key=%s", key, exc_info=True)
            self._misses += 1
            return None

        if raw is None:
            self._misses += 1
            return None

        try:
            envelope: dict[str, Any] = msgpack.unpackb(raw, raw=False)
            self._hits += 1
            logger.debug("Cache HIT key=%s tier=%s", key, envelope.get("tier"))
            return envelope.get("data")
        except Exception:
            logger.warning("Cache deserialize error for key=%s", key, exc_info=True)
            self._misses += 1
            return None

    async def set(
        self,
        sql: str,
        data: list[dict[str, Any]],
        tier: TTLTier | None = None,
    ) -> bool:
        """Store a query result in the cache.

        Args:
            sql: The SQL query.
            data: The result rows.
            tier: Explicit TTL tier. If None, auto-classified from *sql*.

        Returns:
            True if the value was stored.
        """
        if not self._enabled:
            return False

        if tier is None:
            tier = classify_tier(sql)

        key = _make_key(sql)
        ttl = tier.ttl_seconds

        envelope = CachedResult(
            query_hash=key.removeprefix(_KEY_PREFIX),
            sql=sql,
            data=data,
            tier=tier,
            ttl=ttl,
            row_count=len(data),
        )

        try:
            packed = msgpack.packb(
                envelope.model_dump(mode="json"),
                use_bin_type=True,
            )
            await self._redis.set(key, packed, ttl=ttl)
            logger.debug(
                "Cache SET key=%s tier=%s ttl=%ds rows=%d bytes=%d",
                key, tier.value, ttl, len(data), len(packed),
            )
            return True
        except Exception:
            logger.warning("Cache write error for key=%s", key, exc_info=True)
            return False

    async def invalidate(self, sql: str) -> bool:
        """Remove a specific query from the cache.

        Returns:
            True if the key existed and was deleted.
        """
        if not self._enabled:
            return False

        key = _make_key(sql)
        try:
            deleted = await self._redis.delete(key)
            return deleted > 0
        except Exception:
            logger.warning("Cache invalidate error for key=%s", key, exc_info=True)
            return False

    def stats(self) -> dict[str, Any]:
        """Return in-process cache statistics."""
        return {
            "enabled": self._enabled,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self.hit_rate, 4),
        }
