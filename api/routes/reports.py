"""
Technical reports API routes.

Provides read endpoints (public) and a write endpoint (authenticated).
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_reports_service
from api.schemas.common import PaginatedResponse, PaginationParams
from api.schemas.reports import ReportCreate, ReportResponse
from auth.dependencies import get_current_user
from models.validators import validate_ticker


# Backward-compatible alias used by tests/test_api_routes.py
class ReportListResponse(BaseModel):
    """Legacy response model kept for backward compatibility."""

    items: List[ReportResponse]
    count: int


from services.reports_service import TechnicalReportsService, TechnicalReport

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _to_response(r: TechnicalReport) -> ReportResponse:
    return ReportResponse(
        id=r.id,
        ticker=r.ticker,
        title=r.title,
        summary=r.summary,
        author=r.author,
        source_name=r.source_name,
        source_url=r.source_url,
        published_at=r.published_at,
        recommendation=r.recommendation,
        target_price=r.target_price,
        current_price_at_report=r.current_price_at_report,
        report_type=r.report_type,
        created_at=r.created_at,
    )


# ---------------------------------------------------------------------------
# Read endpoints (public)
# ---------------------------------------------------------------------------
@router.get("", response_model=PaginatedResponse[ReportResponse])
async def list_reports(
    pagination: PaginationParams = Depends(),
    recommendation: Optional[str] = Query(None),
    report_type: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    svc: TechnicalReportsService = Depends(get_reports_service),
) -> PaginatedResponse[ReportResponse]:
    """Return the latest technical reports."""
    reports = await asyncio.to_thread(
        svc.get_reports,
        limit=pagination.limit,
        offset=pagination.offset,
        recommendation=recommendation,
        report_type=report_type,
        since=since,
    )
    total = await asyncio.to_thread(svc.count_reports, recommendation=recommendation)
    return PaginatedResponse.build(
        items=[_to_response(r) for r in reports],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/ticker/{ticker}", response_model=PaginatedResponse[ReportResponse])
async def reports_by_ticker(
    ticker: str,
    pagination: PaginationParams = Depends(),
    recommendation: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    svc: TechnicalReportsService = Depends(get_reports_service),
) -> PaginatedResponse[ReportResponse]:
    """Return technical reports for a specific ticker."""
    ticker = validate_ticker(ticker)
    reports = await asyncio.to_thread(
        svc.get_reports_by_ticker,
        ticker=ticker,
        limit=pagination.limit,
        offset=pagination.offset,
        recommendation=recommendation,
        since=since,
    )
    total = await asyncio.to_thread(
        svc.count_reports, ticker=ticker, recommendation=recommendation
    )
    return PaginatedResponse.build(
        items=[_to_response(r) for r in reports],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: str,
    svc: TechnicalReportsService = Depends(get_reports_service),
) -> ReportResponse:
    """Return a single technical report by ID."""
    report = await asyncio.to_thread(svc.get_report_by_id, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return _to_response(report)


# ---------------------------------------------------------------------------
# Write endpoints (authenticated)
# ---------------------------------------------------------------------------
@router.post("", response_model=ReportResponse, status_code=201)
async def create_report(
    body: ReportCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: TechnicalReportsService = Depends(get_reports_service),
) -> ReportResponse:
    """Create a new technical report. Requires authentication."""
    report = TechnicalReport(
        title=body.title,
        ticker=body.ticker,
        summary=body.summary,
        author=body.author,
        source_name=body.source_name,
        source_url=body.source_url,
        published_at=body.published_at,
        recommendation=body.recommendation,
        target_price=body.target_price,
        current_price_at_report=body.current_price_at_report,
        report_type=body.report_type,
    )
    await asyncio.to_thread(svc.store_report, report)
    return _to_response(report)
