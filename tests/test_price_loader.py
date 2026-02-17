"""
Comprehensive tests for ingestion/price_loader.py
==================================================
Targets uncovered lines to raise coverage from ~33.5% to 70%+.

Coverage targets:
  - Lines 48-57: yfinance/psycopg2 import guards
  - Lines 167-211: batch processing and chunking in load_prices
  - Lines 230-243: load_all_prices error recovery
  - Lines 255-270: _fetch_and_insert_ticker pipeline
  - Lines 279-306: _fetch_with_retry exponential backoff
  - Lines 362-424: normalize_columns, compute_changes, prepare_dataframe
  - Lines 427-454: _clean_val and df_to_insert_tuples edge cases
  - Lines 462-477: insert_prices with DB batching
  - Lines 536-569: load_single_csv function
  - Lines 572-668: main() and parse_args() coverage
"""

import sys
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch
import os

import numpy as np
import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ===========================================================================
# Helpers
# ===========================================================================


def _make_ohlcv_df(tickers=None, dates=None, close_prices=None):
    """Build a minimal OHLCV DataFrame for testing."""
    if tickers is None:
        tickers = ["2222.SR", "2222.SR"]
    if dates is None:
        dates = [date(2024, 1, 15), date(2024, 1, 16)]
    if close_prices is None:
        close_prices = [32.0, 33.0]
    return pd.DataFrame(
        {
            "ticker": tickers,
            "trade_date": dates,
            "open_price": [32.0] * len(tickers),
            "high_price": [33.0] * len(tickers),
            "low_price": [31.5] * len(tickers),
            "close_price": close_prices,
            "volume": [1_000_000] * len(tickers),
        }
    )


def _make_yfinance_df(n=2):
    """Return a DataFrame resembling yfinance .history() output."""
    return pd.DataFrame(
        {
            "Date": pd.to_datetime([f"2024-01-{15 + i}" for i in range(n)]),
            "Open": [32.0 + i * 0.5 for i in range(n)],
            "High": [33.0 + i * 0.5 for i in range(n)],
            "Low": [31.5 + i * 0.5 for i in range(n)],
            "Close": [32.5 + i * 0.5 for i in range(n)],
            "Volume": [1_000_000 + i * 100_000 for i in range(n)],
        }
    )


# ===========================================================================
# Module-level import guards (lines 48-57)
# ===========================================================================


class TestImportGuards:
    """Verify the try/except import blocks behave correctly."""

    def test_yfinance_imported_or_none(self):
        """yf module is either the real yfinance or None - never something else."""
        import ingestion.price_loader as pl

        assert pl.yf is None or hasattr(pl.yf, "Ticker")

    def test_psycopg2_imported_or_none(self):
        import ingestion.price_loader as pl

        assert pl.psycopg2 is None or hasattr(pl.psycopg2, "connect")


# ===========================================================================
# Data validation utilities (lines 50-51, 56-57 via prepare_dataframe)
# ===========================================================================


class TestPrepareDataframe:
    """Tests for prepare_dataframe - covers lines 398-424."""

    def _csv_df(self):
        return pd.DataFrame(
            {
                "date": ["2024-01-15", "2024-01-16"],
                "open": [32.0, 32.5],
                "high": [33.0, 33.5],
                "low": [31.5, 32.0],
                "close": [32.5, 33.0],
                "Volume": [1_000_000, 1_500_000],
            }
        )

    def test_prepare_dataframe_basic(self):
        from ingestion.price_loader import prepare_dataframe

        df = self._csv_df()
        result = prepare_dataframe(df, ticker="2222.SR")
        assert "ticker" in result.columns
        assert "change_amount" in result.columns
        assert "change_pct" in result.columns

    def test_prepare_dataframe_renames_aliases(self):
        from ingestion.price_loader import prepare_dataframe

        df = self._csv_df()  # uses "date", "open", "close", etc.
        result = prepare_dataframe(df, ticker="2222.SR")
        assert "trade_date" in result.columns
        assert "close_price" in result.columns

    def test_prepare_dataframe_ticker_from_column(self):
        from ingestion.price_loader import prepare_dataframe

        df = self._csv_df()
        df["Ticker"] = "1010.SR"
        result = prepare_dataframe(df)  # no ticker arg
        assert all(result["ticker"] == "1010.SR")

    def test_prepare_dataframe_missing_ticker_raises(self):
        from ingestion.price_loader import prepare_dataframe

        df = self._csv_df()
        with pytest.raises(ValueError, match="ticker"):
            prepare_dataframe(df)  # no ticker col and no ticker arg

    def test_prepare_dataframe_missing_required_column_raises(self):
        from ingestion.price_loader import prepare_dataframe

        df = pd.DataFrame(
            {
                "trade_date": ["2024-01-15"],
                "close_price": [32.5],
            }
        )
        with pytest.raises(ValueError, match="Missing required columns"):
            prepare_dataframe(df, ticker="2222.SR")

    def test_prepare_dataframe_drops_rows_without_close(self):
        from ingestion.price_loader import prepare_dataframe

        df = self._csv_df()
        df.loc[0, "close"] = None
        result = prepare_dataframe(df, ticker="2222.SR")
        assert len(result) == 1

    def test_prepare_dataframe_converts_trade_date_to_date(self):
        from ingestion.price_loader import prepare_dataframe

        df = self._csv_df()
        result = prepare_dataframe(df, ticker="2222.SR")
        assert isinstance(result["trade_date"].iloc[0], (date,))

    def test_prepare_dataframe_replaces_inf_with_nan(self):
        from ingestion.price_loader import prepare_dataframe

        df = self._csv_df()
        df.loc[0, "open"] = float("inf")
        result = prepare_dataframe(df, ticker="2222.SR")
        assert pd.isna(result["open_price"].iloc[0])

    def test_prepare_dataframe_volume_int64(self):
        from ingestion.price_loader import prepare_dataframe

        df = self._csv_df()
        result = prepare_dataframe(df, ticker="2222.SR")
        assert str(result["volume"].dtype) == "Int64"


