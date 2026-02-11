"""
SQLite-backed entity (company/stock) API routes.

Provides the same entity endpoints as the PG-backed entities.py but queries
SQLite directly. Registered ONLY when DB_BACKEND != "postgres".
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/entities", tags=["entities"])

_HERE = Path(__file__).resolve().parent.parent.parent
_DB_PATH = str(_HERE / "saudi_stocks.db")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
    """Full stock detail joining ALL available SQLite tables."""
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

@router.get("", response_model=EntityListResponse)
async def list_entities(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sector: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Search by ticker or name"),
) -> EntityListResponse:
    """List companies with basic market data (SQLite)."""
    clauses: list = []
    params: list = []

    if sector:
        clauses.append("c.sector LIKE ?")
        params.append(f"%{sector}%")

    if search:
        clauses.append("(c.ticker LIKE ? OR c.short_name LIKE ?)")
        params.append(f"%{search}%")
        params.append(f"%{search}%")

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    conn = _get_conn()
    try:
        # Total count
        count_row = conn.execute(
            f"SELECT COUNT(*) AS cnt FROM companies c {where}", params
        ).fetchone()
        total = count_row["cnt"] if count_row else 0

        # Data
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
        rows = conn.execute(sql, params + [limit, offset]).fetchall()
    finally:
        conn.close()

    items = [
        CompanySummary(
            ticker=r["ticker"],
            short_name=r["short_name"],
            sector=r["sector"],
            industry=r["industry"],
            current_price=r["current_price"],
            market_cap=r["market_cap"],
            change_pct=round(r["change_pct"], 2) if r["change_pct"] is not None else None,
        )
        for r in rows
    ]
    return EntityListResponse(items=items, count=len(items), total=total)


@router.get("/sectors", response_model=List[SectorInfo])
async def list_sectors() -> List[SectorInfo]:
    """Return all sectors with company counts (SQLite)."""
    sql = """
        SELECT sector, COUNT(*) AS company_count
        FROM companies
        WHERE sector IS NOT NULL
        GROUP BY sector
        ORDER BY company_count DESC
    """
    conn = _get_conn()
    try:
        rows = conn.execute(sql).fetchall()
    finally:
        conn.close()

    return [SectorInfo(sector=r["sector"], company_count=r["company_count"]) for r in rows]


@router.get("/{ticker}", response_model=CompanyFullDetail)
async def get_entity(ticker: str) -> CompanyFullDetail:
    """Return full stock detail joining ALL SQLite tables."""
    sql = """
        SELECT
            c.ticker, c.short_name, c.sector, c.industry, c.exchange, c.currency,
            m.current_price, m.previous_close, m.open_price, m.day_high, m.day_low,
            m.week_52_high, m.week_52_low, m.avg_50d, m.avg_200d,
            m.volume, m.avg_volume, m.beta, m.market_cap,
            m.shares_outstanding, m.pct_held_insiders, m.pct_held_institutions,
            v.trailing_pe, v.forward_pe, v.price_to_book, v.price_to_sales,
            v.enterprise_value, v.ev_to_revenue, v.ev_to_ebitda, v.peg_ratio,
            v.trailing_eps, v.forward_eps, v.book_value,
            p.roa, p.roe, p.profit_margin, p.operating_margin,
            p.gross_margin, p.ebitda_margin, p.earnings_growth, p.revenue_growth,
            d.dividend_rate, d.dividend_yield, d.payout_ratio, d.ex_dividend_date,
            f.total_revenue, f.total_debt, f.debt_to_equity, f.current_ratio,
            f.free_cashflow, f.operating_cashflow, f.ebitda,
            a.recommendation, a.target_mean_price, a.target_high_price,
            a.target_low_price, a.target_median_price, a.analyst_count,
            CASE WHEN m.previous_close > 0
                 THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
                 ELSE NULL
            END AS change_pct
        FROM companies c
        LEFT JOIN market_data m ON m.ticker = c.ticker
        LEFT JOIN valuation_metrics v ON v.ticker = c.ticker
        LEFT JOIN profitability_metrics p ON p.ticker = c.ticker
        LEFT JOIN dividend_data d ON d.ticker = c.ticker
        LEFT JOIN financial_summary f ON f.ticker = c.ticker
        LEFT JOIN analyst_data a ON a.ticker = c.ticker
        WHERE c.ticker = ?
    """
    conn = _get_conn()
    try:
        row = conn.execute(sql, (ticker,)).fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Company not found")

    row_dict = dict(row)

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
        change_pct=round(_f(row_dict.get("change_pct")), 2) if row_dict.get("change_pct") is not None else None,
    )
