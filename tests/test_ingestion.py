"""
Ingestion Pipeline Tests
========================
Tests for validators, price_loader, and xbrl_processor modules.

All tests use mocked database and yfinance -- no real services required.
"""

import sys
from datetime import date
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ===========================================================================
# Validator tests
# ===========================================================================


class TestTickerValidation:
    """Tests for ingestion.validators.validate_ticker_format."""

    def test_valid_ticker_format(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format("2222.SR") is True
        assert validate_ticker_format("1010.SR") is True
        assert validate_ticker_format("4321.SR") is True

    def test_invalid_ticker_no_sr_suffix(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format("2222") is False
        assert validate_ticker_format("AAPL") is False

    def test_invalid_ticker_wrong_suffix(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format("2222.US") is False
        assert validate_ticker_format("2222.sr") is False  # case-sensitive

    def test_invalid_ticker_too_few_digits(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format("222.SR") is False
        assert validate_ticker_format("22.SR") is False

    def test_invalid_ticker_too_many_digits(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format("22222.SR") is False

    def test_invalid_ticker_non_numeric(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format("ABCD.SR") is False
        assert validate_ticker_format("2A22.SR") is False

    def test_invalid_ticker_none(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format(None) is False

    def test_invalid_ticker_number(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format(2222) is False

    def test_invalid_ticker_empty_string(self):
        from ingestion.validators import validate_ticker_format

        assert validate_ticker_format("") is False


class TestPriceDataValidation:
    """Tests for ingestion.validators.validate_price_data."""

    def _valid_df(self):
        return pd.DataFrame(
            {
                "trade_date": ["2024-01-15", "2024-01-16"],
                "open_price": [32.0, 32.5],
                "high_price": [33.0, 33.5],
                "low_price": [31.5, 32.0],
                "close_price": [32.5, 33.0],
                "volume": [1000000, 1500000],
            }
        )

    def test_valid_data_returns_no_errors(self):
        from ingestion.validators import validate_price_data

        errors = validate_price_data(self._valid_df())
        assert errors == []

    def test_missing_required_columns(self):
        from ingestion.validators import validate_price_data

        df = pd.DataFrame({"trade_date": ["2024-01-15"], "close_price": [32.5]})
        errors = validate_price_data(df)
        assert len(errors) > 0
        assert "Missing required columns" in errors[0]

    def test_negative_prices(self):
        from ingestion.validators import validate_price_data

        df = self._valid_df()
        df.loc[0, "close_price"] = -10.0
        errors = validate_price_data(df)
        assert any("negative close_price" in e for e in errors)

    def test_negative_volume(self):
        from ingestion.validators import validate_price_data

        df = self._valid_df()
        df.loc[0, "volume"] = -500
        errors = validate_price_data(df)
        assert any("negative volume" in e for e in errors)

    def test_high_less_than_low(self):
        from ingestion.validators import validate_price_data

        df = self._valid_df()
        df.loc[0, "high_price"] = 30.0
        df.loc[0, "low_price"] = 33.0
        errors = validate_price_data(df)
        assert any("high_price < low_price" in e for e in errors)

    def test_future_dates(self):
        from ingestion.validators import validate_price_data

        df = self._valid_df()
        df.loc[0, "trade_date"] = "2099-12-31"
        errors = validate_price_data(df)
        assert any("future" in e for e in errors)


class TestXBRLFactValidation:
    """Tests for ingestion.validators.validate_xbrl_fact."""

    def test_valid_fact(self):
        from ingestion.validators import validate_xbrl_fact

        fact = {
            "ticker": "2222.SR",
            "concept": "ifrs-full:Revenue",
            "value_numeric": 1500000000.0,
        }
        errors = validate_xbrl_fact(fact)
        assert errors == []

    def test_missing_ticker(self):
        from ingestion.validators import validate_xbrl_fact

        fact = {"concept": "ifrs-full:Revenue", "value_numeric": 100.0}
        errors = validate_xbrl_fact(fact)
        assert any("ticker" in e for e in errors)

    def test_missing_concept(self):
        from ingestion.validators import validate_xbrl_fact

        fact = {"ticker": "2222.SR", "value_numeric": 100.0}
        errors = validate_xbrl_fact(fact)
        assert any("concept" in e for e in errors)

    def test_invalid_ticker_format(self):
        from ingestion.validators import validate_xbrl_fact

        fact = {
            "ticker": "INVALID",
            "concept": "ifrs-full:Revenue",
            "value_numeric": 100.0,
        }
        errors = validate_xbrl_fact(fact)
        assert any("Invalid ticker format" in e for e in errors)

    def test_no_value_field(self):
        from ingestion.validators import validate_xbrl_fact

        fact = {"ticker": "2222.SR", "concept": "ifrs-full:Revenue"}
        errors = validate_xbrl_fact(fact)
        assert any("No value field" in e for e in errors)

    def test_text_value_is_valid(self):
        from ingestion.validators import validate_xbrl_fact

        fact = {
            "ticker": "2222.SR",
            "concept": "ifrs-full:EntityName",
            "value_text": "Saudi Aramco",
        }
        errors = validate_xbrl_fact(fact)
        assert errors == []

    def test_boolean_value_is_valid(self):
        from ingestion.validators import validate_xbrl_fact

        fact = {
            "ticker": "2222.SR",
            "concept": "ifrs-full:IsConsolidated",
            "value_boolean": True,
        }
        errors = validate_xbrl_fact(fact)
        assert errors == []

    def test_empty_text_value_not_valid(self):
        from ingestion.validators import validate_xbrl_fact

        fact = {
            "ticker": "2222.SR",
            "concept": "ifrs-full:EntityName",
            "value_text": "",
        }
        errors = validate_xbrl_fact(fact)
        assert any("No value field" in e for e in errors)


# ===========================================================================
# Price loader utility tests
# ===========================================================================


class TestPriceLoaderUtilities:
    """Tests for price_loader utility functions."""

    def test_normalize_columns(self):
        from ingestion.price_loader import normalize_columns

        df = pd.DataFrame(
            {
                "Date": ["2024-01-15"],
                "Open": [32.0],
                "High": [33.0],
                "Low": [31.5],
                "Close": [32.5],
                "Volume": [1000000],
            }
        )
        result = normalize_columns(df)
        assert "trade_date" in result.columns
        assert "open_price" in result.columns
        assert "close_price" in result.columns

    def test_compute_changes(self):
        from ingestion.price_loader import compute_changes

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR", "2222.SR", "2222.SR"],
                "trade_date": [date(2024, 1, 15), date(2024, 1, 16), date(2024, 1, 17)],
                "close_price": [32.0, 33.0, 32.5],
            }
        )
        result = compute_changes(df)
        assert "change_amount" in result.columns
        assert "change_pct" in result.columns
        # First row should have no change
        assert pd.isna(result.iloc[0]["change_amount"])
        # Second row: 33.0 - 32.0 = 1.0
        assert result.iloc[1]["change_amount"] == pytest.approx(1.0)
        # Third row: 32.5 - 33.0 = -0.5
        assert result.iloc[2]["change_amount"] == pytest.approx(-0.5)

    def test_compute_changes_percentage(self):
        from ingestion.price_loader import compute_changes

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR", "2222.SR"],
                "trade_date": [date(2024, 1, 15), date(2024, 1, 16)],
                "close_price": [100.0, 110.0],
            }
        )
        result = compute_changes(df)
        assert result.iloc[1]["change_pct"] == pytest.approx(10.0)

    def test_df_to_insert_tuples(self):
        from ingestion.price_loader import df_to_insert_tuples

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR"],
                "trade_date": [date(2024, 1, 15)],
                "open_price": [32.0],
                "high_price": [33.0],
                "low_price": [31.5],
                "close_price": [32.5],
                "volume": [1000000],
                "change_amount": [0.5],
                "change_pct": [1.56],
            }
        )
        tuples = df_to_insert_tuples(df)
        assert len(tuples) == 1
        assert tuples[0][0] == "2222.SR"
        assert tuples[0][1] == date(2024, 1, 15)

    def test_df_to_insert_tuples_handles_nan(self):
        from ingestion.price_loader import df_to_insert_tuples

        df = pd.DataFrame(
            {
                "ticker": ["2222.SR"],
                "trade_date": [date(2024, 1, 15)],
                "open_price": [np.nan],
                "high_price": [33.0],
                "low_price": [31.5],
                "close_price": [32.5],
                "volume": [1000000],
                "change_amount": [np.nan],
                "change_pct": [np.nan],
            }
        )
        tuples = df_to_insert_tuples(df)
        assert tuples[0][2] is None  # open_price NaN -> None
        assert tuples[0][7] is None  # change_amount NaN -> None

    def test_insert_prices_dry_run(self):
        from ingestion.price_loader import insert_prices

        rows = [
            ("2222.SR", date(2024, 1, 15), 32.0, 33.0, 31.5, 32.5, 1000000, 0.5, 1.56),
            ("2222.SR", date(2024, 1, 16), 32.5, 33.5, 32.0, 33.0, 1500000, 0.5, 1.54),
        ]
        count = insert_prices(None, rows, dry_run=True)
        assert count == 2

    def test_insert_prices_empty_rows(self):
        from ingestion.price_loader import insert_prices

        count = insert_prices(None, [], dry_run=False)
        assert count == 0


class TestPriceLoaderClass:
    """Tests for PriceLoader batch processing logic."""

    def test_price_loader_initialization(self):
        from ingestion.price_loader import PriceLoader
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=5, rate_limit_seconds=1.0)
        loader = PriceLoader(pg_conn=None, config=config, dry_run=True)

        assert loader.dry_run is True
        assert loader.config.batch_size == 5
        assert loader.stats["tickers_processed"] == 0

    def test_price_loader_load_all_requires_connection(self):
        from ingestion.price_loader import PriceLoader

        loader = PriceLoader(pg_conn=None, dry_run=True)
        with pytest.raises(RuntimeError, match="Database connection required"):
            loader.load_all_prices(from_date=date(2024, 1, 1))

    def test_price_loader_load_prices_requires_yfinance(self):
        from ingestion.price_loader import PriceLoader

        loader = PriceLoader(pg_conn=None, dry_run=True)
        with patch("ingestion.price_loader.yf", None):
            with pytest.raises(ImportError, match="yfinance"):
                loader.load_prices(["2222.SR"], from_date=date(2024, 1, 1))

    def test_price_loader_normalize_yfinance_df(self):
        from ingestion.price_loader import PriceLoader

        # Simulate yfinance output
        df = pd.DataFrame(
            {
                "Date": pd.to_datetime(["2024-01-15", "2024-01-16"]),
                "Open": [32.0, 32.5],
                "High": [33.0, 33.5],
                "Low": [31.5, 32.0],
                "Close": [32.5, 33.0],
                "Volume": [1000000, 1500000],
            }
        )

        result = PriceLoader._normalize_yfinance_df(df, "2222.SR")
        assert "ticker" in result.columns
        assert "trade_date" in result.columns
        assert "close_price" in result.columns
        assert all(result["ticker"] == "2222.SR")

    def test_price_loader_normalize_empty_df(self):
        from ingestion.price_loader import PriceLoader

        df = pd.DataFrame()
        result = PriceLoader._normalize_yfinance_df(df, "2222.SR")
        assert result.empty


# ===========================================================================
# XBRL processor tests
# ===========================================================================


class TestXBRLFact:
    """Tests for ingestion.xbrl_processor.XBRLFact dataclass."""

    def test_xbrl_fact_creation(self):
        from ingestion.xbrl_processor import XBRLFact

        fact = XBRLFact(
            ticker="2222.SR",
            concept="ifrs-full:Revenue",
            value_numeric=1500000000.0,
            unit="SAR",
        )
        assert fact.ticker == "2222.SR"
        assert fact.concept == "ifrs-full:Revenue"
        assert fact.value_numeric == 1500000000.0

    def test_xbrl_fact_content_hash_generated(self):
        from ingestion.xbrl_processor import XBRLFact

        fact = XBRLFact(
            ticker="2222.SR", concept="ifrs-full:Revenue", value_numeric=100.0
        )
        assert len(fact.content_hash) == 64  # SHA-256 hex

    def test_xbrl_fact_different_values_different_hashes(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(
            ticker="2222.SR", concept="ifrs-full:Revenue", value_numeric=100.0
        )
        f2 = XBRLFact(
            ticker="2222.SR", concept="ifrs-full:Revenue", value_numeric=200.0
        )
        assert f1.content_hash != f2.content_hash

    def test_xbrl_fact_same_values_same_hash(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(
            ticker="2222.SR", concept="ifrs-full:Revenue", value_numeric=100.0
        )
        f2 = XBRLFact(
            ticker="2222.SR", concept="ifrs-full:Revenue", value_numeric=100.0
        )
        assert f1.content_hash == f2.content_hash

    def test_xbrl_fact_to_insert_tuple(self):
        from ingestion.xbrl_processor import XBRLFact

        fact = XBRLFact(
            ticker="2222.SR",
            concept="ifrs-full:Revenue",
            value_numeric=100.0,
            unit="SAR",
            filing_id="filing-123",
        )
        t = fact.to_insert_tuple()
        assert isinstance(t, tuple)
        assert t[0] == "2222.SR"  # ticker
        assert t[1] == "filing-123"  # filing_id
        assert t[2] == "ifrs-full:Revenue"  # concept

    def test_xbrl_fact_with_period_dates(self):
        from ingestion.xbrl_processor import XBRLFact

        fact = XBRLFact(
            ticker="2222.SR",
            concept="ifrs-full:Revenue",
            value_numeric=100.0,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        assert fact.period_start == date(2024, 1, 1)
        assert fact.period_end == date(2024, 12, 31)
        assert fact.period_instant is None


class TestXBRLProcessor:
    """Tests for XBRLProcessor class."""

    def test_processor_initialization(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(
            ticker="2222.SR",
            filing_id="f-1",
            source_url="https://example.com/filing.xml",
        )
        assert proc.ticker == "2222.SR"
        assert proc.filing_id == "f-1"
        assert proc.facts == []
        assert proc.errors == []

    def test_process_filing_nonexistent_file(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_filing(Path("/nonexistent/file.xml"))
        assert facts == []
        assert len(proc.errors) > 0
        assert "not found" in proc.errors[0].lower()

    def test_process_filing_unsupported_extension(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        # Create a temp file with unsupported extension
        facts = proc.process_filing(Path("test.pdf"))
        assert facts == []
        assert any("Unsupported" in e or "not found" in e.lower() for e in proc.errors)

    def test_label_to_concept_known_label(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        concept = proc._label_to_concept("total assets", "Balance Sheet")
        assert concept == "ifrs-full:Assets"

    def test_label_to_concept_revenue(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        concept = proc._label_to_concept("revenue", "Income Statement")
        assert concept == "ifrs-full:Revenue"

    def test_label_to_concept_unknown_label(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        concept = proc._label_to_concept("some custom metric", "Balance Sheet")
        assert ":" in concept  # Should still have prefix:PascalCase format

    def test_is_arabic_detection(self):
        from ingestion.xbrl_processor import XBRLProcessor

        assert XBRLProcessor._is_arabic("مرحبا") is True
        assert XBRLProcessor._is_arabic("Hello") is False
        assert XBRLProcessor._is_arabic("Revenue مبيعات") is True
        assert XBRLProcessor._is_arabic("") is False

    def test_safe_parse_date_iso(self):
        from ingestion.xbrl_processor import XBRLProcessor

        d = XBRLProcessor._safe_parse_date("2024-12-31")
        assert d == date(2024, 12, 31)

    def test_safe_parse_date_slash(self):
        from ingestion.xbrl_processor import XBRLProcessor

        d = XBRLProcessor._safe_parse_date("31/12/2024")
        assert d == date(2024, 12, 31)

    def test_safe_parse_date_with_time(self):
        from ingestion.xbrl_processor import XBRLProcessor

        d = XBRLProcessor._safe_parse_date("2024-12-31T00:00:00")
        assert d == date(2024, 12, 31)

    def test_safe_parse_date_invalid(self):
        from ingestion.xbrl_processor import XBRLProcessor

        d = XBRLProcessor._safe_parse_date("not-a-date")
        assert d is None

    def test_parse_date_string_iso(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("2024-12-31")
        assert result is not None
        assert result["period_end"] == date(2024, 12, 31)

    def test_parse_date_string_fiscal_year(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("FY 2024")
        assert result is not None
        assert result["period_start"] == date(2024, 1, 1)
        assert result["period_end"] == date(2024, 12, 31)

    def test_parse_date_string_quarter(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("Q1 2024")
        assert result is not None
        assert result["period_end"] == date(2024, 3, 31)

    def test_parse_date_string_year_only(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("2024")
        assert result is not None
        assert result["period_start"] == date(2024, 1, 1)
        assert result["period_end"] == date(2024, 12, 31)

    def test_parse_date_string_invalid(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("not-a-date")
        assert result is None


class TestXBRLInsertFacts:
    """Tests for xbrl_processor.insert_facts."""

    def test_insert_facts_dry_run(self):
        from ingestion.xbrl_processor import XBRLFact, insert_facts

        facts = [
            XBRLFact(
                ticker="2222.SR", concept="ifrs-full:Revenue", value_numeric=100.0
            ),
            XBRLFact(ticker="2222.SR", concept="ifrs-full:Assets", value_numeric=200.0),
        ]
        count = insert_facts(None, facts, dry_run=True)
        assert count == 2

    def test_insert_facts_empty(self):
        from ingestion.xbrl_processor import insert_facts

        count = insert_facts(None, [], dry_run=False)
        assert count == 0


class TestIngestionConfig:
    """Tests for ingestion.config.IngestionConfig."""

    def test_default_config(self):
        from ingestion.config import IngestionConfig

        config = IngestionConfig()
        assert config.batch_size == 10
        assert config.rate_limit_seconds == 2.0
        assert config.max_retries == 3
        assert config.backoff_factor == 2.0

    def test_custom_config(self):
        from ingestion.config import IngestionConfig

        config = IngestionConfig(
            batch_size=5,
            rate_limit_seconds=1.0,
            max_retries=5,
            backoff_factor=3.0,
        )
        assert config.batch_size == 5
        assert config.max_retries == 5

    def test_config_repr(self):
        from ingestion.config import IngestionConfig

        config = IngestionConfig(batch_size=5)
        repr_str = repr(config)
        assert "batch_size=5" in repr_str

    @patch.dict("os.environ", {"INGESTION_BATCH_SIZE": "25"})
    def test_config_from_env(self):
        from ingestion.config import IngestionConfig

        config = IngestionConfig()
        assert config.batch_size == 25
