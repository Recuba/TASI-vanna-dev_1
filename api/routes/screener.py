"""
Stock screener API route (dual-backend: SQLite + PostgreSQL).

Provides a POST endpoint for filtering stocks across multiple criteria
using the SCREENER_BASE query with dynamic parameterized WHERE clauses.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.db_helper import afetchall, afetchone
from database.queries import SCREENER_BASE
from models.api_responses import STANDARD_ERRORS
from services.cache_utils import cache_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/screener", tags=["screener"])

# Allowed sort columns to prevent SQL injection
_ALLOWED_SORT_COLUMNS = {
    "ticker", "short_name", "sector", "current_price", "change_pct",
    "market_cap", "volume", "trailing_pe", "forward_pe", "price_to_book",
    "price_to_sales", "roe", "profit_margin", "revenue_growth",
    "earnings_growth", "dividend_yield", "debt_to_equity", "current_ratio",
    "total_revenue", "target_mean_price", "analyst_count",
}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ScreenerFilters(BaseModel):
    """Filter criteria for the stock screener."""
    sector: Optional[str] = Field(None, description="Filter by sector name")
    pe_min: Optional[float] = Field(None, description="Minimum trailing P/E")
    pe_max: Optional[float] = Field(None, description="Maximum trailing P/E")
    pb_min: Optional[float] = Field(None, description="Minimum P/B ratio")
    pb_max: Optional[float] = Field(None, description="Maximum P/B ratio")
    roe_min: Optional[float] = Field(None, description="Minimum ROE")
    roe_max: Optional[float] = Field(None, description="Maximum ROE")
    dividend_yield_min: Optional[float] = Field(None, description="Minimum dividend yield")
    dividend_yield_max: Optional[float] = Field(None, description="Maximum dividend yield")
    market_cap_min: Optional[float] = Field(None, description="Minimum market cap")
    market_cap_max: Optional[float] = Field(None, description="Maximum market cap")
    revenue_growth_min: Optional[float] = Field(None, description="Minimum revenue growth")
    revenue_growth_max: Optional[float] = Field(None, description="Maximum revenue growth")
    debt_to_equity_max: Optional[float] = Field(None, description="Maximum debt-to-equity ratio")
    current_ratio_min: Optional[float] = Field(None, description="Minimum current ratio")
    recommendation: Optional[str] = Field(None, description="Analyst recommendation (buy/hold/sell)")
    sort_by: str = Field("market_cap", description="Column to sort by")
    sort_dir: str = Field("desc", description="Sort direction: asc or desc")
    limit: int = Field(50, ge=1, le=100, description="Number of results")
    offset: int = Field(0, ge=0, description="Offset for pagination")


class ScreenerItem(BaseModel):
    ticker: str
    short_name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    current_price: Optional[float] = None
    change_pct: Optional[float] = None
    market_cap: Optional[float] = None
    volume: Optional[float] = None
    trailing_pe: Optional[float] = None
    forward_pe: Optional[float] = None
    price_to_book: Optional[float] = None
    roe: Optional[float] = None
    profit_margin: Optional[float] = None
    revenue_growth: Optional[float] = None
    dividend_yield: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    total_revenue: Optional[float] = None
    recommendation: Optional[str] = None
    target_mean_price: Optional[float] = None
    analyst_count: Optional[int] = None


class ScreenerResponse(BaseModel):
    items: List[ScreenerItem] = []
    total_count: int = 0
    filters_applied: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Filter builder
# ---------------------------------------------------------------------------


def _build_where_clauses(filters: ScreenerFilters) -> tuple[str, list]:
    """Build parameterized WHERE clauses from filter criteria.

    Returns (sql_fragment, params) where sql_fragment starts with ' AND ...'
    and params is a list of values for '?' placeholders.
    """
    clauses: list[str] = []
    params: list[Any] = []

    if filters.sector:
        clauses.append("c.sector = ?")
        params.append(filters.sector)

    if filters.pe_min is not None:
        clauses.append("v.trailing_pe >= ?")
        params.append(filters.pe_min)
    if filters.pe_max is not None:
        clauses.append("v.trailing_pe <= ?")
        params.append(filters.pe_max)

    if filters.pb_min is not None:
        clauses.append("v.price_to_book >= ?")
        params.append(filters.pb_min)
    if filters.pb_max is not None:
        clauses.append("v.price_to_book <= ?")
        params.append(filters.pb_max)

    if filters.roe_min is not None:
        clauses.append("p.roe >= ?")
        params.append(filters.roe_min)
    if filters.roe_max is not None:
        clauses.append("p.roe <= ?")
        params.append(filters.roe_max)

    if filters.dividend_yield_min is not None:
        clauses.append("d.dividend_yield >= ?")
        params.append(filters.dividend_yield_min)
    if filters.dividend_yield_max is not None:
        clauses.append("d.dividend_yield <= ?")
        params.append(filters.dividend_yield_max)

    if filters.market_cap_min is not None:
        clauses.append("m.market_cap >= ?")
        params.append(filters.market_cap_min)
    if filters.market_cap_max is not None:
        clauses.append("m.market_cap <= ?")
        params.append(filters.market_cap_max)

    if filters.revenue_growth_min is not None:
        clauses.append("p.revenue_growth >= ?")
        params.append(filters.revenue_growth_min)
    if filters.revenue_growth_max is not None:
        clauses.append("p.revenue_growth <= ?")
        params.append(filters.revenue_growth_max)

    if filters.debt_to_equity_max is not None:
        clauses.append("f.debt_to_equity <= ?")
        params.append(filters.debt_to_equity_max)

    if filters.current_ratio_min is not None:
        clauses.append("f.current_ratio >= ?")
        params.append(filters.current_ratio_min)

    if filters.recommendation:
        clauses.append("LOWER(a.recommendation) = LOWER(?)")
        params.append(filters.recommendation)

    sql = ""
    if clauses:
        sql = " AND " + " AND ".join(clauses)

    return sql, params


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("/search", response_model=ScreenerResponse, responses=STANDARD_ERRORS)
async def search_stocks(filters: ScreenerFilters) -> ScreenerResponse:
    """Search and filter stocks using multiple criteria."""

    # Validate sort column
    sort_by = filters.sort_by if filters.sort_by in _ALLOWED_SORT_COLUMNS else "market_cap"
    sort_dir = "ASC" if filters.sort_dir.lower() == "asc" else "DESC"

    where_sql, where_params = _build_where_clauses(filters)

    # Count query
    count_sql = f"SELECT COUNT(*) as cnt FROM ({SCREENER_BASE}{where_sql}) sub"  # nosec B608
    count_row = await afetchone(count_sql, tuple(where_params))
    total_count = count_row["cnt"] if count_row else 0

    # Data query with sort and pagination
    # sort_by is validated against _ALLOWED_SORT_COLUMNS whitelist above.
    data_sql = (
        f"{SCREENER_BASE}{where_sql}"
        f" ORDER BY {sort_by} {sort_dir} NULLS LAST"
        f" LIMIT ? OFFSET ?"
    )
    data_params = tuple(where_params) + (filters.limit, filters.offset)

    rows = await afetchall(data_sql, data_params)

    items = []
    for r in rows:
        items.append(ScreenerItem(
            ticker=r["ticker"],
            short_name=r.get("short_name"),
            sector=r.get("sector"),
            industry=r.get("industry"),
            current_price=r.get("current_price"),
            change_pct=round(r["change_pct"], 2) if r.get("change_pct") is not None else None,
            market_cap=r.get("market_cap"),
            volume=r.get("volume"),
            trailing_pe=r.get("trailing_pe"),
            forward_pe=r.get("forward_pe"),
            price_to_book=r.get("price_to_book"),
            roe=r.get("roe"),
            profit_margin=r.get("profit_margin"),
            revenue_growth=r.get("revenue_growth"),
            dividend_yield=r.get("dividend_yield"),
            debt_to_equity=r.get("debt_to_equity"),
            current_ratio=r.get("current_ratio"),
            total_revenue=r.get("total_revenue"),
            recommendation=r.get("recommendation"),
            target_mean_price=r.get("target_mean_price"),
            analyst_count=int(r["analyst_count"]) if r.get("analyst_count") is not None else None,
        ))

    # Build applied filters summary
    filters_applied: Dict[str, Any] = {}
    filter_dict = filters.model_dump(exclude={"sort_by", "sort_dir", "limit", "offset"})
    for k, v in filter_dict.items():
        if v is not None:
            filters_applied[k] = v

    return ScreenerResponse(
        items=items,
        total_count=total_count,
        filters_applied=filters_applied,
    )
