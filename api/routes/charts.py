"""
Chart data API routes.

Provides pre-built data endpoints for frontend charting (sector breakdown,
top companies by market cap, etc.). The frontend renders charts via
TradingView Lightweight Charts or Plotly.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Query

import psycopg2.extras

from api.dependencies import get_db_connection
from api.schemas.charts import ChartDataPoint, ChartResponse

router = APIRouter(prefix="/api/charts", tags=["charts"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("/sector-market-cap", response_model=ChartResponse)
async def sector_market_cap() -> ChartResponse:
    """Return total market cap by sector for a pie/bar chart."""
    sql = """
        SELECT c.sector AS label, SUM(m.market_cap) AS value
        FROM companies c
        JOIN market_data m ON m.ticker = c.ticker
        WHERE c.sector IS NOT NULL AND m.market_cap IS NOT NULL
        GROUP BY c.sector
        ORDER BY value DESC
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    finally:
        conn.close()

    return ChartResponse(
        chart_type="bar",
        title="Market Cap by Sector (SAR)",
        data=[ChartDataPoint(label=r["label"], value=float(r["value"])) for r in rows],
    )


@router.get("/top-companies", response_model=ChartResponse)
async def top_companies_by_market_cap(
    limit: int = Query(10, ge=1, le=50),
    sector: Optional[str] = Query(None),
) -> ChartResponse:
    """Return top N companies by market cap."""
    clauses = ["m.market_cap IS NOT NULL"]
    params: Dict[str, Any] = {"limit": limit}

    if sector:
        clauses.append("c.sector ILIKE %(sector)s")
        params["sector"] = f"%{sector}%"

    where = "WHERE " + " AND ".join(clauses)

    sql = f"""
        SELECT c.short_name AS label, m.market_cap AS value
        FROM companies c
        JOIN market_data m ON m.ticker = c.ticker
        {where}
        ORDER BY m.market_cap DESC
        LIMIT %(limit)s
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    finally:
        conn.close()

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


@router.get("/sector-pe", response_model=ChartResponse)
async def sector_avg_pe() -> ChartResponse:
    """Return average trailing P/E ratio by sector."""
    sql = """
        SELECT c.sector AS label, AVG(v.trailing_pe) AS value
        FROM companies c
        JOIN valuation_metrics v ON v.ticker = c.ticker
        WHERE c.sector IS NOT NULL AND v.trailing_pe IS NOT NULL
            AND v.trailing_pe > 0 AND v.trailing_pe < 200
        GROUP BY c.sector
        ORDER BY value DESC
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    finally:
        conn.close()

    return ChartResponse(
        chart_type="bar",
        title="Average P/E Ratio by Sector",
        data=[
            ChartDataPoint(label=r["label"], value=round(float(r["value"]), 2))
            for r in rows
        ],
    )


@router.get("/dividend-yield-top", response_model=ChartResponse)
async def top_dividend_yields(
    limit: int = Query(15, ge=1, le=50),
) -> ChartResponse:
    """Return top N companies by dividend yield."""
    sql = """
        SELECT c.short_name AS label, d.dividend_yield * 100 AS value
        FROM companies c
        JOIN dividend_data d ON d.ticker = c.ticker
        WHERE d.dividend_yield IS NOT NULL AND d.dividend_yield > 0
        ORDER BY d.dividend_yield DESC
        LIMIT %(limit)s
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, {"limit": limit})
            rows = cur.fetchall()
    finally:
        conn.close()

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
