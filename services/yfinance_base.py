"""
Shared yfinance utilities: LRU cache with TTL and circuit breaker.

Extracted from stock_ohlcv.py and tasi_index.py to eliminate ~200 lines
of duplicated cache + circuit breaker logic.
"""

import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# Default LRU cache capacity
DEFAULT_MAX_ENTRIES = 500


class YFinanceCache:
    """Thread-safe LRU cache with TTL expiration.

    Uses OrderedDict to maintain insertion/access order and evicts
    the oldest entries when the cache exceeds ``max_entries``.

    Args:
        ttl: Time-to-live in seconds for cache entries.
        max_entries: Maximum number of entries before LRU eviction.
        name: Human-readable name for log messages.
    """

    def __init__(
        self,
        ttl: int = 300,
        max_entries: int = DEFAULT_MAX_ENTRIES,
        name: str = "yfinance",
    ) -> None:
        self._ttl = ttl
        self._max_entries = max_entries
        self._name = name
        self._store: OrderedDict[Union[str, Tuple], Dict[str, Any]] = OrderedDict()
        self._lock = threading.Lock()

    @property
    def ttl(self) -> int:
        return self._ttl

    def get(self, key: Union[str, Tuple]) -> Optional[Dict[str, Any]]:
        """Return cached payload if still fresh, else None."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            age = time.monotonic() - entry["fetched_at"]
            if age < self._ttl:
                # Move to end (most-recently-used)
                self._store.move_to_end(key)
                return entry["payload"]
            return None

    def get_stale(self, key: Union[str, Tuple]) -> Optional[Dict[str, Any]]:
        """Return cached payload even if stale (for fallback on fetch failure)."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            return entry["payload"]

    def put(self, key: Union[str, Tuple], payload: Dict[str, Any]) -> None:
        """Insert or update a cache entry, evicting oldest if over capacity."""
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = {
                "payload": payload,
                "fetched_at": time.monotonic(),
            }
            # Evict oldest entries if over capacity
            while len(self._store) > self._max_entries:
                evicted_key, _ = self._store.popitem(last=False)
                logger.debug(
                    "%s cache: evicted oldest entry %s (size=%d, max=%d)",
                    self._name,
                    evicted_key,
                    len(self._store),
                    self._max_entries,
                )

    def newest_entry(self) -> Optional[Dict[str, Any]]:
        """Return the most recently fetched entry, or None if empty."""
        with self._lock:
            if not self._store:
                return None
            # Last item in OrderedDict is most recently used/inserted
            key = next(reversed(self._store))
            return self._store[key]

    def clear(self) -> None:
        """Remove all entries from the cache."""
        with self._lock:
            self._store.clear()

    def __getitem__(self, key: Union[str, Tuple]) -> Dict[str, Any]:
        """Dict-like access for backward compatibility with tests."""
        with self._lock:
            return self._store[key]

    def __setitem__(self, key: Union[str, Tuple], value: Dict[str, Any]) -> None:
        """Dict-like assignment for backward compatibility with tests."""
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = value
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)

    def __contains__(self, key: Union[str, Tuple]) -> bool:
        with self._lock:
            return key in self._store

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)

    def __bool__(self) -> bool:
        with self._lock:
            return bool(self._store)


class CircuitBreaker:
    """Thread-safe circuit breaker for external API calls.

    Opens the circuit after ``threshold`` consecutive failures and
    keeps it open for ``timeout`` seconds before allowing retries.

    Args:
        threshold: Number of consecutive failures before opening.
        timeout: Seconds to keep the circuit open.
        name: Human-readable name for log messages.
    """

    def __init__(
        self,
        threshold: int = 5,
        timeout: int = 300,
        name: str = "yfinance",
    ) -> None:
        self._threshold = threshold
        self._timeout = timeout
        self._name = name
        self._consecutive_failures: int = 0
        self._open_until: float = 0.0
        self._lock = threading.Lock()

    @property
    def threshold(self) -> int:
        return self._threshold

    @property
    def timeout(self) -> int:
        return self._timeout

    def is_open(self) -> bool:
        """Return True if the circuit breaker is currently open."""
        return time.monotonic() < self._open_until

    def record_failure(self) -> None:
        """Increment failure count; open circuit if threshold reached."""
        with self._lock:
            self._consecutive_failures += 1
            if (
                self._consecutive_failures >= self._threshold
                and not self.is_open()
            ):
                self._open_until = time.monotonic() + self._timeout
                logger.warning(
                    "%s circuit breaker OPEN -- serving cached/mock for next %d seconds "
                    "(consecutive_failures=%d)",
                    self._name,
                    self._timeout,
                    self._consecutive_failures,
                )

    def record_success(self) -> None:
        """Reset circuit breaker on a successful call."""
        with self._lock:
            was_open = self.is_open()
            self._consecutive_failures = 0
            self._open_until = 0.0
            if was_open:
                logger.info(
                    "%s circuit breaker CLOSED -- live data restored",
                    self._name,
                )

    def get_status(self) -> Dict[str, Any]:
        """Return circuit breaker diagnostics for health endpoints."""
        with self._lock:
            is_open = self.is_open()
            remaining = (
                max(0.0, self._open_until - time.monotonic()) if is_open else 0.0
            )
            return {
                "circuit_state": "open" if is_open else "closed",
                "consecutive_failures": self._consecutive_failures,
                "open_remaining_seconds": round(remaining) if is_open else None,
            }