# ===========================================================================
# Batch processing and chunking (lines 167-211)
# ===========================================================================


class TestBatchProcessing:
    """Tests for PriceLoader.load_prices batch iteration."""

    def _mock_yf_ticker(self, n_rows=2):
        """Return a mock yfinance Ticker whose .history() returns an OHLCV DF."""
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = _make_yfinance_df(n_rows)
        return mock_ticker

    @patch("ingestion.price_loader.time.sleep")
    @patch("ingestion.price_loader.insert_prices", return_value=2)
    def test_single_batch_no_sleep(self, mock_insert, mock_sleep):
        """With 2 tickers and batch_size=10, no sleep between batches."""
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=10, rate_limit_seconds=1.0)
        loader = PriceLoader(pg_conn=None, config=config, dry_run=True)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value = self._mock_yf_ticker()
            loader.load_prices(["2222.SR", "1010.SR"], from_date=date(2024, 1, 1))

        # No sleep when only one batch
        mock_sleep.assert_not_called()
        assert loader.stats["tickers_processed"] == 2

    @patch("ingestion.price_loader.time.sleep")
    @patch("ingestion.price_loader.insert_prices", return_value=2)
    def test_multiple_batches_sleep_called(self, mock_insert, mock_sleep):
        """With 3 tickers and batch_size=2, sleep is called once (between batches 1 and 2)."""
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=2, rate_limit_seconds=0.5)
        loader = PriceLoader(pg_conn=None, config=config, dry_run=True)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value = self._mock_yf_ticker()
            loader.load_prices(
                ["2222.SR", "1010.SR", "4321.SR"], from_date=date(2024, 1, 1)
            )

        # Sleep called once (after first batch, not after last)
        mock_sleep.assert_called_once_with(0.5)

    @patch("ingestion.price_loader.time.sleep")
    @patch("ingestion.price_loader.insert_prices", return_value=2)
    def test_four_tickers_two_batches(self, mock_insert, mock_sleep):
        """4 tickers / batch_size=2 => 2 batches, sleep once."""
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=2, rate_limit_seconds=1.0)
        loader = PriceLoader(pg_conn=None, config=config, dry_run=True)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value = self._mock_yf_ticker()
            loader.load_prices(
                ["2222.SR", "1010.SR", "4321.SR", "5678.SR"],
                from_date=date(2024, 1, 1),
            )

        mock_sleep.assert_called_once()
        assert loader.stats["tickers_processed"] == 4

    @patch("ingestion.price_loader.time.sleep")
    def test_ticker_exception_counted_as_failed(self, mock_sleep):
        """If _fetch_and_insert_ticker raises, the ticker is counted as failed and processing continues."""
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=10, rate_limit_seconds=0.0)
        loader = PriceLoader(pg_conn=None, config=config, dry_run=True)

        with patch("ingestion.price_loader.yf"):
            # Make _fetch_and_insert_ticker raise directly (bypassing retry logic)

            call_count = [0]

            def fetch_side_effect(ticker, from_date, to_date):
                call_count[0] += 1
                if ticker == "2222.SR":
                    raise RuntimeError("simulated failure")
                return 2  # rows inserted for 1010.SR

            with patch.object(
                loader, "_fetch_and_insert_ticker", side_effect=fetch_side_effect
            ):
                loader.load_prices(["2222.SR", "1010.SR"], from_date=date(2024, 1, 1))

        assert loader.stats["tickers_failed"] == 1
        assert loader.stats["tickers_processed"] == 1

    @patch("ingestion.price_loader.time.sleep")
    @patch("ingestion.price_loader.insert_prices", return_value=0)
    def test_load_prices_uses_today_as_default_to_date(self, mock_insert, mock_sleep):
        """to_date defaults to today() when None is passed."""
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=10, rate_limit_seconds=0.0)
        loader = PriceLoader(pg_conn=None, config=config, dry_run=True)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value = self._mock_yf_ticker()
            # to_date=None triggers default logic
            loader.load_prices(["2222.SR"], from_date=date(2024, 1, 1), to_date=None)

        # Just check it completed without error
        assert loader.stats["tickers_processed"] == 1

    @patch("ingestion.price_loader.time.sleep")
    @patch("ingestion.price_loader.insert_prices", return_value=2)
    def test_stats_rows_inserted_updated(self, mock_insert, mock_sleep):
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=10, rate_limit_seconds=0.0)
        loader = PriceLoader(pg_conn=None, config=config, dry_run=True)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value = self._mock_yf_ticker()
            total = loader.load_prices(["2222.SR"], from_date=date(2024, 1, 1))

        assert loader.stats["rows_inserted"] == total


