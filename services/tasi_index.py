"""
TASI Index data fetcher service.

Fetches TASI (Tadawul All Share Index) OHLCV data via yfinance with
in-memory caching, circuit breaker, and deterministic mock fallback.
"""

import logging
import random
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from services.yfinance_base import CircuitBreaker, YFinanceCache

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared cache & circuit breaker instances
# ---------------------------------------------------------------------------
_cache = YFinanceCache(ttl=300, max_entries=500, name="tasi_index")
_CACHE_TTL = _cache.ttl  # backward-compatible alias for tests

# Per-period locks: allow concurrent fetches for different periods
_period_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()  # Protects _period_locks dict itself
_MAX_LOCKS = 100  # Prevent unbounded growth


def _get_period_lock(period: str) -> threading.Lock:
    """Return a per-period lock, creating one if needed."""
    with _locks_guard:
        if period not in _period_locks:
            if len(_period_locks) >= _MAX_LOCKS:
                _period_locks.pop(next(iter(_period_locks)))
            _period_locks[period] = threading.Lock()
        return _period_locks[period]

VALID_PERIODS = ("1mo", "3mo", "6mo", "1y", "2y", "5y")

_breaker = CircuitBreaker(
    threshold=5,
    timeout=300,  # 5 min
    name="tasi_index",
)

SYMBOL_RETRY_DELAY = 0.5  # seconds between symbol retries

# Backward-compatible module-level circuit breaker state
# (used by test fixtures that reset state via ``mod._consecutive_failures = 0``)
CIRCUIT_BREAKER_THRESHOLD = _breaker.threshold
CIRCUIT_BREAKER_TIMEOUT = _breaker.timeout
_consecutive_failures: int = 0
_circuit_open_until: float = 0.0
_circuit_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Cache helpers (thin wrappers with TASI-specific metadata enrichment)
# ---------------------------------------------------------------------------


def _get_cached(period: str) -> Optional[Dict[str, Any]]:
    """Return cached data if still fresh, enriched with freshness metadata."""
    payload = _cache.get(period)
    if payload is None:
        return None
    # Get entry for age calculation
    with _cache._lock:
        entry = _cache._store.get(period)
    if entry is None:
        return None
    age = time.monotonic() - entry["fetched_at"]
    result = dict(payload)
    result["data_freshness"] = "cached"
    result["cache_age_seconds"] = round(age)
    return result


def _get_stale_cached(period: str) -> Optional[Dict[str, Any]]:
    """Return stale cache entry (for fallback on fetch failure).

    Enriches the payload with staleness metadata so consumers (especially
    the frontend) can display an appropriate warning about data age.
    """
    payload = _cache.get_stale(period)
    if payload is None:
        return None
    with _cache._lock:
        entry = _cache._store.get(period)
    age_seconds = round(time.monotonic() - entry["fetched_at"]) if entry else 0
    result = dict(payload)
    result["source"] = "cached"
    result["data_freshness"] = "stale"
    result["cache_age_seconds"] = age_seconds
    return result


def _set_cache(period: str, payload: Dict[str, Any]) -> None:
    _cache.put(period, payload)


# ---------------------------------------------------------------------------
# Circuit breaker helpers
# Uses shared CircuitBreaker internally but keeps module-level state
# in sync for backward compatibility with test fixtures.
# ---------------------------------------------------------------------------


def _sync_to_breaker() -> None:
    """Push module-level state into the CircuitBreaker instance."""
    _breaker._consecutive_failures = _consecutive_failures
    _breaker._open_until = _circuit_open_until


def _is_circuit_open() -> bool:
    """Return True if the circuit breaker is currently open (yfinance skipped)."""
    _sync_to_breaker()
    return _breaker.is_open()


def _record_failure() -> None:
    """Increment consecutive failure count; open circuit if threshold reached."""
    global _consecutive_failures, _circuit_open_until
    _sync_to_breaker()
    _breaker.record_failure()
    # Sync back
    _consecutive_failures = _breaker._consecutive_failures
    _circuit_open_until = _breaker._open_until


