"""
Cache Decorators
================
Provides a ``@cached`` decorator for automatic caching of function return values.

Usage::

    from cache.decorators import cached

    @cached(ttl=600, key_prefix="news")
    def get_latest_news(limit=20):
        ...
"""

from __future__ import annotations

import functools
import hashlib
import json
import logging

from cache.redis_client import cache_get, cache_set, is_redis_available

logger = logging.getLogger(__name__)


def cached(ttl: int = 300, key_prefix: str = "cache"):
    """Decorator that caches the return value of a function in Redis.

    Parameters
    ----------
    ttl : int
        Time-to-live in seconds (default 300 = 5 minutes).
    key_prefix : str
        Prefix for the cache key (e.g. "news", "reports").

    The cache key is built from the prefix, function name, and a hash of
    the positional and keyword arguments (JSON-serialized).

    If Redis is unavailable or ``CACHE_ENABLED`` is false (checked via
    config), the decorator is a no-op and the function executes normally.
    """

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Check if caching is enabled
            if not _is_cache_enabled():
                return func(*args, **kwargs)

            cache_key = _build_key(key_prefix, func.__name__, args, kwargs)

            # Try to get from cache
            cached_value = cache_get(cache_key)
            if cached_value is not None:
                try:
                    return json.loads(cached_value)
                except (json.JSONDecodeError, TypeError):
                    # Corrupted cache entry -- fall through to re-compute
                    pass

            # Compute the result
            result = func(*args, **kwargs)

            # Store in cache
            try:
                serialized = json.dumps(result, default=str)
                cache_set(cache_key, serialized, ttl=ttl)
            except (TypeError, ValueError) as exc:
                logger.debug("Could not cache result of %s: %s", func.__name__, exc)

            return result

        return wrapper

    return decorator


def _build_key(prefix: str, func_name: str, args: tuple, kwargs: dict) -> str:
    """Build a deterministic cache key from function arguments."""
    # Skip 'self' for bound methods
    key_args = args
    if (
        key_args
        and hasattr(key_args[0], "__class__")
        and hasattr(key_args[0], func_name)
    ):
        key_args = key_args[1:]

    raw = json.dumps({"a": key_args, "k": kwargs}, sort_keys=True, default=str)
    arg_hash = hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()[:12]
    return f"{prefix}:{func_name}:{arg_hash}"


def _is_cache_enabled() -> bool:
    """Check if caching is enabled (Redis available + CACHE_ENABLED=true)."""
    if not is_redis_available():
        return False
    try:
        from config import get_settings

        return get_settings().cache.enabled
    except Exception:
        # Config not loaded yet or missing cache settings -- allow caching
        # if Redis is available
        return True