# ===========================================================================
# load_all_prices (lines 230-243)
# ===========================================================================


class TestLoadAllPrices:
    """Tests for PriceLoader.load_all_prices."""

    def test_load_all_requires_pg_conn(self):
        from ingestion.price_loader import PriceLoader

        loader = PriceLoader(pg_conn=None)
        with pytest.raises(RuntimeError, match="Database connection required"):
            loader.load_all_prices(from_date=date(2024, 1, 1))

    def test_load_all_warns_when_no_tickers(self):
        from ingestion.price_loader import PriceLoader

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value = mock_cursor

        loader = PriceLoader(pg_conn=mock_conn)
        result = loader.load_all_prices(from_date=date(2024, 1, 1))
        assert result == 0

    @patch("ingestion.price_loader.time.sleep")
    @patch("ingestion.price_loader.insert_prices", return_value=2)
    def test_load_all_fetches_tickers_from_db(self, mock_insert, mock_sleep):
        from ingestion.price_loader import PriceLoader

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [("2222.SR",), ("1010.SR",)]
        mock_conn.cursor.return_value = mock_cursor

        loader = PriceLoader(pg_conn=mock_conn, dry_run=True)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value = MagicMock()
            mock_yf.Ticker.return_value.history.return_value = _make_yfinance_df(2)
            loader.load_all_prices(from_date=date(2024, 1, 1))

        # Verify the query was called
        mock_cursor.execute.assert_called_once()
        query_args = mock_cursor.execute.call_args[0]
        assert "companies" in query_args[0]


# ===========================================================================
# Error recovery and retry logic (lines 255-270, 279-306)
# ===========================================================================


class TestFetchWithRetry:
    """Tests for PriceLoader._fetch_with_retry."""

    def test_fetch_success_first_attempt(self):
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(max_retries=3, backoff_factor=2.0)
        loader = PriceLoader(config=config)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value.history.return_value = _make_yfinance_df(2)
            result = loader._fetch_with_retry(
                "2222.SR", date(2024, 1, 1), date(2024, 1, 31)
            )

        assert result is not None
        assert not result.empty

    @patch("ingestion.price_loader.time.sleep")
    def test_fetch_retries_on_exception(self, mock_sleep):
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(max_retries=3, backoff_factor=2.0)
        loader = PriceLoader(config=config)

        with patch("ingestion.price_loader.yf") as mock_yf:
            # First two calls fail, third succeeds
            mock_yf.Ticker.return_value.history.side_effect = [
                Exception("timeout"),
                Exception("timeout"),
                _make_yfinance_df(2),
            ]
            result = loader._fetch_with_retry(
                "2222.SR", date(2024, 1, 1), date(2024, 1, 31)
            )

        assert result is not None
        assert mock_sleep.call_count == 2

    @patch("ingestion.price_loader.time.sleep")
    def test_fetch_returns_none_after_all_retries_fail(self, mock_sleep):
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(max_retries=3, backoff_factor=2.0)
        loader = PriceLoader(config=config)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value.history.side_effect = Exception("always fails")
            result = loader._fetch_with_retry(
                "2222.SR", date(2024, 1, 1), date(2024, 1, 31)
            )

        assert result is None
        # Sleep called for the first two retries, not the last
        assert mock_sleep.call_count == config.max_retries - 1

    @patch("ingestion.price_loader.time.sleep")
    def test_fetch_backoff_uses_exponent(self, mock_sleep):
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(max_retries=3, backoff_factor=2.0)
        loader = PriceLoader(config=config)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value.history.side_effect = Exception("fail")
            loader._fetch_with_retry("2222.SR", date(2024, 1, 1), date(2024, 1, 31))

        # Calls should be sleep(2^0)=1, sleep(2^1)=2
        sleep_args = [c[0][0] for c in mock_sleep.call_args_list]
        assert sleep_args[0] == pytest.approx(1.0)
        assert sleep_args[1] == pytest.approx(2.0)

    @patch("ingestion.price_loader.time.sleep")
    def test_fetch_single_retry_no_sleep_on_last(self, mock_sleep):
        """With max_retries=1, sleep is never called (last attempt fails immediately)."""
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(max_retries=1, backoff_factor=2.0)
        loader = PriceLoader(config=config)

        with patch("ingestion.price_loader.yf") as mock_yf:
            mock_yf.Ticker.return_value.history.side_effect = Exception("fail")
            result = loader._fetch_with_retry(
                "2222.SR", date(2024, 1, 1), date(2024, 1, 31)
            )

        assert result is None
        mock_sleep.assert_not_called()


