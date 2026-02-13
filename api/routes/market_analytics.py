"""
Market analytics API routes (dual-backend: SQLite + PostgreSQL).

Provides market movers, summary, sector breakdown, and heatmap data.
Works with both SQLite (local dev) and PostgreSQL (Railway/Docker) backends.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.db_helper import get_conn, fetchall, fetchone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/market", tags=["market-analytics"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class MoverItem(BaseModel):
    ticker: str
    short_name: Optional[str] = None
    current_price: Optional[float] = None
    previous_close: Optional[float] = None
    change_pct: Optional[float] = None
    volume: Optional[int] = None
    sector: Optional[str] = None


class MoversResponse(BaseModel):
    items: List[MoverItem]
    type: str
    count: int


class MarketSummary(BaseModel):
    total_market_cap: Optional[float] = None
    total_volume: Optional[int] = None
    gainers_count: int = 0
    losers_count: int = 0
    unchanged_count: int = 0
    top_gainers: List[MoverItem] = []
    top_losers: List[MoverItem] = []


class SectorAnalytics(BaseModel):
    sector: str
    avg_change_pct: Optional[float] = None
    total_volume: Optional[int] = None
    total_market_cap: Optional[float] = None
    company_count: int = 0
    gainers: int = 0
    losers: int = 0


class HeatmapItem(BaseModel):
    ticker: str
    name: Optional[str] = None
    sector: Optional[str] = None
    market_cap: Optional[float] = None
    change_pct: Optional[float] = None


# ---------------------------------------------------------------------------
# Shared SQL for movers
# ---------------------------------------------------------------------------

_MOVERS_SQL = """
    SELECT
        c.ticker,
        c.short_name,
        m.current_price,
        m.previous_close,
        CASE WHEN m.previous_close > 0
             THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
             ELSE NULL
        END AS change_pct,
        m.volume,
        c.sector
    FROM companies c
    JOIN market_data m ON m.ticker = c.ticker
    WHERE m.current_price IS NOT NULL AND m.previous_close IS NOT NULL AND m.previous_close > 0
