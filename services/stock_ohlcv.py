"""
Per-stock OHLCV data fetcher service.

Fetches OHLCV data for individual Saudi-listed stocks via yfinance with
in-memory caching, circuit breaker, and deterministic mock fallback.
Saudi tickers get ".SR" suffix automatically (e.g. "2222" -> "2222.SR").
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
_cache = YFinanceCache(ttl=300, max_entries=500, name="stock_ohlcv")

# Per-ticker locks: allow concurrent fetches for different tickers
_ticker_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()  # Protects _ticker_locks dict itself
_MAX_LOCKS = 1000  # Prevent unbounded growth


def _get_ticker_lock(symbol: str, period: str) -> threading.Lock:
    """Return a per-(symbol, period) lock, creating one if needed."""
    key = f"{symbol}:{period}"
    with _locks_guard:
        if key not in _ticker_locks:
            # Evict oldest if at capacity
            if len(_ticker_locks) >= _MAX_LOCKS:
                # Remove first entry (oldest by insertion order in Python 3.7+)
                _ticker_locks.pop(next(iter(_ticker_locks)))
            _ticker_locks[key] = threading.Lock()
        return _ticker_locks[key]


VALID_PERIODS = ("1mo", "3mo", "6mo", "1y", "2y", "5y")

_breaker = CircuitBreaker(
    threshold=5,
    timeout=900,  # 15 min
    name="stock_ohlcv",
)


# ---------------------------------------------------------------------------
# Ticker normalization
# ---------------------------------------------------------------------------


def _normalize_ticker(ticker: str) -> str:
    """Append .SR suffix for Saudi stocks if not already present."""
    ticker = ticker.strip().upper()
    if not ticker.endswith(".SR"):
        ticker = ticker + ".SR"
    return ticker


# ---------------------------------------------------------------------------
# Cache helpers (thin wrappers over YFinanceCache)
# ---------------------------------------------------------------------------


def _get_cached(ticker: str, period: str) -> Optional[Dict[str, Any]]:
    """Return cached data if still fresh."""
    return _cache.get((ticker, period))


def _get_stale_cached(ticker: str, period: str) -> Optional[Dict[str, Any]]:
    """Return stale cache entry (for fallback on fetch failure)."""
    payload = _cache.get_stale((ticker, period))
    if payload is None:
        return None
    result = dict(payload)
    result["source"] = "cached"
    return result


def _set_cache(ticker: str, period: str, payload: Dict[str, Any]) -> None:
    _cache.put((ticker, period), payload)


# ---------------------------------------------------------------------------
# Circuit breaker helpers (delegates to shared CircuitBreaker)
# ---------------------------------------------------------------------------


def _is_circuit_open() -> bool:
    """Return True if the circuit breaker is currently open."""
    return _breaker.is_open()


def _record_failure() -> None:
    """Increment consecutive failure count; open circuit if threshold reached."""
    _breaker.record_failure()


def _record_success() -> None:
    """Reset circuit breaker on a successful fetch."""
    _breaker.record_success()


def get_circuit_breaker_status() -> Dict[str, Any]:
    """Return circuit breaker diagnostics for the health endpoint."""
    return _breaker.get_status()


# ---------------------------------------------------------------------------
# Mock data generator (deterministic per ticker)
# ---------------------------------------------------------------------------


def _generate_mock_data(ticker: str, period: str) -> List[Dict[str, Any]]:
    """Generate deterministic mock OHLCV data seeded by ticker + period."""
    period_days = {
        "1mo": 22,
        "3mo": 66,
        "6mo": 132,
        "1y": 252,
        "2y": 504,
        "5y": 1260,
    }
    days = period_days.get(period, 252)

    # Deterministic seed based on ticker so the same ticker always produces
    # the same mock data across requests.
    seed = sum(ord(c) for c in ticker)
    rng = random.Random(seed)

    # Base price derived from ticker digits (realistic range for Saudi stocks)
    digits = "".join(c for c in ticker if c.isdigit())
    base_price = float(digits[:4]) / 100.0 if digits else 50.0
    base_price = max(10.0, min(base_price, 500.0))

    data: List[Dict[str, Any]] = []
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=int(days * 1.45))

    current = start_date
    price = base_price
    count = 0

    while count < days and current <= end_date:
        # Skip weekends (Tadawul operates Sun-Thu; Friday=4, Saturday=5)
        if current.weekday() in (4, 5):
            current += timedelta(days=1)
            continue

        change_pct = rng.gauss(0.0002, 0.015)
        price = price * (1 + change_pct)
        day_range = price * rng.uniform(0.005, 0.025)
        open_price = price + rng.uniform(-day_range / 2, day_range / 2)
        high = max(open_price, price) + rng.uniform(0, day_range / 2)
        low = min(open_price, price) - rng.uniform(0, day_range / 2)
        volume = int(rng.uniform(100_000, 20_000_000))

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


def fetch_stock_ohlcv(ticker: str, period: str = "1y") -> Dict[str, Any]:
    """Fetch OHLCV data for a single Saudi stock.

    Tries yfinance first with .SR suffix normalization.
    Falls back to stale cache or deterministic mock data.

    Args:
        ticker: Saudi stock ticker (e.g. "2222", "2222.SR").
        period: One of '1mo', '3mo', '6mo', '1y', '2y', '5y'.

    Returns:
        Dict with keys: data, source, last_updated, symbol, period, count.
    """
    symbol = _normalize_ticker(ticker)
    t_start = time.monotonic()

    # Check fresh cache first
    cached = _get_cached(symbol, period)
    if cached is not None:
        duration_ms = round((time.monotonic() - t_start) * 1000, 1)
        logger.info(
            "stock_ohlcv fetch: source=cache, cache_hit=True, "
            "fetch_duration_ms=%.1f, symbol=%s, period=%s",
            duration_ms,
            symbol,
            period,
        )
        return cached

    # Serialize yfinance fetches per ticker (different tickers fetch concurrently)
    with _get_ticker_lock(symbol, period):
        # Double-check cache inside the lock
        cached = _get_cached(symbol, period)
        if cached is not None:
            duration_ms = round((time.monotonic() - t_start) * 1000, 1)
            logger.info(
                "stock_ohlcv fetch: source=cache, cache_hit=True, "
                "fetch_duration_ms=%.1f, symbol=%s, period=%s",
                duration_ms,
                symbol,
                period,
            )
            return cached

        # Check circuit breaker
        if _is_circuit_open():
            logger.info(
                "stock_ohlcv fetch: circuit_breaker=open, skipping yfinance, "
                "symbol=%s, period=%s",
                symbol,
                period,
            )
        else:
            # Try yfinance
            try:
                import yfinance as yf

                yf_ticker = yf.Ticker(symbol)
                df = yf_ticker.history(period=period, auto_adjust=True)

                if df is not None and not df.empty:
                    df = df.reset_index()
                    data: List[Dict[str, Any]] = []
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
                        "last_updated": datetime.utcnow().isoformat() + "Z",
                        "symbol": symbol,
                        "period": period,
                        "count": len(data),
                    }
                    _set_cache(symbol, period, payload)
                    _record_success()
                    duration_ms = round((time.monotonic() - t_start) * 1000, 1)
                    logger.info(
                        "stock_ohlcv fetch: source=real, cache_hit=False, "
                        "fetch_duration_ms=%.1f, symbol=%s, period=%s, points=%d",
                        duration_ms,
                        symbol,
                        period,
                        len(data),
                    )
                    return payload

            except ImportError:
                logger.warning("yfinance not installed, skipping real data fetch")
            except Exception as exc:
                _record_failure()
                exc_type = type(exc).__name__
                exc_msg = str(exc)
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

    # Fallback: stale cache
    stale = _get_stale_cached(symbol, period)
    if stale is not None:
        duration_ms = round((time.monotonic() - t_start) * 1000, 1)
        logger.info(
            "stock_ohlcv fetch: source=cached, cache_hit=False, "
            "fetch_duration_ms=%.1f, symbol=%s, period=%s",
            duration_ms,
            symbol,
            period,
        )
        return stale

    # Fallback: mock data
    mock_data = _generate_mock_data(symbol, period)
    payload = {
        "data": mock_data,
        "source": "mock",
        "last_updated": datetime.utcnow().isoformat() + "Z",
        "symbol": symbol,
        "period": period,
        "count": len(mock_data),
    }
    _set_cache(symbol, period, payload)
    duration_ms = round((time.monotonic() - t_start) * 1000, 1)
    logger.info(
        "stock_ohlcv fetch: source=mock, cache_hit=False, "
        "fetch_duration_ms=%.1f, symbol=%s, period=%s, points=%d",
        duration_ms,
        period,
        symbol,
        len(mock_data),
    )
    return payload


# Convenience alias used by the verification command
get_stock_ohlcv = fetch_stock_ohlcv


def get_cache_status() -> Dict[str, Any]:
    """Return cache diagnostic information for the health endpoint."""
    if not _cache:
        return {
            "cache_status": "empty",
            "cached_tickers": 0,
            "cache_age_seconds": None,
            "last_updated": None,
        }
    entry = _cache.newest_entry()
    if entry is None:
        return {
            "cache_status": "empty",
            "cached_tickers": 0,
            "cache_age_seconds": None,
            "last_updated": None,
        }
    age = time.monotonic() - entry["fetched_at"]
    fresh = age < _cache.ttl
    return {
        "cache_status": "fresh" if fresh else "stale",
        "cached_tickers": len(_cache),
        "cache_age_seconds": round(age),
        "last_updated": entry["payload"].get("last_updated"),
    }
