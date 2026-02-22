"""
Financial calendar API route (dual-backend: SQLite + PostgreSQL).

Aggregates dividend ex-dates and earnings reporting dates from existing
database tables into a unified calendar events feed.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from api.db_helper import afetchall
from models.api_responses import STANDARD_ERRORS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/calendar", tags=["calendar"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class CalendarEvent(BaseModel):
    date: str
    type: str  # "dividend" | "earnings"
    ticker: str
    title: str
    description: Optional[str] = None


class CalendarResponse(BaseModel):
    events: List[CalendarEvent] = []
    count: int = 0


# ---------------------------------------------------------------------------
# SQL queries
# ---------------------------------------------------------------------------

_DIVIDEND_EVENTS_SQL = """
    SELECT
        d.ex_dividend_date AS date,
        d.ticker,
        c.short_name,
        d.dividend_rate,
        d.dividend_yield
    FROM dividend_data d
    JOIN companies c ON c.ticker = d.ticker
    WHERE d.ex_dividend_date IS NOT NULL
      AND d.ex_dividend_date >= ?
      AND d.ex_dividend_date <= ?
    ORDER BY d.ex_dividend_date ASC
"""

_EARNINGS_EVENTS_SQL = """
    SELECT
        i.period_date AS date,
        i.ticker,
        c.short_name,
        i.period_type
    FROM income_statement i
    JOIN companies c ON c.ticker = i.ticker
    WHERE i.period_date IS NOT NULL
      AND i.period_type = 'quarterly'
      AND i.period_index = 0
      AND i.period_date >= ?
      AND i.period_date <= ?
    ORDER BY i.period_date ASC
"""


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.get("/events", response_model=CalendarResponse, responses=STANDARD_ERRORS)
async def get_calendar_events(
    date_from: str = Query(..., alias="from", description="Start date YYYY-MM-DD"),
    date_to: str = Query(..., alias="to", description="End date YYYY-MM-DD"),
    event_type: Optional[str] = Query(None, alias="type", description="Filter: dividend, earnings"),
) -> CalendarResponse:
    """Get financial calendar events within a date range."""

    events: List[CalendarEvent] = []

    # Dividend events
    if event_type is None or event_type == "dividend":
        rows = await afetchall(_DIVIDEND_EVENTS_SQL, (date_from, date_to))
        for r in rows:
            name = r.get("short_name") or r["ticker"]
            rate = r.get("dividend_rate")
            yld = r.get("dividend_yield")
            desc_parts = []
            if rate is not None:
                desc_parts.append(f"Rate: {rate:.2f}")
            if yld is not None:
                desc_parts.append(f"Yield: {yld * 100:.1f}%")
            events.append(CalendarEvent(
                date=r["date"],
                type="dividend",
                ticker=r["ticker"],
                title=f"{name} — Ex-Dividend",
                description=", ".join(desc_parts) if desc_parts else None,
            ))

    # Earnings events
    if event_type is None or event_type == "earnings":
        rows = await afetchall(_EARNINGS_EVENTS_SQL, (date_from, date_to))
        for r in rows:
            name = r.get("short_name") or r["ticker"]
            events.append(CalendarEvent(
                date=r["date"],
                type="earnings",
                ticker=r["ticker"],
                title=f"{name} — Quarterly Earnings",
                description=f"Period: {r.get('period_type', 'quarterly')}",
            ))

    # Sort all events by date
    events.sort(key=lambda e: e.date)

    return CalendarResponse(events=events, count=len(events))
