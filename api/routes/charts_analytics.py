"""
Dual-backend chart analytics API routes.

Queries either SQLite (local dev) or PostgreSQL (Railway/Docker) depending on
the DB_BACKEND environment variable.  Connection handling and parameter
conversion are delegated to ``api.db_helper``.

Endpoints match the frontend PreBuiltCharts.tsx expectations:
  - /api/charts/sector-market-cap
  - /api/charts/top-companies
  - /api/charts/sector-pe
  - /api/charts/dividend-yield-top
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from api.db_helper import afetchall
from database.queries import DIVIDEND_YIELD_TOP, SECTOR_AVG_PE, SECTOR_MARKET_CAP
from models.api_responses import (
    STANDARD_ERRORS,
    ChartDataPointResponse as ChartDataPoint,
    ChartDataResponse as ChartResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/charts", tags=["charts-analytics"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "/sector-market-cap", response_model=ChartResponse, responses=STANDARD_ERRORS
)
async def sector_market_cap() -> ChartResponse:
    """Return total market cap by sector for a pie/bar chart."""
    try:
        rows = await afetchall(SECTOR_MARKET_CAP)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching sector market cap: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return ChartResponse(
        chart_type="bar",
        title="Market Cap by Sector (SAR)",
        data=[ChartDataPoint(label=r["label"], value=float(r["value"])) for r in rows],
    )


@router.get("/top-companies", response_model=ChartResponse, responses=STANDARD_ERRORS)
async def top_companies_by_market_cap(
    limit: int = Query(10, ge=1, le=50),
    sector: Optional[str] = Query(None),
) -> ChartResponse:
    """Return top N companies by market cap."""
    clauses = ["m.market_cap IS NOT NULL"]
    params: list = []

    if sector:
        clauses.append("c.sector LIKE ?")
        params.append(f"%{sector}%")

    where = "WHERE " + " AND ".join(clauses)

    sql = f"""
        SELECT c.short_name AS label, m.market_cap AS value
        FROM companies c
        JOIN market_data m ON m.ticker = c.ticker
        {where}
        ORDER BY m.market_cap DESC
        LIMIT ?
    """
    params.append(limit)

    try:
        rows = await afetchall(sql, params)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching top companies: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return ChartResponse(
        chart_type="bar",
        title="Top Companies by Market Cap (SAR)",
        data=[
            ChartDataPoint(
                label=r["label"] or "Unknown",
                value=float(r["value"]),
            )
            for r in rows
        ],
    )


@router.get("/sector-pe", response_model=ChartResponse, responses=STANDARD_ERRORS)
async def sector_avg_pe() -> ChartResponse:
    """Return average trailing P/E ratio by sector."""
    try:
        rows = await afetchall(SECTOR_AVG_PE)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching sector PE: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return ChartResponse(
        chart_type="bar",
        title="Average P/E Ratio by Sector",
        data=[
            ChartDataPoint(label=r["label"], value=round(float(r["value"]), 2))
            for r in rows
        ],
    )


@router.get(
    "/dividend-yield-top", response_model=ChartResponse, responses=STANDARD_ERRORS
)
async def top_dividend_yields(
    limit: int = Query(15, ge=1, le=50),
) -> ChartResponse:
    """Return top N companies by dividend yield."""
    try:
        rows = await afetchall(DIVIDEND_YIELD_TOP, (limit,))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching dividend yields: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return ChartResponse(
        chart_type="bar",
        title="Top Dividend Yields (%)",
        data=[
            ChartDataPoint(
                label=r["label"] or "Unknown",
                value=round(float(r["value"]), 2),
            )
            for r in rows
        ],
    )
