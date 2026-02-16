"""
Dual-backend entity (company/stock) API routes.

Provides entity endpoints that work with both SQLite and PostgreSQL backends
via the shared ``api.db_helper`` module. Used as a fallback when the PG-specific
entities router is unavailable, or as the primary backend when DB_BACKEND=sqlite.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.db_helper import afetchall, afetchone
from database.queries import ENTITY_FULL_DETAIL, SECTOR_LIST
from models.api_responses import STANDARD_ERRORS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/entities", tags=["entities"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class CompanySummary(BaseModel):
    ticker: str
    short_name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    change_pct: Optional[float] = None


class EntityListResponse(BaseModel):
    items: List[CompanySummary]
    count: int
    total: int = 0


class SectorInfo(BaseModel):
    sector: str
    company_count: int


class CompanyFullDetail(BaseModel):
    """Full stock detail joining all available tables."""

    # companies
    ticker: str
    short_name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None
    # market_data
    current_price: Optional[float] = None
    previous_close: Optional[float] = None
    open_price: Optional[float] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None
    avg_50d: Optional[float] = None
    avg_200d: Optional[float] = None
    volume: Optional[int] = None
    avg_volume: Optional[int] = None
    beta: Optional[float] = None
    market_cap: Optional[float] = None
    shares_outstanding: Optional[float] = None
    pct_held_insiders: Optional[float] = None
    pct_held_institutions: Optional[float] = None
    # valuation_metrics
    trailing_pe: Optional[float] = None
    forward_pe: Optional[float] = None
    price_to_book: Optional[float] = None
    price_to_sales: Optional[float] = None
    enterprise_value: Optional[float] = None
    ev_to_revenue: Optional[float] = None
    ev_to_ebitda: Optional[float] = None
    peg_ratio: Optional[float] = None
    trailing_eps: Optional[float] = None
    forward_eps: Optional[float] = None
    book_value: Optional[float] = None
    # profitability_metrics
    roa: Optional[float] = None
    roe: Optional[float] = None
    profit_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    gross_margin: Optional[float] = None
    ebitda_margin: Optional[float] = None
    earnings_growth: Optional[float] = None
    revenue_growth: Optional[float] = None
    # dividend_data
    dividend_rate: Optional[float] = None
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    ex_dividend_date: Optional[str] = None
    # financial_summary
    total_revenue: Optional[float] = None
    total_debt: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    free_cashflow: Optional[float] = None
    operating_cashflow: Optional[float] = None
    ebitda: Optional[float] = None
    # analyst_data
    recommendation: Optional[str] = None
    target_mean_price: Optional[float] = None
    target_high_price: Optional[float] = None
    target_low_price: Optional[float] = None
    target_median_price: Optional[float] = None
    analyst_count: Optional[int] = None
    change_pct: Optional[float] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("", response_model=EntityListResponse, responses=STANDARD_ERRORS)
async def list_entities(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sector: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Search by ticker or name"),
) -> EntityListResponse:
    """List companies with basic market data."""
    # Always filter out stub entities with no meaningful market data
    clauses: list = ["(m.current_price IS NOT NULL OR m.market_cap IS NOT NULL)"]
    params: list = []

    if sector:
        clauses.append("c.sector LIKE ?")
        params.append(f"%{sector}%")

    if search:
        clauses.append("(c.ticker LIKE ? OR c.short_name LIKE ?)")
        params.append(f"%{search}%")
        params.append(f"%{search}%")

    where = "WHERE " + " AND ".join(clauses)

    try:
        count_row = await afetchone(
            f"""SELECT COUNT(*) AS cnt
                FROM companies c
                LEFT JOIN market_data m ON m.ticker = c.ticker
                {where}""",
            params,
        )
        total = count_row["cnt"] if count_row else 0

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
            ORDER BY m.market_cap DESC
            LIMIT ? OFFSET ?
        """
        rows = await afetchall(sql, params + [limit, offset])
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error listing entities: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    items = [
        CompanySummary(
            ticker=r["ticker"],
            short_name=r["short_name"],
            sector=r["sector"],
            industry=r["industry"],
            current_price=r["current_price"],
            market_cap=r["market_cap"],
            change_pct=round(r["change_pct"], 2)
            if r["change_pct"] is not None
            else None,
        )
        for r in rows
    ]
    return EntityListResponse(items=items, count=len(items), total=total)


@router.get("/sectors", response_model=List[SectorInfo], responses=STANDARD_ERRORS)
async def list_sectors() -> List[SectorInfo]:
    """Return all sectors with company counts (only companies with real market data)."""
    try:
        rows = await afetchall(SECTOR_LIST)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error listing sectors: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return [
        SectorInfo(sector=r["sector"], company_count=r["company_count"]) for r in rows
    ]


