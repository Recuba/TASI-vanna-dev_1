"""
Market breadth API route.

Provides advance/decline ratio and 52-week high/low counts for the TASI market.
Works with both SQLite and PostgreSQL backends.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db_helper import afetchone
from database.queries import MARKET_BREADTH
from models.api_responses import STANDARD_ERRORS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/market", tags=["market-analytics"])


class MarketBreadthResponse(BaseModel):
    advancing: int = 0
    declining: int = 0
    unchanged: int = 0
    advance_decline_ratio: Optional[float] = None
    new_52w_highs: int = 0
    new_52w_lows: int = 0


@router.get("/breadth", response_model=MarketBreadthResponse, responses=STANDARD_ERRORS)
async def get_market_breadth() -> MarketBreadthResponse:
    """Get market breadth indicators: advance/decline counts and 52-week extremes."""
    try:
        row = await afetchone(MARKET_BREADTH)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching market breadth: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    if not row:
        return MarketBreadthResponse()

    advancing = int(row["advancing"] or 0)
    declining = int(row["declining"] or 0)
    unchanged = int(row["unchanged"] or 0)

    ratio = round(advancing / declining, 2) if declining > 0 else None

    return MarketBreadthResponse(
        advancing=advancing,
        declining=declining,
        unchanged=unchanged,
        advance_decline_ratio=ratio,
        new_52w_highs=int(row["new_52w_highs"] or 0),
        new_52w_lows=int(row["new_52w_lows"] or 0),
    )