def _record_success() -> None:
    """Reset circuit breaker on a successful fetch."""
    global _consecutive_failures, _circuit_open_until
    _sync_to_breaker()
    _breaker.record_success()
    _consecutive_failures = _breaker._consecutive_failures
    _circuit_open_until = _breaker._open_until


def get_circuit_breaker_status() -> Dict[str, Any]:
    """Return circuit breaker diagnostics for the health endpoint."""
    _sync_to_breaker()
    return _breaker.get_status()


# ---------------------------------------------------------------------------
# Mock data generator (deterministic)
# ---------------------------------------------------------------------------


def _generate_mock_data(period: str) -> List[Dict[str, Any]]:
    """Generate deterministic mock TASI data seeded by period string."""
    period_days = {
        "1mo": 22,
        "3mo": 66,
        "6mo": 132,
        "1y": 252,
        "2y": 504,
        "5y": 1260,
    }
    days = period_days.get(period, 252)
    rng = random.Random(42)  # deterministic seed

    data = []
    base_price = 11500.0
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=int(days * 1.45))  # account for weekends

    current = start_date
    price = base_price
    count = 0

    while count < days and current <= end_date:
        # Skip weekends (Tadawul operates Sun-Thu; Friday=4, Saturday=5)
        if current.weekday() in (4, 5):
            current += timedelta(days=1)
            continue

        change_pct = rng.gauss(0.0002, 0.012)
        price = price * (1 + change_pct)
        day_range = price * rng.uniform(0.005, 0.02)
        open_price = price + rng.uniform(-day_range / 2, day_range / 2)
        high = max(open_price, price) + rng.uniform(0, day_range / 2)
        low = min(open_price, price) - rng.uniform(0, day_range / 2)
        volume = int(rng.uniform(80_000_000, 300_000_000))

        data.append(
            {
                "time": current.isoformat(),
                "open": round(open_price, 2),
                "high": round(high, 2),
                "low": round(low, 2),
                "close": round(price, 2),
                "volume": volume,
            }
        )
        count += 1
        current += timedelta(days=1)

    return data


# ---------------------------------------------------------------------------
# Main fetcher
# ---------------------------------------------------------------------------