"""


def _row_to_mover(row: Dict[str, Any]) -> MoverItem:
    return MoverItem(
        ticker=row["ticker"],
        short_name=row["short_name"],
        current_price=row["current_price"],
        previous_close=row["previous_close"],
        change_pct=round(row["change_pct"], 2)
        if row["change_pct"] is not None
        else None,
        volume=int(row["volume"]) if row["volume"] is not None else None,
        sector=row["sector"],
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/movers", response_model=MoversResponse)
async def get_movers(
    type: str = Query(
        "gainers", pattern="^(gainers|losers)$", description="Type: gainers or losers"
    ),
    limit: int = Query(10, ge=1, le=100),
) -> MoversResponse:
    """Get top market movers (gainers or losers) by percent change."""
    order = "DESC" if type == "gainers" else "ASC"
    sql = _MOVERS_SQL + f" ORDER BY change_pct {order} LIMIT ?"

    try:
        conn = get_conn()
        try:
            rows = fetchall(conn, sql, (limit,))
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching movers: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    items = [_row_to_mover(r) for r in rows]
    return MoversResponse(items=items, type=type, count=len(items))


@router.get("/summary", response_model=MarketSummary)
async def get_market_summary() -> MarketSummary:
    """Get overall market summary with totals and top 5 movers."""
    try:
        conn = get_conn()
        try:
            # Aggregates
            agg = fetchone(
                conn,
                """
                SELECT
                    COALESCE(SUM(m.market_cap), 0) AS total_market_cap,
                    COALESCE(SUM(m.volume), 0) AS total_volume,
                    SUM(CASE WHEN m.previous_close > 0 AND m.current_price > m.previous_close THEN 1 ELSE 0 END) AS gainers_count,
                    SUM(CASE WHEN m.previous_close > 0 AND m.current_price < m.previous_close THEN 1 ELSE 0 END) AS losers_count,
                    SUM(CASE WHEN m.previous_close > 0 AND m.current_price = m.previous_close THEN 1 ELSE 0 END) AS unchanged_count
                FROM market_data m
                WHERE m.current_price IS NOT NULL
            """,
            )

            # Top 5 gainers
            gainers = fetchall(conn, _MOVERS_SQL + " ORDER BY change_pct DESC LIMIT 5")

            # Top 5 losers
            losers = fetchall(conn, _MOVERS_SQL + " ORDER BY change_pct ASC LIMIT 5")
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching market summary: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return MarketSummary(
        total_market_cap=float(agg["total_market_cap"])
        if agg["total_market_cap"]
        else None,
        total_volume=int(agg["total_volume"]) if agg["total_volume"] else None,
        gainers_count=agg["gainers_count"] or 0,
        losers_count=agg["losers_count"] or 0,
        unchanged_count=agg["unchanged_count"] or 0,
        top_gainers=[_row_to_mover(r) for r in gainers],
        top_losers=[_row_to_mover(r) for r in losers],
    )


@router.get("/sectors", response_model=List[SectorAnalytics])
async def get_sector_analytics() -> List[SectorAnalytics]:
    """Get per-sector analytics: avg change, volumes, market cap, gainers/losers."""
    sql = """
        SELECT
            c.sector,
            AVG(CASE WHEN m.previous_close > 0
                 THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
                 ELSE NULL END) AS avg_change_pct,
            COALESCE(SUM(m.volume), 0) AS total_volume,
            COALESCE(SUM(m.market_cap), 0) AS total_market_cap,
            COUNT(*) AS company_count,
            SUM(CASE WHEN m.previous_close > 0 AND m.current_price > m.previous_close THEN 1 ELSE 0 END) AS gainers,
            SUM(CASE WHEN m.previous_close > 0 AND m.current_price < m.previous_close THEN 1 ELSE 0 END) AS losers
        FROM companies c
        JOIN market_data m ON m.ticker = c.ticker
        WHERE c.sector IS NOT NULL AND m.current_price IS NOT NULL
        GROUP BY c.sector
        ORDER BY total_market_cap DESC
    """
    try:
        conn = get_conn()
        try:
            rows = fetchall(conn, sql)
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching sector analytics: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return [
        SectorAnalytics(
            sector=r["sector"],
            avg_change_pct=round(float(r["avg_change_pct"]), 2)
            if r["avg_change_pct"] is not None
            else None,
            total_volume=int(r["total_volume"])
            if r["total_volume"] is not None
            else None,
            total_market_cap=float(r["total_market_cap"])
            if r["total_market_cap"] is not None
            else None,
            company_count=r["company_count"],
            gainers=r["gainers"] or 0,
            losers=r["losers"] or 0,
        )
        for r in rows
    ]


@router.get("/heatmap", response_model=List[HeatmapItem])
async def get_heatmap() -> List[HeatmapItem]:
    """Get all stocks with data suitable for treemap/heatmap visualization."""
    sql = """
        SELECT
            c.ticker,
            c.short_name AS name,
            c.sector,
            m.market_cap,
            CASE WHEN m.previous_close > 0
                 THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
                 ELSE NULL
            END AS change_pct
        FROM companies c
        JOIN market_data m ON m.ticker = c.ticker
        WHERE m.current_price IS NOT NULL AND m.market_cap IS NOT NULL
        ORDER BY m.market_cap DESC
    """
    try:
        conn = get_conn()
        try:
            rows = fetchall(conn, sql)
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching heatmap data: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return [
        HeatmapItem(
            ticker=r["ticker"],
            name=r["name"],
            sector=r["sector"],
            market_cap=float(r["market_cap"]) if r["market_cap"] is not None else None,
            change_pct=round(float(r["change_pct"]), 2)
            if r["change_pct"] is not None
            else None,
        )
        for r in rows
    ]