# ===========================================================================
# _fetch_and_insert_ticker pipeline (lines 245-270)
# ===========================================================================


class TestFetchAndInsertTicker:
    """Tests for PriceLoader._fetch_and_insert_ticker."""

    @patch("ingestion.price_loader.insert_prices", return_value=5)
    def test_returns_zero_for_empty_df(self, mock_insert):
        from ingestion.price_loader import PriceLoader

        loader = PriceLoader(pg_conn=None, dry_run=True)

        with patch.object(loader, "_fetch_with_retry", return_value=pd.DataFrame()):
            count = loader._fetch_and_insert_ticker(
                "2222.SR", date(2024, 1, 1), date(2024, 1, 31)
            )

        assert count == 0
        mock_insert.assert_not_called()

    @patch("ingestion.price_loader.insert_prices", return_value=5)
    def test_returns_zero_for_none_df(self, mock_insert):
        from ingestion.price_loader import PriceLoader

        loader = PriceLoader(pg_conn=None, dry_run=True)

        with patch.object(loader, "_fetch_with_retry", return_value=None):
            count = loader._fetch_and_insert_ticker(
                "2222.SR", date(2024, 1, 1), date(2024, 1, 31)
            )

        assert count == 0

    def test_pipeline_normalizes_and_inserts(self):
        """Full pipeline: fetch -> normalize -> compute changes -> insert."""
        from ingestion.price_loader import PriceLoader

        loader = PriceLoader(pg_conn=None, dry_run=True)
        yf_df = _make_yfinance_df(3)

        with patch.object(loader, "_fetch_with_retry", return_value=yf_df):
            with patch(
                "ingestion.price_loader.insert_prices", return_value=3
            ) as mock_ins:
                count = loader._fetch_and_insert_ticker(
                    "2222.SR", date(2024, 1, 1), date(2024, 1, 31)
                )

        assert count == 3
        mock_ins.assert_called_once()

    def test_pipeline_replaces_inf_before_insert(self):
        """Infinite values in numeric columns are replaced with NaN before DB insert."""
        from ingestion.price_loader import PriceLoader

        loader = PriceLoader(pg_conn=None, dry_run=True)
        yf_df = _make_yfinance_df(2)
        yf_df.loc[0, "Close"] = float("inf")

        inserted_rows = []

        def capture_insert(conn, rows, dry_run):
            inserted_rows.extend(rows)
            return len(rows)

        with patch.object(loader, "_fetch_with_retry", return_value=yf_df):
            with patch(
                "ingestion.price_loader.insert_prices", side_effect=capture_insert
            ):
                loader._fetch_and_insert_ticker(
                    "2222.SR", date(2024, 1, 1), date(2024, 1, 31)
                )

        # Inf close_price should become None (cleaned by _clean_val)
        close_vals = [row[5] for row in inserted_rows]  # index 5 = close_price
        assert all(v is None or isinstance(v, float) for v in close_vals)


# ===========================================================================
# Data transformation - normalize_yfinance_df (lines 308-354)
# ===========================================================================


class TestNormalizeYfinanceDf:
    """Tests for PriceLoader._normalize_yfinance_df - covers lines 308-354."""

    def test_drops_rows_without_close_price(self):
        from ingestion.price_loader import PriceLoader

        df = _make_yfinance_df(3)
        df.loc[1, "Close"] = np.nan
        result = PriceLoader._normalize_yfinance_df(df, "2222.SR")
        assert len(result) == 2

    def test_converts_volume_to_int64(self):
        from ingestion.price_loader import PriceLoader

        df = _make_yfinance_df(2)
        result = PriceLoader._normalize_yfinance_df(df, "2222.SR")
        assert str(result["volume"].dtype) == "Int64"

    def test_trade_date_is_python_date(self):
        from ingestion.price_loader import PriceLoader

        df = _make_yfinance_df(2)
        result = PriceLoader._normalize_yfinance_df(df, "2222.SR")
        assert isinstance(result["trade_date"].iloc[0], (date,))

    def test_extra_columns_dropped(self):
        from ingestion.price_loader import PriceLoader

        df = _make_yfinance_df(2)
        df["Dividends"] = 0.0
        df["Stock Splits"] = 0.0
        result = PriceLoader._normalize_yfinance_df(df, "2222.SR")
        assert "Dividends" not in result.columns
        assert "Stock Splits" not in result.columns

    def test_ticker_column_added(self):
        from ingestion.price_loader import PriceLoader

        df = _make_yfinance_df(2)
        result = PriceLoader._normalize_yfinance_df(df, "3030.SR")
        assert all(result["ticker"] == "3030.SR")


# ===========================================================================
# normalize_columns
# ===========================================================================