def fetch_tasi_index(period: str = "1y") -> Dict[str, Any]:
    """Fetch TASI index OHLCV data.

    Tries yfinance first (^TASI, then TASI.SR fallback).
    Falls back to stale cache or deterministic mock data.

    Args:
        period: One of '1mo', '3mo', '6mo', '1y', '2y', '5y'.

    Returns:
        Dict with keys: data, source, last_updated, symbol.
    """
    t_start = time.monotonic()

    # Check fresh cache first
    cached = _get_cached(period)
    if cached is not None:
        duration_ms = round((time.monotonic() - t_start) * 1000, 1)
        logger.info(
            "TASI fetch: source=cache, cache_hit=True, "
            "fetch_duration_ms=%.1f, symbol=%s, period=%s",
            duration_ms,
            cached.get("symbol", "^TASI"),
            period,
        )
        return cached

    # Serialize yfinance fetches per period (different periods fetch concurrently)
    with _get_period_lock(period):
        # Double-check cache inside the lock (another thread may have filled it)
        cached = _get_cached(period)
        if cached is not None:
            duration_ms = round((time.monotonic() - t_start) * 1000, 1)
            logger.info(
                "TASI fetch: source=cache, cache_hit=True, "
                "fetch_duration_ms=%.1f, symbol=%s, period=%s",
                duration_ms,
                cached.get("symbol", "^TASI"),
                period,
            )
            return cached

        # Check circuit breaker -- skip yfinance entirely if open
        if _is_circuit_open():
            logger.info(
                "TASI fetch: circuit_breaker=open, skipping yfinance, period=%s",
                period,
            )
        else:
            # Try yfinance
            symbols = ["^TASI", "TASI.SR"]
            for idx, symbol in enumerate(symbols):
                try:
                    import yfinance as yf

                    ticker = yf.Ticker(symbol)
                    df = ticker.history(period=period, auto_adjust=True)

                    if df is not None and not df.empty:
                        df = df.reset_index()
                        data = []
                        for _, row in df.iterrows():
                            date_val = row.get("Date")
                            if hasattr(date_val, "strftime"):
                                time_str = date_val.strftime("%Y-%m-%d")
                            else:
                                time_str = str(date_val)[:10]

                            data.append(
                                {
                                    "time": time_str,
                                    "open": round(float(row["Open"]), 2),
                                    "high": round(float(row["High"]), 2),
                                    "low": round(float(row["Low"]), 2),
                                    "close": round(float(row["Close"]), 2),
                                    "volume": int(row["Volume"])
                                    if row.get("Volume")
                                    else 0,
                                }
                            )

                        payload = {
                            "data": data,
                            "source": "real",
                            "data_freshness": "real-time",
                            "cache_age_seconds": 0,
                            "last_updated": datetime.utcnow().isoformat() + "Z",
                            "symbol": symbol,
                        }
                        _set_cache(period, payload)
                        _record_success()
                        duration_ms = round((time.monotonic() - t_start) * 1000, 1)
                        logger.info(
                            "TASI fetch: source=real, cache_hit=False, "
                            "fetch_duration_ms=%.1f, symbol=%s, period=%s, points=%d",
                            duration_ms,
                            symbol,
                            period,
                            len(data),
                        )
                        return payload

                except ImportError:
                    logger.warning("yfinance not installed, skipping real data fetch")
                    break
                except Exception as exc:
                    _record_failure()
                    exc_type = type(exc).__name__
                    exc_msg = str(exc)
                    # Classify the error
                    error_category = "unknown"
                    if "429" in exc_msg or "rate" in exc_msg.lower():
                        error_category = "rate_limit"
                    elif any(
                        k in exc_msg.lower()
                        for k in ("timeout", "connect", "network", "dns", "socket")
                    ):
                        error_category = "network"
                    else:
                        error_category = "data_error"

                    logger.warning(
                        "yfinance fetch failed: symbol=%s, period=%s, "
                        "error_type=%s, error_category=%s, message=%s, "
                        "consecutive_failures=%d",
                        symbol,
                        period,
                        exc_type,
                        error_category,
                        exc_msg,
                        _breaker.get_status()["consecutive_failures"],
                    )
                    # Add delay between symbol retries (but not after the last symbol)
                    if idx < len(symbols) - 1:
                        time.sleep(SYMBOL_RETRY_DELAY)
                    continue

    # Fallback: stale cache
    stale = _get_stale_cached(period)
    if stale is not None:
        duration_ms = round((time.monotonic() - t_start) * 1000, 1)
        logger.info(
            "TASI fetch: source=cached, cache_hit=False, "
            "fetch_duration_ms=%.1f, symbol=%s, period=%s",
            duration_ms,
            stale.get("symbol", "^TASI"),
            period,
        )
        return stale

    # Fallback: mock data
    mock_data = _generate_mock_data(period)
    payload = {
        "data": mock_data,
        "source": "mock",
        "data_freshness": "mock",
        "cache_age_seconds": None,
        "last_updated": datetime.utcnow().isoformat() + "Z",
        "symbol": "^TASI",
    }
    _set_cache(period, payload)
    duration_ms = round((time.monotonic() - t_start) * 1000, 1)
    logger.info(
        "TASI fetch: source=mock, cache_hit=False, "
        "fetch_duration_ms=%.1f, symbol=^TASI, period=%s, points=%d",
        duration_ms,
        period,
        len(mock_data),
    )
    return payload


# Convenience alias used by the verification command
get_tasi_data = fetch_tasi_index


def get_cache_status() -> Dict[str, Any]:
    """Return cache diagnostic information for the health endpoint."""
    if not _cache:
        return {
            "cache_status": "empty",
            "cache_age_seconds": None,
            "last_updated": None,
        }
    entry = _cache.newest_entry()
    if entry is None:
        return {
            "cache_status": "empty",
            "cache_age_seconds": None,
            "last_updated": None,
        }
    age = time.monotonic() - entry["fetched_at"]
    fresh = age < _cache.ttl
    return {
        "cache_status": "fresh" if fresh else "stale",
        "cache_age_seconds": round(age),
        "last_updated": entry["payload"].get("last_updated"),
    }
