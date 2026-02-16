"""Precious metals provider -- Gold (XAU) and Silver (XAG) via yfinance."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import List

from api.models.widgets import QuoteItem

logger = logging.getLogger(__name__)

_TICKERS = {
    "GC=F": ("XAU", "Gold"),
    "SI=F": ("XAG", "Silver"),
}


def _fetch_metals_sync() -> List[QuoteItem]:
    """Synchronous yfinance fetch for metals."""
    import yfinance as yf

    now_iso = datetime.now(timezone.utc).isoformat()
    quotes: List[QuoteItem] = []

    for yf_ticker, (symbol, name) in _TICKERS.items():
        try:
            ticker = yf.Ticker(yf_ticker)
            info = ticker.fast_info
            price = getattr(info, "last_price", None)
            prev_close = getattr(info, "previous_close", None)

            if price is None:
                continue

            change = None
            change_pct = None
            if prev_close and prev_close > 0:
                change = round(price - prev_close, 2)
                change_pct = round((change / prev_close) * 100, 2)

            quotes.append(
                QuoteItem(
                    symbol=symbol,
                    name=name,
                    asset_class="metal",
                    price=round(price, 2),
                    currency="USD",
                    change=change,
                    change_pct=change_pct,
                    ts_iso=now_iso,
                    source="yfinance",
                )
            )
        except Exception as exc:
            logger.warning("metals provider error for %s: %s", yf_ticker, exc)

    return quotes


async def fetch_metals() -> List[QuoteItem]:
    """Fetch metals prices. Returns empty list on error."""
    try:
        return await asyncio.to_thread(_fetch_metals_sync)
    except Exception as exc:
        logger.warning("metals provider error: %s", exc)
        return []