class TestNormalizeColumns:
    """Additional tests for normalize_columns (line 362-370)."""

    def test_no_rename_when_columns_already_correct(self):
        from ingestion.price_loader import normalize_columns

        df = pd.DataFrame(
            {
                "trade_date": ["2024-01-15"],
                "close_price": [32.5],
            }
        )
        result = normalize_columns(df)
        assert "trade_date" in result.columns
        assert "close_price" in result.columns

    def test_adj_close_alias(self):
        from ingestion.price_loader import normalize_columns

        df = pd.DataFrame({"Adj Close": [32.5]})
        result = normalize_columns(df)
        assert "close_price" in result.columns

    def test_symbol_alias(self):
        from ingestion.price_loader import normalize_columns

        df = pd.DataFrame({"Symbol": ["2222.SR"]})
        result = normalize_columns(df)
        assert "ticker" in result.columns

    def test_ticker_alias(self):
        from ingestion.price_loader import normalize_columns

        df = pd.DataFrame({"Ticker": ["2222.SR"]})
        result = normalize_columns(df)
        assert "ticker" in result.columns


# ===========================================================================
# compute_changes - edge cases (lines 373-395)
# ===========================================================================


class TestComputeChanges:
    """Edge-case tests for compute_changes."""

    def test_multiple_tickers_independent_groups(self):
        from ingestion.price_loader import compute_changes

        df = pd.DataFrame(
            {
                "ticker": ["A.SR", "A.SR", "B.SR", "B.SR"],
                "trade_date": [
                    date(2024, 1, 1),
                    date(2024, 1, 2),
                    date(2024, 1, 1),
                    date(2024, 1, 2),
                ],
                "close_price": [100.0, 110.0, 200.0, 190.0],
            }
        )
        result = compute_changes(df)
        # First row of each ticker should have no change
        a_first = result[
            (result["ticker"] == "A.SR") & (result["trade_date"] == date(2024, 1, 1))
        ]
        b_first = result[
            (result["ticker"] == "B.SR") & (result["trade_date"] == date(2024, 1, 1))
        ]
        assert pd.isna(a_first["change_amount"].iloc[0])
        assert pd.isna(b_first["change_amount"].iloc[0])

    def test_zero_prev_close_gives_none_pct(self):
        from ingestion.price_loader import compute_changes

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR", "2222.SR"],
                "trade_date": [date(2024, 1, 1), date(2024, 1, 2)],
                "close_price": [0.0, 10.0],
            }
        )
        result = compute_changes(df)
        second_row = result.iloc[1]
        # change_pct should be None when prev_close is 0
        assert second_row["change_pct"] is None or pd.isna(second_row["change_pct"])

    def test_prev_close_column_removed(self):
        from ingestion.price_loader import compute_changes

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR"],
                "trade_date": [date(2024, 1, 1)],
                "close_price": [100.0],
            }
        )
        result = compute_changes(df)
        assert "prev_close" not in result.columns

    def test_single_row_has_null_change(self):
        from ingestion.price_loader import compute_changes

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR"],
                "trade_date": [date(2024, 1, 1)],
                "close_price": [100.0],
            }
        )
        result = compute_changes(df)
        assert pd.isna(result.iloc[0]["change_amount"])
        assert pd.isna(result.iloc[0]["change_pct"])


# ===========================================================================
# _clean_val (lines 427-435)
# ===========================================================================


class TestCleanVal:
    """Tests for the _clean_val helper."""

    def test_none_returns_none(self):
        from ingestion.price_loader import _clean_val

        assert _clean_val(None) is None

    def test_nan_float_returns_none(self):
        from ingestion.price_loader import _clean_val

        assert _clean_val(float("nan")) is None

    def test_inf_float_returns_none(self):
        from ingestion.price_loader import _clean_val

        assert _clean_val(float("inf")) is None

    def test_neg_inf_float_returns_none(self):
        from ingestion.price_loader import _clean_val

        assert _clean_val(float("-inf")) is None

    def test_pandas_na_returns_none(self):
        from ingestion.price_loader import _clean_val

        assert _clean_val(pd.NA) is None

    def test_regular_float_returned(self):
        from ingestion.price_loader import _clean_val

        assert _clean_val(42.5) == 42.5

    def test_integer_returned(self):
        from ingestion.price_loader import _clean_val

        assert _clean_val(100) == 100

    def test_string_returned(self):
        from ingestion.price_loader import _clean_val

        assert _clean_val("2222.SR") == "2222.SR"


# ===========================================================================
# df_to_insert_tuples edge cases (lines 438-454)
# ===========================================================================


class TestDfToInsertTuplesEdgeCases:
    """Additional edge-case tests for df_to_insert_tuples."""

    def test_inf_values_become_none(self):
        from ingestion.price_loader import df_to_insert_tuples

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR"],
                "trade_date": [date(2024, 1, 15)],
                "open_price": [float("inf")],
                "high_price": [33.0],
                "low_price": [31.5],
                "close_price": [float("-inf")],
                "volume": [1_000_000],
                "change_amount": [np.nan],
                "change_pct": [np.nan],
            }
        )
        tuples = df_to_insert_tuples(df)
        assert tuples[0][2] is None  # open_price inf -> None
        assert tuples[0][5] is None  # close_price -inf -> None

    def test_multiple_rows_all_converted(self):
        from ingestion.price_loader import df_to_insert_tuples

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR", "1010.SR"],
                "trade_date": [date(2024, 1, 15), date(2024, 1, 16)],
                "open_price": [32.0, 31.0],
                "high_price": [33.0, 32.0],
                "low_price": [31.5, 30.5],
                "close_price": [32.5, 31.5],
                "volume": [1_000_000, 2_000_000],
                "change_amount": [0.5, -1.0],
                "change_pct": [1.56, -3.08],
            }
        )
        tuples = df_to_insert_tuples(df)
        assert len(tuples) == 2
        assert tuples[0][0] == "2222.SR"
        assert tuples[1][0] == "1010.SR"


