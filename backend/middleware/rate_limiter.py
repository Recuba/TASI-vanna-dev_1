"""
Sliding window rate limiter with Redis backend and in-memory fallback.

Uses Redis db=1 (separate from cache on db=0) for distributed rate limiting.
Falls back to an in-memory dict-of-deques implementation when Redis is
unavailable, making the limiter work identically in development without Redis.

Usage::

    limiter = RateLimiter(redis_url="redis://localhost:6379/1")
    result = limiter.check("user:123", limit=60, window=60)
    if not result.allowed:
        # reject request
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Optional

from backend.middleware.models import RateLimitResult

logger = logging.getLogger(__name__)

# Cleanup stale in-memory entries every N checks
_CLEANUP_INTERVAL = 500


class RateLimiter:
    """Sliding window rate limiter with Redis + in-memory fallback.

    Parameters
    ----------
    redis_url : str or None
        Redis connection URL. Uses db=1 by default to avoid conflicts with
        the cache layer (db=0). Pass None to skip Redis entirely.
    """

    def __init__(self, redis_url: Optional[str] = None) -> None:
        self._redis = None
        self._redis_url = redis_url

        # In-memory fallback structures
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._check_count = 0

        if redis_url:
            self._init_redis(redis_url)

    def _init_redis(self, url: str) -> None:
        """Attempt to connect to Redis. Fail silently to in-memory mode."""
        try:
            import redis

            self._redis = redis.Redis.from_url(
                url,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=3,
            )
            self._redis.ping()
            logger.info("Rate limiter Redis connected: %s", url)
        except Exception as exc:
            logger.warning(
                "Rate limiter Redis unavailable (%s): %s -- using in-memory fallback",
                url,
                exc,
            )
            self._redis = None

    @property
    def is_redis_available(self) -> bool:
        """Return True if the Redis backend is connected."""
        if self._redis is None:
            return False
        try:
            return self._redis.ping()
        except Exception:
            return False

    def check(
        self,
        identifier: str,
        limit: int = 60,
        window: int = 60,
        bucket: str = "_default",
    ) -> RateLimitResult:
        """Check whether a request from *identifier* is within the rate limit.

        Parameters
        ----------
        identifier : str
            Unique client key (e.g. user ID, IP address).
        limit : int
            Maximum number of requests allowed in *window* seconds.
        window : int
            Sliding window size in seconds.
        bucket : str
            Logical bucket name for the rate limit rule (used in logging).

        Returns
        -------
        RateLimitResult
            Contains ``allowed``, ``remaining``, ``reset_after``, etc.
        """
        key = f"rl:{bucket}:{identifier}"

        if self._redis is not None:
            try:
                return self._check_redis(key, identifier, limit, window, bucket)
            except Exception as exc:
                logger.warning(
                    "Redis rate limit check failed for %s: %s -- falling back to in-memory",
                    key,
                    exc,
                )

        return self._check_memory(key, identifier, limit, window, bucket)

    def _check_redis(
        self,
        key: str,
        identifier: str,
        limit: int,
        window: int,
        bucket: str,
    ) -> RateLimitResult:
        """Sliding window counter using Redis sorted set.

        Each request is added as a member with score = current timestamp.
        Expired members (older than the window) are removed atomically via
        a pipeline to keep the operation consistent.
        """
        now = time.time()
        window_start = now - window
        pipe = self._redis.pipeline(transaction=True)

        # Remove expired entries
        pipe.zremrangebyscore(key, "-inf", window_start)
        # Count current entries
        pipe.zcard(key)
        # Add current request (member = timestamp string to ensure uniqueness)
        pipe.zadd(key, {f"{now}": now})
        # Set expiry on the key so it auto-cleans
        pipe.expire(key, window + 1)

        results = pipe.execute()
        current_count = results[1]  # zcard result (before adding this request)

        if current_count >= limit:
            # Over limit -- find when the oldest entry expires
            oldest = self._redis.zrange(key, 0, 0, withscores=True)
            if oldest:
                reset_after = max(1, int(oldest[0][1] + window - now) + 1)
            else:
                reset_after = window

            # Remove the request we just added since it's rejected
            self._redis.zrem(key, f"{now}")

            return RateLimitResult(
                allowed=False,
                limit=limit,
                remaining=0,
                reset_after=reset_after,
                identifier=identifier,
                bucket=bucket,
            )

        remaining = max(0, limit - current_count - 1)
        return RateLimitResult(
            allowed=True,
            limit=limit,
            remaining=remaining,
            reset_after=window,
            identifier=identifier,
            bucket=bucket,
        )

    def _check_memory(
        self,
        key: str,
        identifier: str,
        limit: int,
        window: int,
        bucket: str,
    ) -> RateLimitResult:
        """In-memory sliding window using deque of timestamps."""
        now = time.monotonic()
        cutoff = now - window

        # Periodic cleanup
        self._check_count += 1
        if self._check_count % _CLEANUP_INTERVAL == 0:
            self._cleanup_memory(now, window)

        timestamps = self._requests[key]

        # Remove expired entries
        while timestamps and timestamps[0] < cutoff:
            timestamps.popleft()

        if len(timestamps) >= limit:
            reset_after = max(1, int(timestamps[0] - cutoff) + 1)
            return RateLimitResult(
                allowed=False,
                limit=limit,
                remaining=0,
                reset_after=reset_after,
                identifier=identifier,
                bucket=bucket,
            )

        timestamps.append(now)
        remaining = max(0, limit - len(timestamps))
        return RateLimitResult(
            allowed=True,
            limit=limit,
            remaining=remaining,
            reset_after=window,
            identifier=identifier,
            bucket=bucket,
        )

    def _cleanup_memory(self, now: float, window: int) -> None:
        """Remove in-memory keys with no recent requests."""
        cutoff = now - window
        stale = [
            k
            for k, ts in self._requests.items()
            if not ts or ts[-1] < cutoff
        ]
        for k in stale:
            del self._requests[k]

    def close(self) -> None:
        """Close the Redis connection if open."""
        if self._redis is not None:
            try:
                self._redis.close()
                logger.info("Rate limiter Redis connection closed")
            except Exception as exc:
                logger.warning("Error closing rate limiter Redis: %s", exc)
            finally:
                self._redis = None
