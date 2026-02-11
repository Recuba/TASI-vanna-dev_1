"""
Announcements API routes.

Provides read endpoints (public) and a write endpoint (authenticated).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_announcement_service
from api.schemas.announcements import AnnouncementCreate, AnnouncementResponse
from api.schemas.common import PaginatedResponse, PaginationParams
from auth.dependencies import get_current_user


# Backward-compatible alias used by tests/test_api_routes.py
class AnnouncementListResponse(BaseModel):
    """Legacy response model kept for backward compatibility."""

    items: List[AnnouncementResponse]
    count: int


from services.announcement_service import AnnouncementService, Announcement

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


def _to_response(a: Announcement) -> AnnouncementResponse:
    return AnnouncementResponse(
        id=a.id,
        ticker=a.ticker,
        title_ar=a.title_ar,
        title_en=a.title_en,
        body_ar=a.body_ar,
        body_en=a.body_en,
        source=a.source,
        announcement_date=a.announcement_date,
        category=a.category,
        classification=a.classification,
        is_material=a.is_material,
        source_url=a.source_url,
        created_at=a.created_at,
    )


# ---------------------------------------------------------------------------
# Read endpoints (public)
# ---------------------------------------------------------------------------
@router.get("", response_model=PaginatedResponse[AnnouncementResponse])
async def list_announcements(
    pagination: PaginationParams = Depends(),
    ticker: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    svc: AnnouncementService = Depends(get_announcement_service),
) -> PaginatedResponse[AnnouncementResponse]:
    """Return announcements with optional filters."""
    items = svc.get_announcements(
        limit=pagination.limit,
        offset=pagination.offset,
        ticker=ticker,
        category=category,
        source=source,
        since=since,
    )
    total = svc.count_announcements(ticker=ticker)
    return PaginatedResponse.build(
        items=[_to_response(a) for a in items],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/material", response_model=PaginatedResponse[AnnouncementResponse])
async def material_events(
    pagination: PaginationParams = Depends(),
    ticker: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    svc: AnnouncementService = Depends(get_announcement_service),
) -> PaginatedResponse[AnnouncementResponse]:
    """Return only material announcements."""
    items = svc.get_material_events(
        limit=pagination.limit,
        offset=pagination.offset,
        ticker=ticker,
        since=since,
    )
    total = svc.count_announcements(ticker=ticker, is_material=True)
    return PaginatedResponse.build(
        items=[_to_response(a) for a in items],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/sector/{sector}", response_model=PaginatedResponse[AnnouncementResponse])
async def announcements_by_sector(
    sector: str,
    pagination: PaginationParams = Depends(),
    since: Optional[datetime] = Query(None),
    svc: AnnouncementService = Depends(get_announcement_service),
) -> PaginatedResponse[AnnouncementResponse]:
    """Return announcements for all companies in a sector."""
    items = svc.get_announcements_by_sector(
        sector=sector,
        limit=pagination.limit,
        offset=pagination.offset,
        since=since,
    )
    total = svc.count_announcements()
    return PaginatedResponse.build(
        items=[_to_response(a) for a in items],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/{announcement_id}", response_model=AnnouncementResponse)
async def get_announcement(
    announcement_id: str,
    svc: AnnouncementService = Depends(get_announcement_service),
) -> AnnouncementResponse:
    """Return a single announcement by ID."""
    item = svc.get_announcement_by_id(announcement_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return _to_response(item)


# ---------------------------------------------------------------------------
# Write endpoints (authenticated)
# ---------------------------------------------------------------------------
@router.post("", response_model=AnnouncementResponse, status_code=201)
async def create_announcement(
    body: AnnouncementCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: AnnouncementService = Depends(get_announcement_service),
) -> AnnouncementResponse:
    """Create a new announcement. Requires authentication."""
    announcement = Announcement(
        ticker=body.ticker,
        title_ar=body.title_ar,
        title_en=body.title_en,
        body_ar=body.body_ar,
        body_en=body.body_en,
        source=body.source,
        announcement_date=body.announcement_date,
        category=body.category,
        classification=body.classification,
        is_material=body.is_material,
        source_url=body.source_url,
    )
    svc.store_announcements([announcement])
    return _to_response(announcement)