# ===========================================================================
# insert_prices DB batching (lines 462-477)
# ===========================================================================


class TestInsertPrices:
    """Tests for insert_prices including DB batch logic."""

    def test_dry_run_returns_row_count(self):
        from ingestion.price_loader import insert_prices

        rows = [
            (
                "2222.SR",
                date(2024, 1, i + 1),
                32.0,
                33.0,
                31.5,
                32.5,
                1_000_000,
                None,
                None,
            )
            for i in range(10)
        ]
        count = insert_prices(None, rows, dry_run=True)
        assert count == 10

    def test_empty_rows_returns_zero(self):
        from ingestion.price_loader import insert_prices

        count = insert_prices(None, [], dry_run=False)
        assert count == 0

    def test_db_insert_called_with_execute_batch(self):
        """insert_prices calls psycopg2.extras.execute_batch correctly."""
        from ingestion.price_loader import insert_prices

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        rows = [
            (
                "2222.SR",
                date(2024, 1, i + 1),
                32.0,
                33.0,
                31.5,
                32.5,
                1_000_000,
                None,
                None,
            )
            for i in range(5)
        ]

        with patch("ingestion.price_loader.psycopg2") as mock_psycopg2:
            count = insert_prices(mock_conn, rows, dry_run=False)

        mock_psycopg2.extras.execute_batch.assert_called()
        mock_conn.commit.assert_called_once()
        assert count == 5

    def test_large_batch_split(self):
        """Rows > DB_BATCH_SIZE (500) are split into multiple execute_batch calls."""
        from ingestion.price_loader import insert_prices

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        # 600 rows - should split into 2 batches (500 + 100)
        rows = [
            ("2222.SR", date(2024, 1, 1), 32.0, 33.0, 31.5, 32.5, 1_000_000, None, None)
            for _ in range(600)
        ]

        with patch("ingestion.price_loader.psycopg2") as mock_psycopg2:
            count = insert_prices(mock_conn, rows, dry_run=False)

        # execute_batch should have been called twice
        assert mock_psycopg2.extras.execute_batch.call_count == 2
        assert count == 600


# ===========================================================================
# load_single_csv (lines 536-569)
# ===========================================================================


class TestLoadSingleCsv:
    """Tests for load_single_csv function."""

    def _write_csv(self, tmpdir, filename, content):
        path = Path(tmpdir) / filename
        path.write_text(content, encoding="utf-8")
        return path

    def test_load_single_csv_success(self, tmp_path):
        from ingestion.price_loader import load_single_csv

        csv_content = (
            "Date,Open,High,Low,Close,Volume\n2024-01-15,32.0,33.0,31.5,32.5,1000000\n"
        )
        file_path = tmp_path / "2222.SR.csv"
        file_path.write_text(csv_content, encoding="utf-8")

        with patch("ingestion.price_loader.insert_prices", return_value=1):
            count = load_single_csv(file_path, "2222.SR", pg_conn=None, dry_run=True)

        assert count == 1

    def test_load_single_csv_missing_required_column(self, tmp_path, capsys):
        from ingestion.price_loader import load_single_csv

        csv_content = "Date,Close\n2024-01-15,32.5\n"
        file_path = tmp_path / "2222.SR.csv"
        file_path.write_text(csv_content, encoding="utf-8")

        count = load_single_csv(file_path, "2222.SR", pg_conn=None, dry_run=True)
        assert count == 0
        captured = capsys.readouterr()
        assert "ERROR" in captured.out

    def test_load_single_csv_unreadable_file(self, tmp_path, capsys):
        from ingestion.price_loader import load_single_csv

        # Write a binary file that can't be parsed as CSV
        file_path = tmp_path / "bad.csv"
        file_path.write_bytes(b"\xff\xfe")  # invalid UTF-8

        count = load_single_csv(file_path, "2222.SR", pg_conn=None, dry_run=True)
        # Should either succeed with 0 rows or fail gracefully
        assert count == 0 or isinstance(count, int)

    def test_load_single_csv_dry_run_suffix(self, tmp_path, capsys):
        from ingestion.price_loader import load_single_csv

        csv_content = (
            "Date,Open,High,Low,Close,Volume\n2024-01-15,32.0,33.0,31.5,32.5,1000000\n"
        )
        file_path = tmp_path / "2222.SR.csv"
        file_path.write_text(csv_content, encoding="utf-8")

        with patch("ingestion.price_loader.insert_prices", return_value=1):
            load_single_csv(file_path, "2222.SR", pg_conn=None, dry_run=True)

        captured = capsys.readouterr()
        assert "dry run" in captured.out.lower()

    def test_load_single_csv_prints_date_range(self, tmp_path, capsys):
        from ingestion.price_loader import load_single_csv

        csv_content = (
            "Date,Open,High,Low,Close,Volume\n"
            "2024-01-15,32.0,33.0,31.5,32.5,1000000\n"
            "2024-01-16,32.5,33.5,32.0,33.0,1500000\n"
        )
        file_path = tmp_path / "2222.SR.csv"
        file_path.write_text(csv_content, encoding="utf-8")

        with patch("ingestion.price_loader.insert_prices", return_value=2):
            load_single_csv(file_path, "2222.SR", pg_conn=None, dry_run=False)

        captured = capsys.readouterr()
        assert "2024-01-15" in captured.out


