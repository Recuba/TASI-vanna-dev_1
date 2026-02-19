"""
Unified caching decorator with Redis / in-memory TTLCache fallback.

Usage::

    from services.cache_utils import cache_response

    @cache_response(ttl=300)
    def get_market_data(ticker: str) -> dict:
        ...

    @cache_response(ttl=60)
    async def get_live_price(ticker: str) -> dict:
        ...

The decorator transparently picks Redis when available, otherwise
falls back to a simple in-memory TTLCache.  Works with both sync
and async callables and preserves function metadata via functools.wraps.
"""

import asyncio
import functools
import json
import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])

# Default in-memory TTL cache capacity
_DEFAULT_MAX_ENTRIES = 1024


class TTLCache:
    """Thread-safe in-memory cache with per-entry TTL and LRU eviction.

    Args:
        default_ttl: Default time-to-live in seconds.
        max_entries: Maximum entries before LRU eviction kicks in.
    """

    def __init__(
        self, default_ttl: int = 300, max_entries: int = _DEFAULT_MAX_ENTRIES
    ) -> None:
        self._default_ttl = default_ttl
        self._max_entries = max_entries
        self._store: OrderedDict[str, dict] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if time.monotonic() - entry["ts"] >= entry["ttl"]:
                # Expired -- remove lazily
                del self._store[key]
                return None
            self._store.move_to_end(key)
            return entry["value"]

    def put(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        effective_ttl = ttl if ttl is not None else self._default_ttl
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = {
                "value": value,
                "ts": time.monotonic(),
                "ttl": effective_ttl,
            }
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)


# Module-level singleton -- shared across all decorated functions.
_fallback_cache = TTLCache()

# Redis client placeholder -- set externally via ``configure_redis``.
_redis_client: Any = None

# Consecutive Redis failure tracking (S2-B3)
_redis_fail_count: int = 0
_REDIS_WARN_THRESHOLD: int = 3


def configure_redis(client: Any) -> None:
    """Set a Redis client for the caching layer.

    Args:
        client: A ``redis.Redis`` (or compatible) instance.  If *None*,
            the decorator falls back to in-memory TTLCache.
    """
    global _redis_client
    _redis_client = client
    if client is not None:
        logger.info("cache_utils: Redis client configured")
    else:
        logger.info("cache_utils: Redis client removed, using in-memory fallback")


def _make_key(func: Callable, args: tuple, kwargs: dict) -> str:
    """Build a cache key from function qualname + call arguments."""
    parts = [func.__module__, func.__qualname__]
    for a in args:
        parts.append(repr(a))
    for k in sorted(kwargs):
        parts.append(f"{k}={repr(kwargs[k])}")
    return ":".join(parts)


def _cache_get(key: str) -> Any:
    """Try Redis GET, then in-memory. Returns None on miss."""
    global _redis_fail_count
    if _redis_client is not None:
        try:
            cached = _redis_client.get(key)
            if cached is not None:
                _redis_fail_count = 0  # reset on success
                return json.loads(cached)
        except Exception as e:
            _redis_fail_count += 1
            if _redis_fail_count >= _REDIS_WARN_THRESHOLD:
                logger.warning(
                    "Redis unavailable after %d consecutive failures — using in-memory fallback",
                    _redis_fail_count,
                )
            else:
                logger.debug("Redis get failed for key %s: %s", key, e)
    return _fallback_cache.get(key)


def _cache_put(key: str, value: Any, ttl: int) -> None:
    """Store in Redis and in-memory fallback."""
    global _redis_fail_count
    if _redis_client is not None:
        try:
            _redis_client.setex(key, ttl, json.dumps(value, default=str))
            _redis_fail_count = 0  # reset on success
        except Exception as e:
            _redis_fail_count += 1
            if _redis_fail_count >= _REDIS_WARN_THRESHOLD:
                logger.warning(
                    "Redis unavailable after %d consecutive failures — using in-memory fallback",
                    _redis_fail_count,
                )
            else:
                logger.debug("Redis set failed for key %s: %s", key, e)
    _fallback_cache.put(key, value, ttl=ttl)


def cache_response(ttl: int = 300) -> Callable[[F], F]:
    """Decorator that caches function return values.

    Uses Redis when available (via ``configure_redis``), otherwise
    falls back to in-memory ``TTLCache``.  Works with both sync and
    async functions.

    Args:
        ttl: Time-to-live in seconds for cached results.
    """

    def decorator(func: F) -> F:
        if asyncio.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                key = _make_key(func, args, kwargs)
                cached = _cache_get(key)
                if cached is not None:
                    return cached
                result = await func(*args, **kwargs)
                _cache_put(key, result, ttl)
                return result

            return async_wrapper  # type: ignore[return-value]
        else:

            @functools.wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                key = _make_key(func, args, kwargs)
                cached = _cache_get(key)
                if cached is not None:
                    return cached
                result = func(*args, **kwargs)
                _cache_put(key, result, ttl)
                return result

            return sync_wrapper  # type: ignore[return-value]

    return decorator
