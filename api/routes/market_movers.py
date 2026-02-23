"""
Market movers API route.

Returns top gainers, top losers, and most active stocks from the TASI market.
Works with both SQLite and PostgreSQL backends via ``api.db_helper``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db_helper import afetchall
from services.cache_utils import cache_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/market", tags=["market-movers"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class MoverStock(BaseModel):
    ticker: str
    short_name: Optional[str] = None
    sector: Optional[str] = None
    current_price: Optional[float] = None
    change_pct: Optional[float] = None
    volume: Optional[int] = None
    market_cap: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None


class MarketMoversResponse(BaseModel):
    top_gainers: List[MoverStock]
    top_losers: List[MoverStock]
    most_active: List[MoverStock]
    timestamp: str


# ---------------------------------------------------------------------------
# SQL queries
# ---------------------------------------------------------------------------

_BASE_SELECT = """
SELECT c.ticker, c.short_name, c.sector,
       m.current_price,
       CASE WHEN m.previous_close > 0
            THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
            ELSE NULL
       END AS change_pct,
       m.volume, m.market_cap,
       m.week_52_high, m.week_52_low
FROM companies c
JOIN market_data m ON c.ticker = m.ticker
"""

_TOP_GAINERS_SQL = (
    _BASE_SELECT + "WHERE m.previous_close > 0 AND m.current_price > 0 "
    "ORDER BY change_pct DESC LIMIT 15"
)

_TOP_LOSERS_SQL = (
    _BASE_SELECT + "WHERE m.previous_close > 0 AND m.current_price > 0 "
    "ORDER BY change_pct ASC LIMIT 15"
)

_MOST_ACTIVE_SQL = (
    _BASE_SELECT + "WHERE m.volume IS NOT NULL AND m.current_price > 0 "
    "ORDER BY m.volume DESC LIMIT 15"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_mover(row: dict) -> MoverStock:
    return MoverStock(
        ticker=row["ticker"],
        short_name=row.get("short_name"),
        sector=row.get("sector"),
        current_price=float(row["current_price"])
        if row.get("current_price") is not None
        else None,
        change_pct=round(float(row["change_pct"]), 2)
        if row.get("change_pct") is not None
        else None,
        volume=int(row["volume"]) if row.get("volume") is not None else None,
        market_cap=float(row["market_cap"])
        if row.get("market_cap") is not None
        else None,
        week_52_high=float(row["week_52_high"])
        if row.get("week_52_high") is not None
        else None,
        week_52_low=float(row["week_52_low"])
        if row.get("week_52_low") is not None
        else None,
    )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.get("/movers", response_model=MarketMoversResponse)
@cache_response(ttl=60)
async def get_market_movers() -> dict:
    """Return top gainers, top losers, and most active stocks."""
    try:
        gainers_rows, losers_rows, active_rows = (
            await afetchall(_TOP_GAINERS_SQL),
            await afetchall(_TOP_LOSERS_SQL),
            await afetchall(_MOST_ACTIVE_SQL),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching market movers: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return {
        "top_gainers": [_row_to_mover(r) for r in gainers_rows],
        "top_losers": [_row_to_mover(r) for r in losers_rows],
        "most_active": [_row_to_mover(r) for r in active_rows],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
