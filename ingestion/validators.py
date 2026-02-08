"""
Ingestion data validators.

Validation functions for price data, XBRL facts, and ticker formats
used by the ingestion pipeline before database insertion.
"""

import re
from datetime import date

import pandas as pd

# Saudi stock tickers: 4 digits + .SR (e.g., 2222.SR, 1010.SR)
TICKER_PATTERN = re.compile(r"^\d{4}\.SR$")

PRICE_REQUIRED_COLUMNS = {
    "trade_date",
    "open_price",
    "high_price",
    "low_price",
    "close_price",
    "volume",
}

XBRL_REQUIRED_FIELDS = {"ticker", "concept"}


def validate_ticker_format(ticker: str) -> bool:
    """Check that a ticker follows the ####.SR format for Saudi stocks.

    Args:
        ticker: Ticker string to validate.

    Returns:
        True if valid, False otherwise.
    """
    if not isinstance(ticker, str):
        return False
    return bool(TICKER_PATTERN.match(ticker))


def validate_price_data(df: pd.DataFrame) -> list[str]:
    """Validate a price DataFrame before insertion.

    Checks:
    - Required columns present
    - No future dates
    - Price values are non-negative where present
    - Volume is non-negative where present
    - high >= low where both are present

    Args:
        df: DataFrame with price data.

    Returns:
        List of error strings. Empty list means valid.
    """
    errors = []

    # Check required columns
    missing = PRICE_REQUIRED_COLUMNS - set(df.columns)
    if missing:
        errors.append(f"Missing required columns: {sorted(missing)}")
        return errors  # Can't validate further without columns

    # Check for future dates
    today = date.today()
    if "trade_date" in df.columns:
        trade_dates = pd.to_datetime(df["trade_date"], errors="coerce").dt.date
        future_mask = trade_dates > today
        future_count = future_mask.sum()
        if future_count > 0:
            errors.append(f"{future_count} rows have future trade_date values")

    # Check non-negative prices
    for col in ["open_price", "high_price", "low_price", "close_price"]:
        if col in df.columns:
            numeric_vals = pd.to_numeric(df[col], errors="coerce")
            neg_count = (numeric_vals < 0).sum()
            if neg_count > 0:
                errors.append(f"{neg_count} rows have negative {col}")

    # Check non-negative volume
    if "volume" in df.columns:
        numeric_vol = pd.to_numeric(df["volume"], errors="coerce")
        neg_vol = (numeric_vol < 0).sum()
        if neg_vol > 0:
            errors.append(f"{neg_vol} rows have negative volume")

    # Check high >= low
    if "high_price" in df.columns and "low_price" in df.columns:
        high = pd.to_numeric(df["high_price"], errors="coerce")
        low = pd.to_numeric(df["low_price"], errors="coerce")
        both_valid = high.notna() & low.notna()
        invalid = (high[both_valid] < low[both_valid]).sum()
        if invalid > 0:
            errors.append(f"{invalid} rows have high_price < low_price")

    return errors


def validate_xbrl_fact(fact_dict: dict) -> list[str]:
    """Validate an XBRL fact dictionary before insertion.

    Checks:
    - Required fields present and non-empty
    - At least one value field is set (numeric, text, or boolean)
    - Ticker format is valid

    Args:
        fact_dict: Dictionary with XBRL fact fields.

    Returns:
        List of error strings. Empty list means valid.
    """
    errors = []

    # Check required fields
    for field_name in XBRL_REQUIRED_FIELDS:
        if field_name not in fact_dict or not fact_dict[field_name]:
            errors.append(f"Missing required field: {field_name}")

    # Check ticker format if present
    ticker = fact_dict.get("ticker", "")
    if ticker and not validate_ticker_format(ticker):
        errors.append(f"Invalid ticker format: {ticker} (expected ####.SR)")

    # Check at least one value field
    has_value = any(
        [
            fact_dict.get("value_numeric") is not None,
            fact_dict.get("value_text") is not None
            and fact_dict.get("value_text") != "",
            fact_dict.get("value_boolean") is not None,
        ]
    )
    if not has_value:
        errors.append(
            "No value field set (need value_numeric, value_text, or value_boolean)"
        )

    return errors