def _normalize_ticker(ticker: str) -> str:
    """Ensure Saudi ticker has .SR suffix.

    The database stores tickers with the .SR suffix (e.g. '2222.SR').
    Users and internal links often use just the number ('2222'), so
    we append '.SR' when the input is purely numeric.
    """
    stripped = ticker.strip()
    if stripped.isdigit():
        return f"{stripped}.SR"
    return stripped


@router.get("/{ticker}", response_model=CompanyFullDetail, responses=STANDARD_ERRORS)
async def get_entity(ticker: str) -> CompanyFullDetail:
    """Return full stock detail joining all available tables."""
    ticker = _normalize_ticker(ticker)
    try:
        row_dict = await afetchone(ENTITY_FULL_DETAIL, (ticker,))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching entity %s: %s", ticker, exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    if row_dict is None:
        raise HTTPException(status_code=404, detail="Company not found")

    def _f(val):
        return float(val) if val is not None else None

    def _i(val):
        return int(val) if val is not None else None

    return CompanyFullDetail(
        ticker=row_dict["ticker"],
        short_name=row_dict.get("short_name"),
        sector=row_dict.get("sector"),
        industry=row_dict.get("industry"),
        exchange=row_dict.get("exchange"),
        currency=row_dict.get("currency"),
        current_price=_f(row_dict.get("current_price")),
        previous_close=_f(row_dict.get("previous_close")),
        open_price=_f(row_dict.get("open_price")),
        day_high=_f(row_dict.get("day_high")),
        day_low=_f(row_dict.get("day_low")),
        week_52_high=_f(row_dict.get("week_52_high")),
        week_52_low=_f(row_dict.get("week_52_low")),
        avg_50d=_f(row_dict.get("avg_50d")),
        avg_200d=_f(row_dict.get("avg_200d")),
        volume=_i(row_dict.get("volume")),
        avg_volume=_i(row_dict.get("avg_volume")),
        beta=_f(row_dict.get("beta")),
        market_cap=_f(row_dict.get("market_cap")),
        shares_outstanding=_f(row_dict.get("shares_outstanding")),
        pct_held_insiders=_f(row_dict.get("pct_held_insiders")),
        pct_held_institutions=_f(row_dict.get("pct_held_institutions")),
        trailing_pe=_f(row_dict.get("trailing_pe")),
        forward_pe=_f(row_dict.get("forward_pe")),
        price_to_book=_f(row_dict.get("price_to_book")),
        price_to_sales=_f(row_dict.get("price_to_sales")),
        enterprise_value=_f(row_dict.get("enterprise_value")),
        ev_to_revenue=_f(row_dict.get("ev_to_revenue")),
        ev_to_ebitda=_f(row_dict.get("ev_to_ebitda")),
        peg_ratio=_f(row_dict.get("peg_ratio")),
        trailing_eps=_f(row_dict.get("trailing_eps")),
        forward_eps=_f(row_dict.get("forward_eps")),
        book_value=_f(row_dict.get("book_value")),
        roa=_f(row_dict.get("roa")),
        roe=_f(row_dict.get("roe")),
        profit_margin=_f(row_dict.get("profit_margin")),
        operating_margin=_f(row_dict.get("operating_margin")),
        gross_margin=_f(row_dict.get("gross_margin")),
        ebitda_margin=_f(row_dict.get("ebitda_margin")),
        earnings_growth=_f(row_dict.get("earnings_growth")),
        revenue_growth=_f(row_dict.get("revenue_growth")),
        dividend_rate=_f(row_dict.get("dividend_rate")),
        dividend_yield=_f(row_dict.get("dividend_yield")),
        payout_ratio=_f(row_dict.get("payout_ratio")),
        ex_dividend_date=row_dict.get("ex_dividend_date"),
        total_revenue=_f(row_dict.get("total_revenue")),
        total_debt=_f(row_dict.get("total_debt")),
        debt_to_equity=_f(row_dict.get("debt_to_equity")),
        current_ratio=_f(row_dict.get("current_ratio")),
        free_cashflow=_f(row_dict.get("free_cashflow")),
        operating_cashflow=_f(row_dict.get("operating_cashflow")),
        ebitda=_f(row_dict.get("ebitda")),
        recommendation=row_dict.get("recommendation"),
        target_mean_price=_f(row_dict.get("target_mean_price")),
        target_high_price=_f(row_dict.get("target_high_price")),
        target_low_price=_f(row_dict.get("target_low_price")),
        target_median_price=_f(row_dict.get("target_median_price")),
        analyst_count=_i(row_dict.get("analyst_count")),
        change_pct=round(_f(row_dict.get("change_pct")), 2)
        if row_dict.get("change_pct") is not None
        else None,
    )
