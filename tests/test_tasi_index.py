"""
TASI Index Service Tests
========================
Unit tests for services/tasi_index.py: fetching, caching, mock data,
thread safety, and structured logging.
"""

import concurrent.futures
import time
import unittest
from unittest.mock import MagicMock, patch

import pandas as pd


class TestMockDataGenerator(unittest.TestCase):
    """Test _generate_mock_data produces reasonable TASI-range values."""

    def test_mock_data_returns_list(self):
        from services.tasi_index import _generate_mock_data

        data = _generate_mock_data("1y")
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)

    def test_mock_data_point_has_required_keys(self):
        from services.tasi_index import _generate_mock_data

        data = _generate_mock_data("1y")
        required_keys = {"time", "open", "high", "low", "close", "volume"}
        for pt in data:
            self.assertEqual(set(pt.keys()), required_keys)

    def test_mock_data_values_in_tasi_range(self):
        from services.tasi_index import _generate_mock_data

        data = _generate_mock_data("1y")
        for pt in data:
            self.assertGreater(pt["close"], 5000, "close below plausible TASI range")
            self.assertLess(pt["close"], 20000, "close above plausible TASI range")
            self.assertGreaterEqual(pt["high"], pt["low"])
            self.assertGreater(pt["volume"], 0)

    def test_mock_data_is_deterministic(self):
        from services.tasi_index import _generate_mock_data

        data_a = _generate_mock_data("1y")
        data_b = _generate_mock_data("1y")
        self.assertEqual(data_a, data_b)

    def test_mock_data_period_lengths(self):
        from services.tasi_index import _generate_mock_data

        lengths = {}
        for period, expected_days in [
            ("1mo", 22),
            ("3mo", 66),
            ("6mo", 132),
            ("1y", 252),
            ("2y", 504),
            ("5y", 1260),
        ]:
            data = _generate_mock_data(period)
            lengths[period] = len(data)
            self.assertEqual(
                len(data),
                expected_days,
                f"period={period} should have {expected_days} points",
            )

    def test_mock_data_time_format(self):
        from services.tasi_index import _generate_mock_data

        data = _generate_mock_data("1mo")
        for pt in data:
            # Should be YYYY-MM-DD
            self.assertRegex(pt["time"], r"^\d{4}-\d{2}-\d{2}$")

    def test_mock_data_unknown_period_defaults(self):
        from services.tasi_index import _generate_mock_data

        data = _generate_mock_data("99y")
        # Falls back to 252 days (the default)
        self.assertEqual(len(data), 252)


class TestFetchTasiIndex(unittest.TestCase):
    """Test fetch_tasi_index with mocked yfinance."""

    def setUp(self):
        # Clear the module-level cache before each test
        import services.tasi_index as mod

        mod._cache.clear()

    def _make_yf_dataframe(self, rows=10):
        """Build a fake yfinance-style DataFrame."""
        dates = pd.date_range("2025-01-01", periods=rows, freq="B")
        return pd.DataFrame(
            {
                "Date": dates,
                "Open": [11500 + i * 10 for i in range(rows)],
                "High": [11520 + i * 10 for i in range(rows)],
                "Low": [11480 + i * 10 for i in range(rows)],
                "Close": [11510 + i * 10 for i in range(rows)],
                "Volume": [100_000_000 + i * 1_000_000 for i in range(rows)],
            }
        ).set_index("Date")

    @patch("services.tasi_index.yf", create=True)
    def test_fetch_real_data_success(self, mock_yf):
        """yfinance returns valid data -> source='real'."""
        import services.tasi_index as mod

        # Patch the import inside the function
        fake_ticker = MagicMock()
        fake_ticker.history.return_value = self._make_yf_dataframe(5)
        mock_yf.Ticker.return_value = fake_ticker

        with patch.dict("sys.modules", {"yfinance": mock_yf}):
            result = mod.fetch_tasi_index("1y")

        self.assertEqual(result["source"], "real")
        self.assertEqual(len(result["data"]), 5)
        self.assertIn("last_updated", result)
        self.assertIn("symbol", result)
        # Verify each point has correct keys
        for pt in result["data"]:
            self.assertIn("time", pt)
            self.assertIn("close", pt)

    @patch("services.tasi_index.yf", create=True)
    def test_fetch_yfinance_exception_falls_to_mock(self, mock_yf):
        """yfinance raises -> fallback to mock data."""
        import services.tasi_index as mod

        mock_yf.Ticker.side_effect = Exception("network error")

        with patch.dict("sys.modules", {"yfinance": mock_yf}):
            result = mod.fetch_tasi_index("1mo")

        self.assertEqual(result["source"], "mock")
        self.assertGreater(len(result["data"]), 0)

    def test_fetch_yfinance_import_error_falls_to_mock(self):
        """yfinance not installed -> fallback to mock data."""
        import services.tasi_index as mod

        with patch.dict("sys.modules", {"yfinance": None}):
            result = mod.fetch_tasi_index("3mo")

        self.assertEqual(result["source"], "mock")
        self.assertGreater(len(result["data"]), 0)

    def test_cache_hit_skips_yfinance(self):
        """Second call uses cache, no yfinance fetch."""
        import services.tasi_index as mod

        # Populate cache with mock (yfinance unavailable)
        with patch.dict("sys.modules", {"yfinance": None}):
            result1 = mod.fetch_tasi_index("1y")

        # Second call should return cached data (mock cached is still source=mock)
        result2 = mod.fetch_tasi_index("1y")
        self.assertEqual(result1["data"], result2["data"])

    def test_stale_cache_fallback(self):
        """Expired cache + yfinance failure -> source='cached'."""
        import services.tasi_index as mod

        # Populate cache
        with patch.dict("sys.modules", {"yfinance": None}):
            mod.fetch_tasi_index("6mo")

        # Expire it by backdating fetched_at
        entry = mod._cache["6mo"]
        entry["fetched_at"] = time.monotonic() - (mod._CACHE_TTL + 100)

        # Mock yfinance to fail
        mock_yf = MagicMock()
        mock_yf.Ticker.side_effect = Exception("down")
        with patch.dict("sys.modules", {"yfinance": mock_yf}):
            result = mod.fetch_tasi_index("6mo")

        self.assertEqual(result["source"], "cached")

    def test_result_payload_schema(self):
        """Verify response dict has all required top-level keys."""
        import services.tasi_index as mod

        with patch.dict("sys.modules", {"yfinance": None}):
            result = mod.fetch_tasi_index("1y")

        self.assertIn("data", result)
        self.assertIn("source", result)
        self.assertIn("last_updated", result)
        self.assertIn("symbol", result)
        self.assertIsInstance(result["data"], list)

    def test_valid_periods_constant(self):
        from services.tasi_index import VALID_PERIODS

        self.assertEqual(
            VALID_PERIODS,
            ("1mo", "3mo", "6mo", "1y", "2y", "5y"),
        )


