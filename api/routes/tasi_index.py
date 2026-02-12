"""
TASI Index chart data API route.

Provides OHLCV data for the Tadawul All Share Index (^TASI) via yfinance
with in-memory caching and mock fallback. Works with both SQLite and
PostgreSQL backends (no database dependency).
"""

from __future__ import annotations

import logging
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.tasi_index import (
    VALID_PERIODS,
    fetch_tasi_index,
    get_cache_status,
    get_circuit_breaker_status,
)

router = APIRouter(prefix="/api/v1/charts/tasi", tags=["tasi-index"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class TASIOHLCVPoint(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class TASIIndexResponse(BaseModel):
    data: List[TASIOHLCVPoint]
    source: Literal["real", "mock", "cached"]
    data_freshness: Literal["real-time", "cached", "stale", "mock"] = "real-time"
    cache_age_seconds: Optional[int] = None
    last_updated: str
    symbol: str
    period: str
    count: int


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.get("/index", response_model=TASIIndexResponse)
async def get_tasi_index(
    period: str = Query("1y", description="Data period"),
) -> TASIIndexResponse:
    """Return TASI index OHLCV data for TradingView chart rendering.

    Fetches live data from Yahoo Finance (^TASI) with 5-minute caching.
    Falls back to deterministic mock data if yfinance is unavailable.
    """
    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period '{period}'. Must be one of: {', '.join(VALID_PERIODS)}",
        )

    result = fetch_tasi_index(period=period)

    return TASIIndexResponse(
        data=[TASIOHLCVPoint(**pt) for pt in result["data"]],
        source=result["source"],
        data_freshness=result.get("data_freshness", "real-time"),
        cache_age_seconds=result.get("cache_age_seconds"),
        last_updated=result["last_updated"],
        symbol=result["symbol"],
        period=period,
        count=len(result["data"]),
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)


class TASIHealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    message: str


@router.get("/health", response_model=TASIHealthResponse)
async def tasi_health() -> TASIHealthResponse:
    """Return health status for the TASI data pipeline.

    Returns only aggregate status and a human-readable message.
    Internal diagnostics (cache state, circuit breaker, dependency
    availability) are logged server-side but not exposed to clients
    to avoid leaking infrastructure details.
    """
    yfinance_available = True
    try:
        import yfinance as yf  # noqa: F401
    except ImportError:
        yfinance_available = False

    cache_info = get_cache_status()
    cache_status = cache_info["cache_status"]
    cb_info = get_circuit_breaker_status()

    # Degraded when circuit is open, or cache is not fresh AND yfinance is unavailable
    if cb_info["circuit_state"] == "open":
        status = "degraded"
        message = "Data source temporarily unavailable; serving cached data."
    elif cache_status != "fresh" and not yfinance_available:
        status = "degraded"
        message = "Data source temporarily unavailable; serving cached data."
    else:
        status = "ok"
        message = "TASI data pipeline operating normally."

    # Full diagnostics logged server-side only
    logger.debug(
        "TASI health: status=%s, yfinance=%s, cache=%s, age=%s, "
        "circuit=%s, failures=%d",
        status,
        yfinance_available,
        cache_status,
        cache_info.get("cache_age_seconds"),
        cb_info["circuit_state"],
        cb_info["consecutive_failures"],
    )

    return TASIHealthResponse(status=status, message=message)
