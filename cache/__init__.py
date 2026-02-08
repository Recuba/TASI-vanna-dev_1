"""
Cache module for TASI AI Platform.

Provides an optional Redis-backed cache layer. All cache operations are
fail-safe -- if Redis is unavailable the app continues without caching.

Usage::

    from cache import init_redis, cache_get, cache_set, close_redis
    from cache.decorators import cached
"""

from cache.redis_client import (
    init_redis,
    get_redis,
    close_redis,
    cache_get,
    cache_set,
    cache_delete,
    cache_invalidate_pattern,
    is_redis_available,
)
from cache.decorators import cached

__all__ = [
    "init_redis",
    "get_redis",
    "close_redis",
    "cache_get",
    "cache_set",
    "cache_delete",
    "cache_invalidate_pattern",
    "is_redis_available",
    "cached",
]
