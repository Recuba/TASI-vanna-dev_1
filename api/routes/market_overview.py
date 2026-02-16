"""
Market Overview API route for the World 360 page.

Provides real-time prices, daily change, sparkline data (30-day),
and historical closes (90-day) for 10 global instruments via yfinance.
Works with any backend (no database dependency).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.cache_utils import cache_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/market-overview", tags=["market-overview"])

# ---------------------------------------------------------------------------
# Instrument definitions
# ---------------------------------------------------------------------------

INSTRUMENTS: Dict[str, Dict[str, str]] = {
    "BTC": {
        "ticker": "BTC-USD",
        "nameAr": "\u0628\u064a\u062a\u0643\u0648\u064a\u0646",
        "nameEn": "Bitcoin",
        "category": "Crypto",
    },
    "GOLD": {
        "ticker": "GC=F",
        "nameAr": "\u0627\u0644\u0630\u0647\u0628",
        "nameEn": "Gold",
        "category": "Commodity",
    },
    "SILVER": {
        "ticker": "SI=F",
        "nameAr": "\u0627\u0644\u0641\u0636\u0629",
        "nameEn": "Silver",
        "category": "Commodity",
    },
    "WTI": {
        "ticker": "CL=F",
        "nameAr": "\u0646\u0641\u0637 \u062e\u0627\u0645 (WTI)",
        "nameEn": "WTI Oil",
        "category": "Energy",
    },
    "BRENT": {
        "ticker": "BZ=F",
        "nameAr": "\u0646\u0641\u0637 \u0628\u0631\u0646\u062a",
        "nameEn": "Brent Crude",
        "category": "Energy",
    },
    "SPX": {
        "ticker": "^GSPC",
        "nameAr": "\u0625\u0633 \u0622\u0646\u062f \u0628\u064a 500",
        "nameEn": "S&P 500",
        "category": "US Index",
    },
    "NASDAQ": {
        "ticker": "^IXIC",
        "nameAr": "\u0646\u0627\u0633\u062f\u0627\u0643",
        "nameEn": "NASDAQ",
        "category": "US Index",
    },
    "DJI": {
        "ticker": "^DJI",
        "nameAr": "\u062f\u0627\u0648 \u062c\u0648\u0646\u0632",
        "nameEn": "Dow Jones",
        "category": "US Index",
    },
    "RUT": {
        "ticker": "^RUT",
        "nameAr": "\u0631\u0627\u0633\u0644 2000",
        "nameEn": "Russell 2000",
        "category": "US Index",
    },
    "TASI": {
        "ticker": "^TASI.SR",
        "nameAr": "\u062a\u0627\u0633\u064a",
        "nameEn": "TASI Index",
        "category": "Saudi",
    },
}


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class InstrumentData(BaseModel):
    """Data for a single instrument."""

    key: str
    ticker: str
    nameAr: str
    nameEn: str
    category: str
    value: Optional[float] = None
    change: Optional[float] = None
    sparkline: List[float] = []
    historical_closes: List[float] = []
    currency: str = "USD"
    error: Optional[str] = None


class MarketOverviewResponse(BaseModel):
    """Response from the market overview endpoint."""

    instruments: List[InstrumentData]
    timestamp: str
    count: int


# ---------------------------------------------------------------------------
# yfinance data fetcher (synchronous -- called via asyncio.to_thread)
# ---------------------------------------------------------------------------


def _fetch_instrument_sync(symbol: str, info: Dict[str, str]) -> dict:
    """Fetch price, change, and historical data for one instrument.

    This is a synchronous function meant to be called via asyncio.to_thread().
    """
    try:
        import yfinance as yf

        tkr = yf.Ticker(info["ticker"])

        # Fetch 90 days of daily history (covers both sparkline and correlation)
        hist = tkr.history(period="90d", interval="1d", auto_adjust=True, timeout=10)

        if hist is None or hist.empty:
            return {
                "key": symbol,
                "ticker": info["ticker"],
                "nameAr": info["nameAr"],
                "nameEn": info["nameEn"],
                "category": info["category"],
                "error": "No data returned from yfinance",
            }

        closes = hist["Close"].dropna().tolist()

        # Current price: last close
        price = closes[-1] if closes else None

        # Daily change %: compare last two closes
        change_pct = None
        if len(closes) >= 2:
            prev = closes[-2]
            if prev != 0:
                change_pct = round(((closes[-1] - prev) / prev) * 100, 2)

        # Sparkline: last 30 closes
        sparkline = closes[-30:] if len(closes) >= 30 else closes

        # Determine currency from ticker info
        currency = "USD"
        if info["ticker"].endswith(".SR"):
            currency = "SAR"

        return {
            "key": symbol,
            "ticker": info["ticker"],
            "nameAr": info["nameAr"],
            "nameEn": info["nameEn"],
            "category": info["category"],
            "value": round(price, 4) if price is not None else None,
            "change": change_pct,
            "sparkline": [round(c, 4) for c in sparkline],
            "historical_closes": [round(c, 4) for c in closes],
            "currency": currency,
        }

    except ImportError:
        return {
            "key": symbol,
            "ticker": info["ticker"],
            "nameAr": info["nameAr"],
            "nameEn": info["nameEn"],
            "category": info["category"],
            "error": "yfinance not installed",
        }
    except Exception as exc:
        logger.warning("Failed to fetch %s (%s): %s", symbol, info["ticker"], exc)
        return {
            "key": symbol,
            "ticker": info["ticker"],
            "nameAr": info["nameAr"],
            "nameEn": info["nameEn"],
            "category": info["category"],
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.get("", response_model=MarketOverviewResponse)
@cache_response(ttl=60)
async def get_market_overview() -> dict:
    """Return live prices for 10 global instruments with sparkline and historical data.

    Data is cached for 60 seconds. Each instrument fetch runs concurrently
    via asyncio.to_thread to avoid blocking the event loop.
    """
    tasks = [
        asyncio.to_thread(_fetch_instrument_sync, symbol, info)
        for symbol, info in INSTRUMENTS.items()
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    instruments = []
    for result in results:
        if isinstance(result, Exception):
            logger.warning("Instrument fetch raised exception: %s", result)
            continue
        instruments.append(result)

    return {
        "instruments": instruments,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": len(instruments),
    }
