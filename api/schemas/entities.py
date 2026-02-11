"""Pydantic schemas for entity (company/stock) endpoints."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class CompanySummary(BaseModel):
    """Brief company summary for list views."""

    ticker: str
    short_name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    change_pct: Optional[float] = None


class CompanyDetail(BaseModel):
    """Full company detail with market data, valuation, and profitability."""

    ticker: str
    short_name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None
    current_price: Optional[float] = None
    previous_close: Optional[float] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None
    volume: Optional[int] = None
    market_cap: Optional[float] = None
    beta: Optional[float] = None
    trailing_pe: Optional[float] = None
    forward_pe: Optional[float] = None
    price_to_book: Optional[float] = None
    trailing_eps: Optional[float] = None
    roe: Optional[float] = None
    profit_margin: Optional[float] = None
    revenue_growth: Optional[float] = None
    recommendation: Optional[str] = None
    target_mean_price: Optional[float] = None
    analyst_count: Optional[int] = None
    # valuation_metrics (expanded)
    price_to_sales: Optional[float] = None
    enterprise_value: Optional[float] = None
    ev_to_revenue: Optional[float] = None
    peg_ratio: Optional[float] = None
    forward_eps: Optional[float] = None
    book_value: Optional[float] = None
    # profitability_metrics (expanded)
    roa: Optional[float] = None
    operating_margin: Optional[float] = None
    gross_margin: Optional[float] = None
    ebitda_margin: Optional[float] = None
    earnings_growth: Optional[float] = None
    # market_data (expanded)
    avg_50d: Optional[float] = None
    avg_200d: Optional[float] = None
    avg_volume: Optional[int] = None
    shares_outstanding: Optional[float] = None
    pct_held_insiders: Optional[float] = None
    pct_held_institutions: Optional[float] = None
    # analyst_data (expanded)
    target_high_price: Optional[float] = None
    target_low_price: Optional[float] = None
    target_median_price: Optional[float] = None


class EntityListResponse(BaseModel):
    """Paginated list of company summaries."""

    items: List[CompanySummary]
    count: int


class SectorInfo(BaseModel):
    """Sector with company count."""

    sector: str
    company_count: int
