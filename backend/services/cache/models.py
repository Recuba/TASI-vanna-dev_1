"""Pydantic models for the caching layer.

Defines the cached result envelope, TTL tier classification, and pool
statistics used throughout the cache subsystem.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TTLTier(str, Enum):
    """Cache TTL tiers mapped to query categories.

    Each tier defines a default TTL suitable for the data volatility of
    that category.
    """

    MARKET = "market"  # 60 s  - live/recent market data
    HISTORICAL = "historical"  # 3600 s - historical financials
    SCHEMA = "schema"  # 86400 s - schema/metadata lookups

    @property
    def ttl_seconds(self) -> int:
        """Return the default TTL for this tier in seconds."""
        return _TTL_MAP[self]


_TTL_MAP: dict[TTLTier, int] = {
    TTLTier.MARKET: 60,
    TTLTier.HISTORICAL: 3600,
    TTLTier.SCHEMA: 86400,
}


class CachedResult(BaseModel):
    """Envelope stored in Redis for a cached query result.

    Attributes:
        query_hash: SHA-256 hex digest of the normalized SQL.
        sql: The original SQL query string.
        data: The query result payload (list of row dicts).
        tier: The TTL tier that was applied.
        created_at: UTC timestamp of when the entry was cached.
        ttl: TTL in seconds that was set on the key.
        row_count: Number of rows in the result set.
        compressed: Whether the payload was gzip-compressed before storage.
    """

    query_hash: str
    sql: str
    data: Any  # list[dict[str, Any]] — kept as Any for msgpack compat
    tier: TTLTier
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ttl: int
    row_count: int = 0
    compressed: bool = False


class PoolStats(BaseModel):
    """Snapshot of database connection pool statistics.

    Attributes:
        pool_size: Configured maximum pool size.
        checked_out: Number of connections currently checked out.
        overflow: Number of overflow connections in use.
        checked_in: Number of idle connections in the pool.
    """

    pool_size: int = 0
    checked_out: int = 0
    overflow: int = 0
    checked_in: int = 0


class PoolConfig(BaseModel):
    """Configuration for the async database connection pool.

    Attributes:
        url: SQLAlchemy-style async database URL.
        pool_size: Number of persistent connections.
        max_overflow: Extra connections allowed beyond pool_size.
        pool_timeout: Seconds to wait for a connection before raising.
        pool_recycle: Seconds after which a connection is recycled.
        echo: Whether to log all SQL statements.
    """

    url: str = "sqlite+aiosqlite:///saudi_stocks.db"
    pool_size: int = 5
    max_overflow: int = 10
    pool_timeout: int = 30
    pool_recycle: int = 1800
    echo: bool = False
