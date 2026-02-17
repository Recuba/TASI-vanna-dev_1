"""
Stock data API routes (dual-backend: SQLite + PostgreSQL).

Provides per-stock dividends, financial summary, financial statements,
stock comparison, and batch quotes.
Works with both SQLite and PostgreSQL backends via db_helper.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.db_helper import afetchall, afetchone, get_conn, fetchall
from database.queries import (
    COMPANY_EXISTS,
    COMPANY_NAMES_BY_TICKERS,
    DIVIDEND_DATA_BY_TICKER,
    FINANCIAL_SUMMARY_BY_TICKER,
)
from models.api_responses import STANDARD_ERRORS
from models.validators import validate_ticker, validate_ticker_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stocks", tags=["stock-data"])

# Allowed financial statement tables to prevent SQL injection
_STATEMENT_TABLES = {"balance_sheet", "income_statement", "cash_flow"}

# Allowed metric columns across tables for the compare endpoint.
# Maps metric name -> (table, column).
_METRIC_MAP: Dict[str, tuple] = {}

# Build from valuation_metrics
for _col in [
    "trailing_pe",
    "forward_pe",
    "price_to_book",
    "price_to_sales",
    "enterprise_value",
    "ev_to_revenue",
    "ev_to_ebitda",
    "peg_ratio",
    "trailing_eps",
    "forward_eps",
    "book_value",
    "revenue_per_share",
]:
    _METRIC_MAP[_col] = ("valuation_metrics", _col)

# Build from profitability_metrics
for _col in [
    "roa",
    "roe",
    "profit_margin",
    "operating_margin",
    "gross_margin",
    "ebitda_margin",
    "earnings_growth",
    "revenue_growth",
    "earnings_quarterly_growth",
]:
    _METRIC_MAP[_col] = ("profitability_metrics", _col)

# Build from market_data
for _col in [
    "current_price",
    "previous_close",
    "market_cap",
    "volume",
    "beta",
    "avg_50d",
    "avg_200d",
    "shares_outstanding",
    "week_52_high",
    "week_52_low",
]:
    _METRIC_MAP[_col] = ("market_data", _col)

# Build from dividend_data
for _col in [
    "dividend_rate",
    "dividend_yield",
    "payout_ratio",
    "trailing_annual_dividend_rate",
    "trailing_annual_dividend_yield",
    "avg_dividend_yield_5y",
]:
    _METRIC_MAP[_col] = ("dividend_data", _col)

# Build from financial_summary
for _col in [
    "total_revenue",
    "total_cash",
    "total_debt",
    "debt_to_equity",
    "current_ratio",
    "quick_ratio",
    "free_cashflow",
    "operating_cashflow",
    "ebitda",
    "gross_profits",
]:
    _METRIC_MAP[_col] = ("financial_summary", _col)

# Build from analyst_data
for _col in [
    "target_mean_price",
    "target_high_price",
    "target_low_price",
    "target_median_price",
    "analyst_count",
    "recommendation",
]:
    _METRIC_MAP[_col] = ("analyst_data", _col)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class DividendData(BaseModel):
    ticker: str
    dividend_rate: Optional[float] = None
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    trailing_annual_dividend_rate: Optional[float] = None
    trailing_annual_dividend_yield: Optional[float] = None
    avg_dividend_yield_5y: Optional[float] = None
    ex_dividend_date: Optional[str] = None
    last_dividend_value: Optional[float] = None
    last_dividend_date: Optional[str] = None


class FinancialSummaryData(BaseModel):
    ticker: str
    total_revenue: Optional[float] = None
    total_cash: Optional[float] = None
    total_cash_per_share: Optional[float] = None
    total_debt: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None
    free_cashflow: Optional[float] = None
    operating_cashflow: Optional[float] = None
    ebitda: Optional[float] = None
    gross_profits: Optional[float] = None
    net_income_to_common: Optional[float] = None


class FinancialPeriod(BaseModel):
    period_type: Optional[str] = None
    period_index: Optional[int] = None
    period_date: Optional[str] = None
    data: Dict[str, Any] = {}


class FinancialsResponse(BaseModel):
    ticker: str
    statement: str
    periods: List[FinancialPeriod] = []


class CompareMetrics(BaseModel):
    ticker: str
    short_name: Optional[str] = None
    metrics: Dict[str, Any] = {}


class CompareResponse(BaseModel):
    tickers: List[CompareMetrics]


class QuoteItem(BaseModel):
    ticker: str
    short_name: Optional[str] = None
    current_price: Optional[float] = None
    previous_close: Optional[float] = None
    change_pct: Optional[float] = None
    volume: Optional[int] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/{ticker}/dividends", response_model=DividendData, responses=STANDARD_ERRORS)
async def get_dividends(ticker: str) -> DividendData:
    """Get dividend data for a specific stock."""
    ticker = validate_ticker(ticker)
    exists = await afetchone(COMPANY_EXISTS, (ticker,))
    if not exists:
        raise HTTPException(status_code=404, detail="Company not found")

    row = await afetchone(DIVIDEND_DATA_BY_TICKER, (ticker,))

    if row is None:
        return DividendData(ticker=ticker)

    return DividendData(
        ticker=row["ticker"],
        dividend_rate=row["dividend_rate"],
        dividend_yield=row["dividend_yield"],
        payout_ratio=row["payout_ratio"],
        trailing_annual_dividend_rate=row["trailing_annual_dividend_rate"],
        trailing_annual_dividend_yield=row["trailing_annual_dividend_yield"],
        avg_dividend_yield_5y=row["avg_dividend_yield_5y"],
        ex_dividend_date=row["ex_dividend_date"],
        last_dividend_value=row["last_dividend_value"],
        last_dividend_date=row["last_dividend_date"],
    )


@router.get("/{ticker}/summary", response_model=FinancialSummaryData, responses=STANDARD_ERRORS)
async def get_financial_summary(ticker: str) -> FinancialSummaryData:
    """Get financial summary for a specific stock."""
    ticker = validate_ticker(ticker)
    exists = await afetchone(COMPANY_EXISTS, (ticker,))
    if not exists:
        raise HTTPException(status_code=404, detail="Company not found")

    row = await afetchone(FINANCIAL_SUMMARY_BY_TICKER, (ticker,))

    if row is None:
        return FinancialSummaryData(ticker=ticker)

    return FinancialSummaryData(
        ticker=row["ticker"],
        total_revenue=row["total_revenue"],
        total_cash=row["total_cash"],
        total_cash_per_share=row["total_cash_per_share"],
        total_debt=row["total_debt"],
        debt_to_equity=row["debt_to_equity"],
        current_ratio=row["current_ratio"],
        quick_ratio=row["quick_ratio"],
        free_cashflow=row["free_cashflow"],
        operating_cashflow=row["operating_cashflow"],
        ebitda=row["ebitda"],
        gross_profits=row["gross_profits"],
        net_income_to_common=row["net_income_to_common"],
    )


@router.get("/{ticker}/financials", response_model=FinancialsResponse, responses=STANDARD_ERRORS)
async def get_financials(
    ticker: str,
    statement: str = Query(
        "balance_sheet", description="balance_sheet, income_statement, or cash_flow"
    ),
    period_type: str = Query("annual", description="annual, quarterly, or ttm"),
) -> FinancialsResponse:
    """Get financial statement periods for a specific stock."""
    ticker = validate_ticker(ticker)
    if statement not in _STATEMENT_TABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid statement: {statement}. Must be one of: {', '.join(sorted(_STATEMENT_TABLES))}",
        )

    if period_type not in ("annual", "quarterly", "ttm"):
        raise HTTPException(
            status_code=400,
            detail="Invalid period_type. Must be one of: annual, quarterly, ttm",
        )

    exists = await afetchone(COMPANY_EXISTS, (ticker,))
    if not exists:
        raise HTTPException(status_code=404, detail="Company not found")

    # Table name is validated above against _STATEMENT_TABLES whitelist.
    # SELECT * is intentional here: financial statement tables have dynamic
    # columns that vary by statement type, and the handler strips metadata
    # fields (id, ticker, period_type, period_index, period_date) below,
    # returning everything else in the generic `data` dict.
    rows = await afetchall(
        f"SELECT * FROM {statement} WHERE ticker = ? AND period_type = ? ORDER BY period_index ASC",
        (ticker, period_type),
    )

    periods = []
    for row_dict in rows:
        # Extract metadata fields
        pt = row_dict.pop("period_type", None)
        pi = row_dict.pop("period_index", None)
        pd_ = row_dict.pop("period_date", None)
        row_dict.pop("id", None)
        row_dict.pop("ticker", None)
        periods.append(
            FinancialPeriod(
                period_type=pt,
                period_index=pi,
                period_date=pd_,
                data=row_dict,
            )
        )

    return FinancialsResponse(ticker=ticker, statement=statement, periods=periods)


@router.get("/compare", response_model=CompareResponse, responses=STANDARD_ERRORS)
async def compare_stocks(
    tickers: str = Query(
        ..., description="Comma-separated tickers (2-5), e.g. 2222,1120"
    ),
    metrics: str = Query(
        ..., description="Comma-separated metric names, e.g. trailing_pe,roe,market_cap"
    ),
) -> CompareResponse:
    """Compare 2-5 stocks side-by-side on specified metrics."""
    ticker_list = validate_ticker_list(tickers, min_count=2, max_count=5)
    metric_list = [m.strip() for m in metrics.split(",") if m.strip()]

    if not metric_list:
        raise HTTPException(status_code=400, detail="Provide at least one metric")

    # Validate metrics
    invalid_metrics = [m for m in metric_list if m not in _METRIC_MAP]
    if invalid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metrics: {', '.join(invalid_metrics)}. Available: {', '.join(sorted(_METRIC_MAP.keys()))}",
        )

    # Group metrics by table for efficient queries
    table_columns: Dict[str, List[str]] = {}
    for metric in metric_list:
        table, col = _METRIC_MAP[metric]
        table_columns.setdefault(table, []).append(col)

    def _sync_compare():
        from contextlib import closing

        with closing(get_conn()) as conn:
            placeholders = ",".join("?" for _ in ticker_list)
            name_rows = fetchall(
                conn,
                COMPANY_NAMES_BY_TICKERS.format(placeholders=placeholders),
                tuple(ticker_list),
            )
            name_map = {r["ticker"]: r["short_name"] for r in name_rows}

            result_data: Dict[str, Dict[str, Any]] = {t: {} for t in ticker_list}

            for table, columns in table_columns.items():
                col_list = ", ".join(["ticker"] + columns)
                rows = fetchall(
                    conn,
                    f"SELECT {col_list} FROM {table} WHERE ticker IN ({placeholders})",
                    tuple(ticker_list),
                )
                for row_dict in rows:
                    tk = row_dict.pop("ticker")
                    for col in columns:
                        result_data[tk][col] = row_dict.get(col)
            return name_map, result_data

    name_map, result_data = await asyncio.to_thread(_sync_compare)

    items = []
    for tk in ticker_list:
        items.append(
            CompareMetrics(
                ticker=tk,
                short_name=name_map.get(tk),
                metrics=result_data.get(tk, {}),
            )
        )

    return CompareResponse(tickers=items)


@router.get("/quotes", response_model=List[QuoteItem], responses=STANDARD_ERRORS)
async def get_batch_quotes(
    tickers: str = Query(
        ..., description="Comma-separated tickers, e.g. 2222,1120,2010"
    ),
) -> List[QuoteItem]:
    """Get batch quotes for multiple tickers."""
    ticker_list = validate_ticker_list(tickers, min_count=1, max_count=50)

    placeholders = ",".join("?" for _ in ticker_list)
    sql = f"""
        SELECT
            c.ticker,
            c.short_name,
            m.current_price,
            m.previous_close,
            CASE WHEN m.previous_close > 0
                 THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
                 ELSE NULL
            END AS change_pct,
            m.volume
        FROM companies c
        LEFT JOIN market_data m ON m.ticker = c.ticker
        WHERE c.ticker IN ({placeholders})
    """

    rows = await afetchall(sql, tuple(ticker_list))

    return [
        QuoteItem(
            ticker=r["ticker"],
            short_name=r["short_name"],
            current_price=r["current_price"],
            previous_close=r["previous_close"],
            change_pct=round(r["change_pct"], 2)
            if r["change_pct"] is not None
            else None,
            volume=int(r["volume"]) if r["volume"] is not None else None,
        )
        for r in rows
    ]
