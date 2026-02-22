"""
Stock peer comparison API route.

Returns the top N companies in the same sector as the given ticker,
ranked by market cap proximity, with key comparison metrics.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.db_helper import afetchall, afetchone
from database.queries import COMPANY_EXISTS
from models.api_responses import STANDARD_ERRORS
from services.cache_utils import cache_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stocks", tags=["stock-data"])

PEER_QUERY = """
    SELECT
        c.ticker, c.short_name, c.sector,
        m.current_price, m.market_cap,
        CASE WHEN m.previous_close > 0
             THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
             ELSE NULL
        END AS change_pct,
        v.trailing_pe, v.price_to_book,
        p.roe, p.revenue_growth,
        d.dividend_yield
    FROM companies c
    LEFT JOIN market_data m ON m.ticker = c.ticker
    LEFT JOIN valuation_metrics v ON v.ticker = c.ticker
    LEFT JOIN profitability_metrics p ON p.ticker = c.ticker
    LEFT JOIN dividend_data d ON d.ticker = c.ticker
    WHERE c.sector = ? AND c.ticker != ? AND m.current_price IS NOT NULL
    ORDER BY ABS(COALESCE(m.market_cap, 0) - ?) ASC
    LIMIT ?
"""

TICKER_SECTOR_MCAP = """
    SELECT c.sector, m.market_cap
    FROM companies c
    LEFT JOIN market_data m ON m.ticker = c.ticker
    WHERE c.ticker = ?
"""


class PeerItem(BaseModel):
    ticker: str
    short_name: Optional[str] = None
    sector: Optional[str] = None
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    change_pct: Optional[float] = None
    trailing_pe: Optional[float] = None
    price_to_book: Optional[float] = None
    roe: Optional[float] = None
    revenue_growth: Optional[float] = None
    dividend_yield: Optional[float] = None


class PeersResponse(BaseModel):
    ticker: str
    sector: Optional[str] = None
    peers: List[PeerItem]
    count: int


@router.get("/{ticker}/peers", response_model=PeersResponse, responses=STANDARD_ERRORS)
@cache_response(ttl=300)
async def get_stock_peers(
    ticker: str,
    limit: int = Query(10, ge=1, le=20),
) -> PeersResponse:
    """Get peer companies in the same sector, ranked by market cap proximity."""
    try:
        exists = await afetchone(COMPANY_EXISTS, (ticker,))
        if not exists:
            raise HTTPException(status_code=404, detail=f"Company {ticker} not found")

        info = await afetchone(TICKER_SECTOR_MCAP, (ticker,))
        if not info or not info["sector"]:
            return PeersResponse(ticker=ticker, sector=None, peers=[], count=0)

        sector = info["sector"]
        mcap = float(info["market_cap"]) if info["market_cap"] else 0

        rows = await afetchall(PEER_QUERY, (sector, ticker, mcap, limit))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching peers for %s: %s", ticker, exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    peers = [
        PeerItem(
            ticker=r["ticker"],
            short_name=r.get("short_name"),
            sector=r.get("sector"),
            current_price=float(r["current_price"]) if r.get("current_price") is not None else None,
            market_cap=float(r["market_cap"]) if r.get("market_cap") is not None else None,
            change_pct=round(float(r["change_pct"]), 2) if r.get("change_pct") is not None else None,
            trailing_pe=round(float(r["trailing_pe"]), 2) if r.get("trailing_pe") is not None else None,
            price_to_book=round(float(r["price_to_book"]), 2) if r.get("price_to_book") is not None else None,
            roe=round(float(r["roe"]), 4) if r.get("roe") is not None else None,
            revenue_growth=round(float(r["revenue_growth"]), 4) if r.get("revenue_growth") is not None else None,
            dividend_yield=round(float(r["dividend_yield"]), 4) if r.get("dividend_yield") is not None else None,
        )
        for r in rows
    ]

    return PeersResponse(ticker=ticker, sector=sector, peers=peers, count=len(peers))
