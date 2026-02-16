"""Crypto price provider -- BTC and ETH via CoinGecko free API."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List

import httpx

from api.models.widgets import QuoteItem

logger = logging.getLogger(__name__)

_COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true"
)

_COIN_MAP = {
    "bitcoin": ("BTC", "Bitcoin"),
    "ethereum": ("ETH", "Ethereum"),
}


async def fetch_crypto() -> List[QuoteItem]:
    """Fetch BTC and ETH prices from CoinGecko. Returns empty list on error."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(_COINGECKO_URL)
            resp.raise_for_status()
            data = resp.json()

        now_iso = datetime.now(timezone.utc).isoformat()
        quotes: List[QuoteItem] = []

        for coin_id, (symbol, name) in _COIN_MAP.items():
            coin_data = data.get(coin_id)
            if not coin_data:
                continue

            price = coin_data.get("usd")
            if price is None:
                continue

            change_pct = coin_data.get("usd_24h_change")

            quotes.append(
                QuoteItem(
                    symbol=symbol,
                    name=name,
                    asset_class="crypto",
                    price=float(price),
                    currency="USD",
                    change_pct=round(change_pct, 2) if change_pct is not None else None,
                    ts_iso=now_iso,
                    source="coingecko",
                )
            )

        return quotes
    except Exception as exc:
        logger.warning("crypto provider error: %s", exc)
        return []
