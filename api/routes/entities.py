"""
Entity (company/stock) API routes.

Queries the companies, market_data, valuation_metrics, and profitability_metrics
tables directly via psycopg2 for company lookup and listing.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

import psycopg2.extras

from api.dependencies import get_db_connection
from api.schemas.entities import (
    CompanyDetail,
    CompanySummary,
    EntityListResponse,
    SectorInfo,
)

router = APIRouter(prefix="/api/entities", tags=["entities"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("", response_model=EntityListResponse)
async def list_entities(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sector: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Search by ticker or name"),
) -> EntityListResponse:
    """List companies with basic market data."""
    clauses: list = []
    params: dict = {"limit": limit, "offset": offset}

    if sector:
        clauses.append("c.sector ILIKE %(sector)s")
        params["sector"] = f"%{sector}%"

    if search:
        clauses.append("(c.ticker ILIKE %(search)s OR c.short_name ILIKE %(search)s)")
        params["search"] = f"%{search}%"

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    sql = f"""
        SELECT
            c.ticker, c.short_name, c.sector, c.industry,
            m.current_price, m.market_cap,
            CASE WHEN m.previous_close > 0
                 THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
                 ELSE NULL
            END AS change_pct
        FROM companies c
        LEFT JOIN market_data m ON m.ticker = c.ticker
        {where}
        ORDER BY m.market_cap DESC NULLS LAST
        LIMIT %(limit)s OFFSET %(offset)s
    """

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    finally:
        conn.close()

    items = [
        CompanySummary(
            ticker=r["ticker"],
            short_name=r.get("short_name"),
            sector=r.get("sector"),
            industry=r.get("industry"),
            current_price=float(r["current_price"])
            if r.get("current_price") is not None
            else None,
            market_cap=float(r["market_cap"])
            if r.get("market_cap") is not None
            else None,
            change_pct=round(float(r["change_pct"]), 2)
            if r.get("change_pct") is not None
            else None,
        )
        for r in rows
    ]
    return EntityListResponse(items=items, count=len(items))


@router.get("/sectors", response_model=List[SectorInfo])
async def list_sectors() -> List[SectorInfo]:
    """Return all sectors with company counts."""
    sql = """
        SELECT sector, COUNT(*) AS company_count
        FROM companies
        WHERE sector IS NOT NULL
        GROUP BY sector
        ORDER BY company_count DESC
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    finally:
        conn.close()

    return [
        SectorInfo(sector=r["sector"], company_count=r["company_count"]) for r in rows
    ]


@router.get("/{ticker}", response_model=CompanyDetail)
async def get_entity(ticker: str) -> CompanyDetail:
    """Return detailed company information with market data, valuation, and profitability."""
    sql = """
        SELECT
            c.ticker, c.short_name, c.sector, c.industry, c.exchange, c.currency,
            m.current_price, m.previous_close, m.day_high, m.day_low,
            m.week_52_high, m.week_52_low, m.volume, m.market_cap, m.beta,
            m.avg_50d, m.avg_200d, m.avg_volume, m.shares_outstanding,
            m.pct_held_insiders, m.pct_held_institutions,
            v.trailing_pe, v.forward_pe, v.price_to_book, v.trailing_eps,
            v.price_to_sales, v.enterprise_value, v.ev_to_revenue,
            v.peg_ratio, v.forward_eps, v.book_value,
            p.roe, p.profit_margin, p.revenue_growth,
            p.roa, p.operating_margin, p.gross_margin, p.ebitda_margin,
            p.earnings_growth,
            a.recommendation, a.target_mean_price, a.analyst_count,
            a.target_high_price, a.target_low_price, a.target_median_price
        FROM companies c
        LEFT JOIN market_data m ON m.ticker = c.ticker
        LEFT JOIN valuation_metrics v ON v.ticker = c.ticker
        LEFT JOIN profitability_metrics p ON p.ticker = c.ticker
        LEFT JOIN analyst_data a ON a.ticker = c.ticker
        WHERE c.ticker = %(ticker)s
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, {"ticker": ticker})
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Company not found")

    def _f(val):
        return float(val) if val is not None else None

    def _i(val):
        return int(val) if val is not None else None

    return CompanyDetail(
        ticker=row["ticker"],
        short_name=row.get("short_name"),
        sector=row.get("sector"),
        industry=row.get("industry"),
        exchange=row.get("exchange"),
        currency=row.get("currency"),
        current_price=_f(row.get("current_price")),
        previous_close=_f(row.get("previous_close")),
        day_high=_f(row.get("day_high")),
        day_low=_f(row.get("day_low")),
        week_52_high=_f(row.get("week_52_high")),
        week_52_low=_f(row.get("week_52_low")),
        volume=_i(row.get("volume")),
        market_cap=_f(row.get("market_cap")),
        beta=_f(row.get("beta")),
        trailing_pe=_f(row.get("trailing_pe")),
        forward_pe=_f(row.get("forward_pe")),
        price_to_book=_f(row.get("price_to_book")),
        trailing_eps=_f(row.get("trailing_eps")),
        roe=_f(row.get("roe")),
        profit_margin=_f(row.get("profit_margin")),
        revenue_growth=_f(row.get("revenue_growth")),
        recommendation=row.get("recommendation"),
        target_mean_price=_f(row.get("target_mean_price")),
        analyst_count=_i(row.get("analyst_count")),
        # expanded fields
        price_to_sales=_f(row.get("price_to_sales")),
        enterprise_value=_f(row.get("enterprise_value")),
        ev_to_revenue=_f(row.get("ev_to_revenue")),
        peg_ratio=_f(row.get("peg_ratio")),
        forward_eps=_f(row.get("forward_eps")),
        book_value=_f(row.get("book_value")),
        roa=_f(row.get("roa")),
        operating_margin=_f(row.get("operating_margin")),
        gross_margin=_f(row.get("gross_margin")),
        ebitda_margin=_f(row.get("ebitda_margin")),
        earnings_growth=_f(row.get("earnings_growth")),
        avg_50d=_f(row.get("avg_50d")),
        avg_200d=_f(row.get("avg_200d")),
        avg_volume=_i(row.get("avg_volume")),
        shares_outstanding=_f(row.get("shares_outstanding")),
        pct_held_insiders=_f(row.get("pct_held_insiders")),
        pct_held_institutions=_f(row.get("pct_held_institutions")),
        target_high_price=_f(row.get("target_high_price")),
        target_low_price=_f(row.get("target_low_price")),
        target_median_price=_f(row.get("target_median_price")),
    )
