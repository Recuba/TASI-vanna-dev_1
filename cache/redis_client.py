"""
Redis Client Wrapper
====================
Thin wrapper around ``redis.Redis`` with fail-safe operations.
All public functions catch exceptions so cache failures never crash the app.

The client is lazy-initialized via ``init_redis(url)`` and must be
explicitly closed with ``close_redis()`` at shutdown.
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singleton (lazy)
# ---------------------------------------------------------------------------
_redis_client = None


def init_redis(url: str = "redis://localhost:6379/0") -> None:
    """Initialize the global Redis client.

    Parameters
    ----------
    url : str
        Redis connection URL (e.g. ``redis://localhost:6379/0``).
    """
    global _redis_client

    if _redis_client is not None:
        logger.warning("Redis client already initialized -- skipping")
        return

    try:
        import redis

        _redis_client = redis.Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        # Verify the connection is alive
        _redis_client.ping()
        logger.info("Redis client initialized: %s", url)
    except Exception as exc:
        logger.warning("Failed to connect to Redis (%s): %s", url, exc)
        _redis_client = None


def get_redis():
    """Return the raw Redis client, or None if not initialized."""
    return _redis_client


def close_redis() -> None:
    """Close the Redis client. Safe to call even if not initialized."""
    global _redis_client
    if _redis_client is not None:
        try:
            _redis_client.close()
            logger.info("Redis client closed")
        except Exception as exc:
            logger.warning("Error closing Redis client: %s", exc)
        finally:
            _redis_client = None


def is_redis_available() -> bool:
    """Return True if Redis is connected and responding."""
    if _redis_client is None:
        return False
    try:
        return _redis_client.ping()
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Cache operations (all fail-safe)
# ---------------------------------------------------------------------------


def cache_get(key: str) -> Optional[str]:
    """Get a value from cache. Returns None if key is missing or Redis is down."""
    if _redis_client is None:
        return None
    try:
        return _redis_client.get(key)
    except Exception as exc:
        logger.debug("cache_get(%s) failed: %s", key, exc)
        return None


def cache_set(key: str, value: str, ttl: int = 300) -> bool:
    """Set a value in cache with a TTL in seconds. Returns True on success."""
    if _redis_client is None:
        return False
    try:
        _redis_client.setex(key, ttl, value)
        return True
    except Exception as exc:
        logger.debug("cache_set(%s) failed: %s", key, exc)
        return False


def cache_delete(key: str) -> bool:
    """Delete a key from cache. Returns True if the key was deleted."""
    if _redis_client is None:
        return False
    try:
        return bool(_redis_client.delete(key))
    except Exception as exc:
        logger.debug("cache_delete(%s) failed: %s", key, exc)
        return False


def cache_invalidate_pattern(pattern: str) -> int:
    """Delete all keys matching a glob pattern. Returns the count of deleted keys.

    Uses SCAN to avoid blocking Redis on large keyspaces.
    """
    if _redis_client is None:
        return 0
    try:
        count = 0
        cursor = 0
        while True:
            cursor, keys = _redis_client.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                count += _redis_client.delete(*keys)
            if cursor == 0:
                break
        return count
    except Exception as exc:
        logger.debug("cache_invalidate_pattern(%s) failed: %s", pattern, exc)
        return 0