class TestCacheStatus(unittest.TestCase):
    """Test get_cache_status diagnostic function."""

    def setUp(self):
        import services.tasi_index as mod

        mod._cache.clear()

    def test_empty_cache(self):
        from services.tasi_index import get_cache_status

        info = get_cache_status()
        self.assertEqual(info["cache_status"], "empty")
        self.assertIsNone(info["cache_age_seconds"])
        self.assertIsNone(info["last_updated"])

    def test_fresh_cache(self):
        import services.tasi_index as mod
        from services.tasi_index import get_cache_status

        # Populate
        with patch.dict("sys.modules", {"yfinance": None}):
            mod.fetch_tasi_index("1y")

        info = get_cache_status()
        self.assertEqual(info["cache_status"], "fresh")
        self.assertIsNotNone(info["cache_age_seconds"])
        self.assertLessEqual(info["cache_age_seconds"], 5)
        self.assertIsNotNone(info["last_updated"])

    def test_stale_cache(self):
        import services.tasi_index as mod
        from services.tasi_index import get_cache_status

        with patch.dict("sys.modules", {"yfinance": None}):
            mod.fetch_tasi_index("1y")

        # Expire it
        mod._cache["1y"]["fetched_at"] = time.monotonic() - (mod._CACHE_TTL + 10)

        info = get_cache_status()
        self.assertEqual(info["cache_status"], "stale")
        self.assertGreater(info["cache_age_seconds"], mod._CACHE_TTL)


class TestThreadSafety(unittest.TestCase):
    """Test concurrent access to fetch_tasi_index."""

    def setUp(self):
        import services.tasi_index as mod

        mod._cache.clear()

    def test_concurrent_fetches_all_succeed(self):
        """Multiple threads calling simultaneously all get valid results."""
        import services.tasi_index as mod

        with patch.dict("sys.modules", {"yfinance": None}):
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                futures = [pool.submit(mod.fetch_tasi_index, "1y") for _ in range(16)]
                results = [f.result() for f in concurrent.futures.as_completed(futures)]

        self.assertEqual(len(results), 16)
        for r in results:
            self.assertIn(r["source"], ("mock", "cached"))
            self.assertGreater(len(r["data"]), 0)

    def test_concurrent_fetches_same_data(self):
        """All threads get the same data (deterministic mock)."""
        import services.tasi_index as mod

        with patch.dict("sys.modules", {"yfinance": None}):
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(mod.fetch_tasi_index, "3mo") for _ in range(8)]
                results = [f.result() for f in futures]

        first_data = results[0]["data"]
        for r in results[1:]:
            self.assertEqual(r["data"], first_data)


class TestStructuredLogging(unittest.TestCase):
    """Verify that fetch_tasi_index emits structured log messages."""

    def setUp(self):
        import services.tasi_index as mod

        mod._cache.clear()

    def test_log_on_cache_hit(self):
        import services.tasi_index as mod

        # Populate cache
        with patch.dict("sys.modules", {"yfinance": None}):
            mod.fetch_tasi_index("1y")

        with self.assertLogs("services.tasi_index", level="INFO") as cm:
            mod.fetch_tasi_index("1y")

        log_output = "\n".join(cm.output)
        self.assertIn("cache_hit=True", log_output)
        self.assertIn("fetch_duration_ms=", log_output)

    def test_log_on_mock_fallback(self):
        import services.tasi_index as mod

        with patch.dict("sys.modules", {"yfinance": None}):
            with self.assertLogs("services.tasi_index", level="INFO") as cm:
                mod.fetch_tasi_index("1y")

        log_output = "\n".join(cm.output)
        self.assertIn("source=mock", log_output)
        self.assertIn("cache_hit=False", log_output)


if __name__ == "__main__":
    unittest.main()