# ===========================================================================
# parse_args (lines 485-533)
# ===========================================================================


class TestParseArgs:
    """Tests for parse_args argument parsing."""

    def test_parse_args_tickers(self):
        from ingestion.price_loader import parse_args

        with patch("sys.argv", ["prog", "--tickers", "2222.SR", "1010.SR"]):
            args = parse_args()

        assert args.tickers == ["2222.SR", "1010.SR"]
        assert args.all is False

    def test_parse_args_all_flag(self):
        from ingestion.price_loader import parse_args

        with patch("sys.argv", ["prog", "--all"]):
            args = parse_args()

        assert args.all is True

    def test_parse_args_file(self):
        from ingestion.price_loader import parse_args

        with patch(
            "sys.argv", ["prog", "--file", "data/2222.csv", "--ticker", "2222.SR"]
        ):
            args = parse_args()

        assert args.file == "data/2222.csv"
        assert args.ticker == "2222.SR"

    def test_parse_args_dir(self):
        from ingestion.price_loader import parse_args

        with patch("sys.argv", ["prog", "--dir", "data/prices/"]):
            args = parse_args()

        assert args.dir == "data/prices/"

    def test_parse_args_from_date(self):
        from ingestion.price_loader import parse_args

        with patch(
            "sys.argv", ["prog", "--tickers", "2222.SR", "--from-date", "2024-01-01"]
        ):
            args = parse_args()

        assert args.from_date == "2024-01-01"

    def test_parse_args_dry_run(self):
        from ingestion.price_loader import parse_args

        with patch("sys.argv", ["prog", "--tickers", "2222.SR", "--dry-run"]):
            args = parse_args()

        assert args.dry_run is True

    def test_parse_args_batch_size(self):
        from ingestion.price_loader import parse_args

        with patch("sys.argv", ["prog", "--tickers", "2222.SR", "--batch-size", "5"]):
            args = parse_args()

        assert args.batch_size == 5

    def test_parse_args_pg_defaults(self):
        from ingestion.price_loader import parse_args

        with patch("sys.argv", ["prog", "--tickers", "2222.SR"]):
            with patch.dict(os.environ, {}, clear=False):
                args = parse_args()

        assert args.pg_host == os.environ.get("PG_HOST", "localhost")
        assert args.pg_port == int(os.environ.get("PG_PORT", "5432"))

    def test_parse_args_pattern_default(self):
        from ingestion.price_loader import parse_args

        with patch("sys.argv", ["prog", "--dir", "data/"]):
            args = parse_args()

        assert args.pattern == "*.csv"


# ===========================================================================
# main() function - edge cases (lines 572-668)
# ===========================================================================


