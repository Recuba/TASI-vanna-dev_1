"""
Shared input validators for API route handlers.

Provides reusable validation functions and FastAPI Path/Query dependencies
for common parameters like ticker symbols and period strings.
"""

from __future__ import annotations

import re
from typing import Literal

from fastapi import HTTPException, Path, Query

# ---------------------------------------------------------------------------
# Ticker validation
# ---------------------------------------------------------------------------

# Saudi stock tickers: 4-digit number optionally followed by .SR
# Also allow ^TASI for the index
_TICKER_PATTERN = re.compile(r"^(\d{4}(\.SR)?|\^TASI)$", re.IGNORECASE)

# Max ticker length to prevent abuse (longest valid: "2222.SR" = 7 chars)
_MAX_TICKER_LENGTH = 10


def validate_ticker(ticker: str) -> str:
    """Validate and normalize a Saudi stock ticker.

    Accepts: "2222", "2222.SR", "^TASI"
    Raises HTTPException 400 for invalid formats.
    """
    stripped = ticker.strip()
    if len(stripped) > _MAX_TICKER_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Ticker too long (max {_MAX_TICKER_LENGTH} characters)",
        )
    if not _TICKER_PATTERN.match(stripped):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ticker format: '{stripped}'. Expected 4-digit number (e.g. '2222'), "
            "with optional .SR suffix, or '^TASI'.",
        )
    return stripped


def validate_ticker_list(tickers_csv: str, min_count: int = 1, max_count: int = 50) -> list[str]:
    """Validate a comma-separated list of tickers.

    Returns a list of validated ticker strings.
    Raises HTTPException 400 for invalid formats or count violations.
    """
    ticker_list = [t.strip() for t in tickers_csv.split(",") if t.strip()]
    if len(ticker_list) < min_count or len(ticker_list) > max_count:
        raise HTTPException(
            status_code=400,
            detail=f"Provide {min_count}-{max_count} tickers",
        )
    return [validate_ticker(t) for t in ticker_list]


# ---------------------------------------------------------------------------
# Period validation
# ---------------------------------------------------------------------------

# Valid periods for yfinance-backed OHLCV endpoints
VALID_OHLCV_PERIODS = frozenset(
    {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
)

# Valid period types for financial statements
VALID_PERIOD_TYPES = frozenset({"annual", "quarterly", "ttm"})

# Valid financial statement names
VALID_STATEMENT_TYPES = frozenset({"balance_sheet", "income_statement", "cash_flow"})


def validate_ohlcv_period(period: str) -> str:
    """Validate an OHLCV period string."""
    if period not in VALID_OHLCV_PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period '{period}'. Must be one of: {', '.join(sorted(VALID_OHLCV_PERIODS))}",
        )
    return period
