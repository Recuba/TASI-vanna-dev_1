"""
Tests for services/stock_ohlcv.py

Covers:
- Ticker normalization
- Mock data generation (determinism, period mapping, weekday filtering)
- Cache helpers (fresh hit, stale fallback)
- Circuit breaker helpers (open/closed, record failure/success)
- fetch_stock_ohlcv: real data path, empty DataFrame, circuit-open fallback,
  exception fallback, stale-cache fallback, mock fallback
- get_cache_status
- get_circuit_breaker_status
- _get_ticker_lock (lock creation, LRU eviction at MAX_LOCKS)
"""

import sys
import time
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ---------------------------------------------------------------------------
# Module-level imports (after path setup)
# ---------------------------------------------------------------------------
import services.stock_ohlcv as ohlcv_mod  # noqa: E402
from services.stock_ohlcv import (  # noqa: E402
    _normalize_ticker,
    _generate_mock_data,
    _get_ticker_lock,
    _get_cached,
    _get_stale_cached,
    _set_cache,
    _is_circuit_open,
    _record_failure,
    _record_success,
    fetch_stock_ohlcv,
    get_stock_ohlcv,
    get_cache_status,
    get_circuit_breaker_status,
    VALID_PERIODS,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_ohlcv_df(n_rows: int = 5) -> pd.DataFrame:
    """Return a minimal OHLCV DataFrame with realistic columns and DatetimeIndex."""
    dates = pd.date_range(start="2024-01-01", periods=n_rows, freq="B")
    df = pd.DataFrame(
        {
            "Open": [100.0 + i for i in range(n_rows)],
            "High": [105.0 + i for i in range(n_rows)],
            "Low": [95.0 + i for i in range(n_rows)],
            "Close": [102.0 + i for i in range(n_rows)],
            "Volume": [1_000_000 + i * 10_000 for i in range(n_rows)],
        },
        index=dates,
    )
    df.index.name = "Date"
    return df


@pytest.fixture(autouse=True)
def _reset_module_state():
    """Reset the module-level cache, circuit breaker, and lock dict before each test."""
    ohlcv_mod._cache.clear()

    # Reset circuit breaker by patching internal state directly
    ohlcv_mod._breaker._consecutive_failures = 0
    ohlcv_mod._breaker._open_until = 0.0

    # Clear the ticker locks dict
    with ohlcv_mod._locks_guard:
        ohlcv_mod._ticker_locks.clear()

    yield


# ===========================================================================
# 1. Ticker normalization
# ===========================================================================


class TestNormalizeTicker:
    def test_plain_number_gets_sr_suffix(self):
        assert _normalize_ticker("2222") == "2222.SR"

    def test_already_has_sr_not_duplicated(self):
        assert _normalize_ticker("2222.SR") == "2222.SR"

    def test_lowercase_sr_uppercased(self):
        assert _normalize_ticker("2222.sr") == "2222.SR"

    def test_whitespace_stripped(self):
        assert _normalize_ticker("  1120  ") == "1120.SR"

    def test_mixed_case_ticker(self):
        assert _normalize_ticker("sabic") == "SABIC.SR"

    def test_already_uppercase_with_sr(self):
        assert _normalize_ticker("ARAMCO.SR") == "ARAMCO.SR"


# ===========================================================================
# 2. VALID_PERIODS constant
# ===========================================================================


class TestValidPeriods:
    def test_contains_expected_periods(self):
        for p in ("1mo", "3mo", "6mo", "1y", "2y", "5y"):
            assert p in VALID_PERIODS


# ===========================================================================
# 3. Mock data generation
# ===========================================================================


class TestGenerateMockData:
    def test_returns_list_of_dicts(self):
        data = _generate_mock_data("2222.SR", "1y")
        assert isinstance(data, list)
        assert len(data) > 0

    def test_each_entry_has_required_keys(self):
        data = _generate_mock_data("2222.SR", "1mo")
        for entry in data:
            assert set(entry.keys()) == {
                "time",
                "open",
                "high",
                "low",
                "close",
                "volume",
            }

    def test_1mo_produces_about_22_entries(self):
        data = _generate_mock_data("2222.SR", "1mo")
        assert 15 <= len(data) <= 30

    def test_1y_produces_about_252_entries(self):
        data = _generate_mock_data("2222.SR", "1y")
        assert 200 <= len(data) <= 300

    def test_5y_produces_more_entries_than_1y(self):
        data_1y = _generate_mock_data("2222.SR", "1y")
        data_5y = _generate_mock_data("2222.SR", "5y")
        assert len(data_5y) > len(data_1y)

    def test_deterministic_same_ticker(self):
        d1 = _generate_mock_data("2222.SR", "1y")
        d2 = _generate_mock_data("2222.SR", "1y")
        assert d1 == d2

    def test_different_tickers_produce_different_data(self):
        d1 = _generate_mock_data("2222.SR", "1y")
        d2 = _generate_mock_data("1120.SR", "1y")
        # At least prices differ
        assert d1[0]["close"] != d2[0]["close"]

    def test_no_friday_or_saturday_entries(self):
        data = _generate_mock_data("2222.SR", "1y")
        for entry in data:
            dt = datetime.fromisoformat(entry["time"]).date()
            # Friday=4, Saturday=5 in Python's weekday()
            assert dt.weekday() not in (4, 5), f"Weekend date found: {entry['time']}"

    def test_high_always_gte_low(self):
        data = _generate_mock_data("2222.SR", "3mo")
        for entry in data:
            assert entry["high"] >= entry["low"]

    def test_volume_is_positive_int(self):
        data = _generate_mock_data("2222.SR", "1mo")
        for entry in data:
            assert isinstance(entry["volume"], int)
            assert entry["volume"] > 0

    def test_unknown_period_defaults_to_252_days(self):
        data = _generate_mock_data("2222.SR", "unknown_period")
        assert 200 <= len(data) <= 300

    def test_time_field_is_valid_date_string(self):
        data = _generate_mock_data("2222.SR", "1mo")
        for entry in data:
            # Should parse without exception
            datetime.fromisoformat(entry["time"])


# ===========================================================================
# 4. Cache helpers
# ===========================================================================


class TestCacheHelpers:
    def test_cache_miss_returns_none(self):
        assert _get_cached("9999.SR", "1y") is None

    def test_set_then_get_returns_payload(self):
        payload = {"data": [], "source": "real", "symbol": "9999.SR", "period": "1y"}
        _set_cache("9999.SR", "1y", payload)
        result = _get_cached("9999.SR", "1y")
        assert result == payload

    def test_stale_cache_returns_none_when_empty(self):
        assert _get_stale_cached("9999.SR", "1y") is None

    def test_stale_cache_returns_payload_with_source_cached(self):
        payload = {"data": [], "source": "real", "symbol": "9999.SR", "period": "1y"}
        _set_cache("9999.SR", "1y", payload)

        # Manually age the entry by patching fetched_at
        key = ("9999.SR", "1y")
        with ohlcv_mod._cache._lock:
            ohlcv_mod._cache._store[key]["fetched_at"] = time.monotonic() - 9999

        stale = _get_stale_cached("9999.SR", "1y")
        assert stale is not None
        assert stale["source"] == "cached"

    def test_fresh_cache_not_treated_as_stale(self):
        payload = {"data": [], "source": "real", "symbol": "9999.SR", "period": "1y"}
        _set_cache("9999.SR", "1y", payload)
        # Fresh cache should still return the payload (not None)
        fresh = _get_cached("9999.SR", "1y")
        assert fresh is not None


# ===========================================================================
# 5. Circuit breaker helpers
# ===========================================================================


class TestCircuitBreakerHelpers:
    def test_initially_closed(self):
        assert not _is_circuit_open()

    def test_open_after_threshold_failures(self):
        threshold = ohlcv_mod._breaker._threshold
        for _ in range(threshold):
            _record_failure()
        assert _is_circuit_open()

    def test_success_resets_circuit(self):
        threshold = ohlcv_mod._breaker._threshold
        for _ in range(threshold):
            _record_failure()
        assert _is_circuit_open()
        _record_success()
        assert not _is_circuit_open()

    def test_get_circuit_breaker_status_returns_dict(self):
        status = get_circuit_breaker_status()
        assert "circuit_state" in status
        assert "consecutive_failures" in status
        assert status["circuit_state"] == "closed"

    def test_circuit_status_open_when_tripped(self):
        threshold = ohlcv_mod._breaker._threshold
        for _ in range(threshold):
            _record_failure()
        status = get_circuit_breaker_status()
        assert status["circuit_state"] == "open"


# ===========================================================================
# 6. Ticker lock helpers
# ===========================================================================


class TestGetTickerLock:
    def test_returns_lock_object(self):
        lock = _get_ticker_lock("2222.SR", "1y")
        # threading.Lock() returns an instance of _thread.lock; check via acquire/release
        assert hasattr(lock, "acquire") and hasattr(lock, "release")

    def test_same_key_returns_same_lock(self):
        lock1 = _get_ticker_lock("2222.SR", "1y")
        lock2 = _get_ticker_lock("2222.SR", "1y")
        assert lock1 is lock2

    def test_different_key_returns_different_lock(self):
        lock1 = _get_ticker_lock("2222.SR", "1y")
        lock2 = _get_ticker_lock("1120.SR", "1y")
        assert lock1 is not lock2

    def test_evicts_oldest_at_max_locks(self):
        max_locks = ohlcv_mod._MAX_LOCKS
        # Fill to capacity
        for i in range(max_locks):
            _get_ticker_lock(f"T{i:04d}.SR", "1y")

        with ohlcv_mod._locks_guard:
            assert len(ohlcv_mod._ticker_locks) == max_locks

        # Adding one more should evict the oldest
        _get_ticker_lock("OVERFLOW.SR", "1y")
        with ohlcv_mod._locks_guard:
            assert len(ohlcv_mod._ticker_locks) == max_locks
            assert "T0000.SR:1y" not in ohlcv_mod._ticker_locks


# ===========================================================================
# 7. fetch_stock_ohlcv — real data path (yfinance success)
# ===========================================================================


class TestFetchStockOhlcvRealData:
    def test_returns_real_source_when_yfinance_succeeds(self):
        df = _make_ohlcv_df(5)

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["source"] == "real"
        assert result["symbol"] == "2222.SR"
        assert result["period"] == "1y"
        assert result["count"] == 5
        assert len(result["data"]) == 5

    def test_ohlcv_fields_present_in_each_row(self):
        df = _make_ohlcv_df(3)
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("2222", "1y")

        for row in result["data"]:
            assert set(row.keys()) == {"time", "open", "high", "low", "close", "volume"}

    def test_ticker_normalized_to_sr_suffix(self):
        df = _make_ohlcv_df(2)
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df

        with patch("yfinance.Ticker") as mock_yf_cls:
            mock_yf_cls.return_value = mock_ticker
            result = fetch_stock_ohlcv("2222", "1y")
            # Verify that yfinance was called with .SR suffix
            mock_yf_cls.assert_called_once_with("2222.SR")

        assert result["symbol"] == "2222.SR"

    def test_result_stored_in_cache(self):
        df = _make_ohlcv_df(3)
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df

        with patch("yfinance.Ticker", return_value=mock_ticker):
            fetch_stock_ohlcv("2222", "1y")

        cached = _get_cached("2222.SR", "1y")
        assert cached is not None
        assert cached["source"] == "real"

    def test_last_updated_is_utc_isoformat(self):
        df = _make_ohlcv_df(2)
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["last_updated"].endswith("Z")

    def test_volume_zero_when_none_in_df(self):
        df = _make_ohlcv_df(2)
        df["Volume"] = None  # Simulate missing volume
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("2222", "1y")

        for row in result["data"]:
            assert row["volume"] == 0


# ===========================================================================
# 8. fetch_stock_ohlcv — cache hit path
# ===========================================================================


class TestFetchStockOhlcvCacheHit:
    def test_cache_hit_returns_cached_payload_without_calling_yfinance(self):
        payload = {
            "data": [
                {
                    "time": "2024-01-01",
                    "open": 1,
                    "high": 1,
                    "low": 1,
                    "close": 1,
                    "volume": 1,
                }
            ],
            "source": "real",
            "last_updated": "2024-01-01T00:00:00Z",
            "symbol": "2222.SR",
            "period": "1y",
            "count": 1,
        }
        _set_cache("2222.SR", "1y", payload)

        with patch("yfinance.Ticker") as mock_yf_cls:
            result = fetch_stock_ohlcv("2222", "1y")
            mock_yf_cls.assert_not_called()

        assert result == payload


# ===========================================================================
# 9. fetch_stock_ohlcv — empty DataFrame falls through to mock
# ===========================================================================


class TestFetchStockOhlcvEmptyDataFrame:
    def test_empty_df_falls_back_to_mock(self):
        empty_df = pd.DataFrame()
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = empty_df

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["source"] == "mock"

    def test_none_df_falls_back_to_mock(self):
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = None

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["source"] == "mock"


# ===========================================================================
# 10. fetch_stock_ohlcv — circuit breaker open path
# ===========================================================================


class TestFetchStockOhlcvCircuitOpen:
    def test_open_circuit_skips_yfinance_returns_mock(self):
        # Trip the circuit breaker
        threshold = ohlcv_mod._breaker._threshold
        for _ in range(threshold):
            _record_failure()

        assert _is_circuit_open()

        with patch("yfinance.Ticker") as mock_yf_cls:
            result = fetch_stock_ohlcv("2222", "1y")
            mock_yf_cls.assert_not_called()

        # Should be mock (no stale cache)
        assert result["source"] == "mock"

    def test_open_circuit_returns_stale_cache_if_available(self):
        # Pre-populate stale cache
        old_payload = {
            "data": [
                {
                    "time": "2023-01-01",
                    "open": 50,
                    "high": 55,
                    "low": 48,
                    "close": 52,
                    "volume": 100,
                }
            ],
            "source": "real",
            "last_updated": "2023-01-01T00:00:00Z",
            "symbol": "2222.SR",
            "period": "1y",
            "count": 1,
        }
        _set_cache("2222.SR", "1y", old_payload)
        # Age the entry
        key = ("2222.SR", "1y")
        with ohlcv_mod._cache._lock:
            ohlcv_mod._cache._store[key]["fetched_at"] = time.monotonic() - 9999

        # Trip circuit breaker
        threshold = ohlcv_mod._breaker._threshold
        for _ in range(threshold):
            _record_failure()

        result = fetch_stock_ohlcv("2222", "1y")
        assert result["source"] == "cached"


# ===========================================================================
# 11. fetch_stock_ohlcv — exception handling
# ===========================================================================


class TestFetchStockOhlcvExceptions:
    def test_network_error_falls_back_to_mock(self):
        with patch("yfinance.Ticker", side_effect=ConnectionError("network error")):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["source"] == "mock"

    def test_generic_exception_increments_failure_count(self):
        initial = ohlcv_mod._breaker._consecutive_failures
        with patch("yfinance.Ticker", side_effect=RuntimeError("unexpected")):
            fetch_stock_ohlcv("2222", "1y")

        assert ohlcv_mod._breaker._consecutive_failures == initial + 1

    def test_rate_limit_error_classified(self):
        """Exception with '429' in message should still fall back gracefully."""
        with patch("yfinance.Ticker", side_effect=Exception("429 rate limit exceeded")):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["source"] == "mock"

    def test_timeout_error_classified(self):
        with patch(
            "yfinance.Ticker", side_effect=Exception("timeout connecting to host")
        ):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["source"] == "mock"

    def test_stale_cache_preferred_over_mock_on_exception(self):
        # Seed stale cache
        old_payload = {
            "data": [
                {
                    "time": "2023-06-01",
                    "open": 40,
                    "high": 42,
                    "low": 39,
                    "close": 41,
                    "volume": 200,
                }
            ],
            "source": "real",
            "last_updated": "2023-06-01T00:00:00Z",
            "symbol": "2222.SR",
            "period": "1y",
            "count": 1,
        }
        _set_cache("2222.SR", "1y", old_payload)
        key = ("2222.SR", "1y")
        with ohlcv_mod._cache._lock:
            ohlcv_mod._cache._store[key]["fetched_at"] = time.monotonic() - 9999

        with patch("yfinance.Ticker", side_effect=RuntimeError("fail")):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["source"] == "cached"


# ===========================================================================
# 12. fetch_stock_ohlcv — ImportError path (yfinance not installed)
# ===========================================================================


class TestFetchStockOhlcvImportError:
    def test_import_error_falls_back_to_mock(self):
        with patch.dict("sys.modules", {"yfinance": None}):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["source"] == "mock"


# ===========================================================================
# 13. get_stock_ohlcv alias
# ===========================================================================


class TestGetStockOhlcvAlias:
    def test_alias_is_same_function(self):
        assert get_stock_ohlcv is fetch_stock_ohlcv


# ===========================================================================
# 14. get_cache_status
# ===========================================================================


class TestGetCacheStatus:
    def test_empty_cache_returns_empty_status(self):
        status = get_cache_status()
        assert status["cache_status"] == "empty"
        assert status["cached_tickers"] == 0
        assert status["cache_age_seconds"] is None

    def test_populated_cache_returns_fresh_status(self):
        payload = {
            "data": [],
            "source": "real",
            "last_updated": "2024-01-01T00:00:00Z",
            "symbol": "2222.SR",
            "period": "1y",
            "count": 0,
        }
        _set_cache("2222.SR", "1y", payload)
        status = get_cache_status()
        assert status["cache_status"] == "fresh"
        assert status["cached_tickers"] == 1
        assert status["last_updated"] == "2024-01-01T00:00:00Z"

    def test_stale_cache_entry_shows_stale_status(self):
        payload = {
            "data": [],
            "source": "real",
            "last_updated": "2023-01-01T00:00:00Z",
            "symbol": "2222.SR",
            "period": "1y",
            "count": 0,
        }
        _set_cache("2222.SR", "1y", payload)
        key = ("2222.SR", "1y")
        with ohlcv_mod._cache._lock:
            ohlcv_mod._cache._store[key]["fetched_at"] = time.monotonic() - 9999

        status = get_cache_status()
        assert status["cache_status"] == "stale"

    def test_cache_age_seconds_is_non_negative(self):
        payload = {
            "data": [],
            "source": "real",
            "last_updated": None,
            "symbol": "X.SR",
            "period": "1y",
            "count": 0,
        }
        _set_cache("X.SR", "1y", payload)
        status = get_cache_status()
        assert status["cache_age_seconds"] >= 0


# ===========================================================================
# 15. Payload structure invariants
# ===========================================================================


class TestPayloadStructure:
    def test_mock_payload_has_all_required_keys(self):
        df_empty = pd.DataFrame()
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df_empty

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("9999", "6mo")

        for key in ("data", "source", "last_updated", "symbol", "period", "count"):
            assert key in result, f"Missing key: {key}"

    def test_count_matches_len_of_data(self):
        df_empty = pd.DataFrame()
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df_empty

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("9999", "6mo")

        assert result["count"] == len(result["data"])

    def test_real_payload_count_matches_data_length(self):
        df = _make_ohlcv_df(7)
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df

        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = fetch_stock_ohlcv("2222", "1y")

        assert result["count"] == 7
        assert len(result["data"]) == 7