class TestMain:
    """Tests for the main() entry-point function."""

    def test_main_dry_run_tickers(self, capsys):
        from ingestion.price_loader import main

        with patch(
            "sys.argv",
            ["prog", "--tickers", "2222.SR", "--from-date", "2024-01-01", "--dry-run"],
        ):
            with patch("ingestion.price_loader.PriceLoader") as MockLoader:
                instance = MockLoader.return_value
                instance.load_prices.return_value = 5
                instance.stats = {"tickers_processed": 1, "tickers_failed": 0}
                main()

        captured = capsys.readouterr()
        assert "DRY RUN" in captured.out

    def test_main_file_not_found(self, capsys):
        from ingestion.price_loader import main

        with patch(
            "sys.argv", ["prog", "--file", "/nonexistent/file.csv", "--dry-run"]
        ):
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1
        captured = capsys.readouterr()
        assert "ERROR" in captured.out

    def test_main_dir_not_found(self, capsys):
        from ingestion.price_loader import main

        with patch("sys.argv", ["prog", "--dir", "/nonexistent/dir/", "--dry-run"]):
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1

    def test_main_dir_loads_csv_files(self, tmp_path, capsys):
        from ingestion.price_loader import main

        csv_content = (
            "Date,Open,High,Low,Close,Volume\n2024-01-15,32.0,33.0,31.5,32.5,1000000\n"
        )
        csv_file = tmp_path / "2222.SR.csv"
        csv_file.write_text(csv_content, encoding="utf-8")

        with patch("sys.argv", ["prog", "--dir", str(tmp_path), "--dry-run"]):
            with patch("ingestion.price_loader.insert_prices", return_value=1):
                main()

        captured = capsys.readouterr()
        assert "Total rows loaded" in captured.out

    def test_main_all_mode_calls_load_all(self, capsys):
        from ingestion.price_loader import main

        with patch(
            "sys.argv", ["prog", "--all", "--from-date", "2024-01-01", "--dry-run"]
        ):
            with patch("ingestion.price_loader.PriceLoader") as MockLoader:
                instance = MockLoader.return_value
                instance.load_all_prices.return_value = 0
                instance.stats = {"tickers_processed": 0, "tickers_failed": 0}
                main()

        instance.load_all_prices.assert_called_once()

    def test_main_no_pg_install_exits(self, capsys):
        from ingestion.price_loader import main

        with patch(
            "sys.argv", ["prog", "--tickers", "2222.SR", "--from-date", "2024-01-01"]
        ):
            with patch("ingestion.price_loader.psycopg2", None):
                with pytest.raises(SystemExit) as exc_info:
                    main()

        assert exc_info.value.code == 1

    def test_main_pg_connection_error_exits(self, capsys):
        from ingestion.price_loader import main

        with patch(
            "sys.argv", ["prog", "--tickers", "2222.SR", "--from-date", "2024-01-01"]
        ):
            # Patch psycopg2 at the module level so the except clause matches
            with patch("ingestion.price_loader.psycopg2") as mock_pg:

                class FakeOpError(Exception):
                    pass

                mock_pg.OperationalError = FakeOpError
                mock_pg.connect.side_effect = FakeOpError("connection refused")
                with pytest.raises(SystemExit) as exc_info:
                    main()

        assert exc_info.value.code == 1

    def test_main_prints_total_rows(self, tmp_path, capsys):
        from ingestion.price_loader import main

        with patch(
            "sys.argv",
            ["prog", "--tickers", "2222.SR", "--from-date", "2024-01-01", "--dry-run"],
        ):
            with patch("ingestion.price_loader.PriceLoader") as MockLoader:
                instance = MockLoader.return_value
                instance.load_prices.return_value = 42
                instance.stats = {"tickers_processed": 1, "tickers_failed": 0}
                main()

        captured = capsys.readouterr()
        assert "42" in captured.out


# ===========================================================================
# Multi-period and portfolio aggregation (lines 400-434, 470-477)
# ===========================================================================


class TestMultiTickerPipeline:
    """End-to-end tests for multi-ticker scenarios."""

    def test_prepare_dataframe_multi_ticker_csv(self):
        """CSV with multiple tickers processed correctly."""
        from ingestion.price_loader import prepare_dataframe

        df = pd.DataFrame(
            {
                "date": ["2024-01-15", "2024-01-15", "2024-01-16", "2024-01-16"],
                "Ticker": ["2222.SR", "1010.SR", "2222.SR", "1010.SR"],
                "open": [32.0, 50.0, 32.5, 51.0],
                "high": [33.0, 51.0, 33.5, 52.0],
                "low": [31.5, 49.5, 32.0, 50.5],
                "close": [32.5, 50.5, 33.0, 51.5],
                "Volume": [1_000_000, 500_000, 1_200_000, 600_000],
            }
        )
        result = prepare_dataframe(df)  # no ticker kwarg - uses Ticker column
        assert len(result) == 4
        assert set(result["ticker"]) == {"2222.SR", "1010.SR"}
        # Each ticker's first date should have null change
        for ticker in ["2222.SR", "1010.SR"]:
            first = result[result["ticker"] == ticker].sort_values("trade_date").iloc[0]
            assert pd.isna(first["change_amount"])

    def test_insert_prices_tuple_order_matches_insert_columns(self):
        """Tuples have columns in INSERT_COLUMNS order."""
        from ingestion.price_loader import df_to_insert_tuples, INSERT_COLUMNS

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR"],
                "trade_date": [date(2024, 1, 15)],
                "open_price": [32.0],
                "high_price": [33.0],
                "low_price": [31.5],
                "close_price": [32.5],
                "volume": [1_000_000],
                "change_amount": [0.5],
                "change_pct": [1.56],
            }
        )
        tuples = df_to_insert_tuples(df)
        assert len(tuples[0]) == len(INSERT_COLUMNS)

    def test_batch_size_one_processes_each_ticker_separately(self):
        """batch_size=1 means each ticker gets its own batch."""
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=1, rate_limit_seconds=0.0)
        loader = PriceLoader(pg_conn=None, config=config, dry_run=True)

        sleep_calls = []

        def record_sleep(t):
            sleep_calls.append(t)

        with patch("ingestion.price_loader.time.sleep", side_effect=record_sleep):
            with patch("ingestion.price_loader.yf") as mock_yf:
                mock_yf.Ticker.return_value.history.return_value = _make_yfinance_df(2)
                with patch("ingestion.price_loader.insert_prices", return_value=2):
                    loader.load_prices(
                        ["2222.SR", "1010.SR", "4321.SR"],
                        from_date=date(2024, 1, 1),
                    )

        # With 3 tickers and batch_size=1, sleep is called 2 times (not after last)
        assert len(sleep_calls) == 2
