"""
Per-stock OHLCV chart data API route.

Provides OHLCV data for individual Saudi-listed stocks via yfinance
with in-memory caching, circuit breaker, and mock fallback.
Works with both SQLite and PostgreSQL backends (no database dependency).
"""

from __future__ import annotations

import logging
from typing import List, Literal

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel

from services.stock_ohlcv import (
    VALID_PERIODS,
    fetch_stock_ohlcv,
    get_cache_status,
    get_circuit_breaker_status,
)

router = APIRouter(prefix="/api/v1/charts", tags=["stock-ohlcv"])

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class StockOHLCVPoint(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class StockOHLCVResponse(BaseModel):
    data: List[StockOHLCVPoint]
    source: Literal["real", "mock", "cached"]
    last_updated: str
    symbol: str
    period: str
    count: int


class StockHealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    message: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/{ticker}/ohlcv", response_model=StockOHLCVResponse)
async def get_stock_ohlcv(
    ticker: str = Path(..., description="Stock ticker (e.g. 2222 or 2222.SR)"),
    period: str = Query("1y", description="Data period"),
) -> StockOHLCVResponse:
    """Return OHLCV data for a Saudi stock for TradingView chart rendering.

    Fetches live data from Yahoo Finance with 5-minute caching.
    Falls back to deterministic mock data if yfinance is unavailable.
    Saudi tickers get .SR suffix automatically.
    """
    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period '{period}'. Must be one of: {', '.join(VALID_PERIODS)}",
        )

    result = fetch_stock_ohlcv(ticker=ticker, period=period)

    return StockOHLCVResponse(
        data=[StockOHLCVPoint(**pt) for pt in result["data"]],
        source=result["source"],
        last_updated=result["last_updated"],
        symbol=result["symbol"],
        period=result.get("period", period),
        count=result.get("count", len(result["data"])),
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@router.get("/{ticker}/health", response_model=StockHealthResponse)
async def stock_ohlcv_health(
    ticker: str = Path(..., description="Stock ticker (e.g. 2222 or 2222.SR)"),
) -> StockHealthResponse:
    """Return health status for the per-stock OHLCV data pipeline.

    Internal diagnostics are logged server-side but not exposed to clients.
    """
    yfinance_available = True
    try:
        import yfinance as yf  # noqa: F401
    except ImportError:
        yfinance_available = False

    cache_info = get_cache_status()
    cache_status = cache_info["cache_status"]
    cb_info = get_circuit_breaker_status()

    if cb_info["circuit_state"] == "open":
        status = "degraded"
        message = "Data source temporarily unavailable; serving cached data."
    elif cache_status != "fresh" and not yfinance_available:
        status = "degraded"
        message = "Data source temporarily unavailable; serving cached data."
    else:
        status = "ok"
        message = "Stock OHLCV data pipeline operating normally."

    logger.debug(
        "stock_ohlcv health: ticker=%s, status=%s, yfinance=%s, cache=%s, "
        "cached_tickers=%s, circuit=%s, failures=%d",
        ticker, status, yfinance_available, cache_status,
        cache_info.get("cached_tickers", 0),
        cb_info["circuit_state"], cb_info["consecutive_failures"],
    )

    return StockHealthResponse(status=status, message=message)
