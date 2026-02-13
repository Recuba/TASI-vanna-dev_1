"""Cache configuration via Pydantic Settings.

All settings are loaded from environment variables with the ``CACHE_`` prefix
(e.g. ``CACHE_ENABLED=true``, ``CACHE_DEFAULT_TTL=300``).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class CacheConfig(BaseSettings):
    """Configuration for the Redis caching subsystem.

    Attributes:
        enabled: Master switch for the cache layer.
        redis_url: Redis connection URL (database 0 for caching).
        redis_password: Optional Redis auth password.
        redis_max_connections: Maximum connection pool size.
        default_ttl: Default TTL in seconds when no tier applies.
        market_ttl: TTL for live market-data queries (seconds).
        historical_ttl: TTL for historical / financial-statement queries.
        schema_ttl: TTL for schema / metadata queries.
        compression_threshold: Byte threshold above which responses are gzip-compressed before caching.
        compression_level: gzip compression level (1-9).
        warm_on_startup: Whether to pre-warm common queries at startup.
        maintenance_interval: Seconds between maintenance cycles (stats, cleanup).
    """

    model_config = SettingsConfigDict(
        env_prefix="CACHE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    enabled: bool = False
    redis_url: str = "redis://localhost:6379/0"
    redis_password: str = ""
    redis_max_connections: int = 20
    default_ttl: int = 300
    market_ttl: int = 60
    historical_ttl: int = 3600
    schema_ttl: int = 86400
    compression_threshold: int = 1024
    compression_level: int = 6
    warm_on_startup: bool = False
    maintenance_interval: int = 300
