"""
Watchlists and alerts API routes.

All endpoints require JWT authentication. Unauthenticated requests receive 401.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_user_service
from api.schemas.watchlists import (
    AlertCreateRequest,
    AlertResponse,
    WatchlistAddRequest,
    WatchlistCreateRequest,
    WatchlistResponse,
    WatchlistUpdateRequest,
)
from auth.dependencies import get_current_user
from services.user_service import UserService

router = APIRouter(prefix="/api/watchlists", tags=["watchlists"])


# ---------------------------------------------------------------------------
# Watchlist read endpoints (authenticated via JWT)
# ---------------------------------------------------------------------------
@router.get("", response_model=List[WatchlistResponse])
async def list_watchlists(
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
) -> List[WatchlistResponse]:
    """Return all watchlists for the authenticated user. Returns 401 if not authenticated."""
    wls = await asyncio.to_thread(svc.get_watchlists, user_id=current_user["id"])
    return [
        WatchlistResponse(id=w.id, user_id=w.user_id, name=w.name, tickers=w.tickers)
        for w in wls
    ]


# ---------------------------------------------------------------------------
# Watchlist write endpoints (authenticated via JWT)
# ---------------------------------------------------------------------------
@router.post("", response_model=WatchlistResponse, status_code=201)
async def create_watchlist(
    body: WatchlistCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
) -> WatchlistResponse:
    """Create a new watchlist for the authenticated user."""
    wl = await asyncio.to_thread(
        svc.create_watchlist,
        user_id=current_user["id"], name=body.name, tickers=body.tickers,
    )
    return WatchlistResponse(
        id=wl.id, user_id=wl.user_id, name=wl.name, tickers=wl.tickers
    )


@router.post("/{watchlist_id}/tickers", response_model=WatchlistResponse)
async def add_ticker_to_watchlist(
    watchlist_id: str,
    body: WatchlistAddRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
) -> WatchlistResponse:
    """Add a single ticker to an existing watchlist. Requires authentication."""
    # Fetch current watchlist to get existing tickers
    wls = await asyncio.to_thread(svc.get_watchlists, user_id=current_user["id"])
    wl = next((w for w in wls if w.id == watchlist_id), None)
    if wl is None:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    tickers = list(wl.tickers)
    if body.ticker not in tickers:
        tickers.append(body.ticker)

    updated = await asyncio.to_thread(
        svc.update_watchlist,
        watchlist_id=watchlist_id,
        user_id=current_user["id"],
        tickers=tickers,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return WatchlistResponse(
        id=updated.id,
        user_id=updated.user_id,
        name=updated.name,
        tickers=updated.tickers,
    )


@router.patch("/{watchlist_id}", response_model=WatchlistResponse)
async def update_watchlist(
    watchlist_id: str,
    body: WatchlistUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
) -> WatchlistResponse:
    """Update a watchlist's name and/or tickers. Requires authentication."""
    wl = await asyncio.to_thread(
        svc.update_watchlist,
        watchlist_id=watchlist_id,
        user_id=current_user["id"],
        name=body.name,
        tickers=body.tickers,
    )
    if wl is None:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return WatchlistResponse(
        id=wl.id, user_id=wl.user_id, name=wl.name, tickers=wl.tickers
    )


@router.delete("/{watchlist_id}", status_code=204)
async def delete_watchlist(
    watchlist_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
):
    """Delete a watchlist. Requires authentication."""
    deleted = await asyncio.to_thread(
        svc.delete_watchlist,
        watchlist_id=watchlist_id, user_id=current_user["id"],
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Watchlist not found")


# ---------------------------------------------------------------------------
# Alert read endpoints (authenticated via JWT)
# ---------------------------------------------------------------------------
@router.get("/alerts", response_model=List[AlertResponse])
async def list_alerts(
    ticker: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
) -> List[AlertResponse]:
    """Return active alerts for the authenticated user. Returns 401 if not authenticated."""
    alerts = await asyncio.to_thread(svc.get_active_alerts, user_id=current_user["id"], ticker=ticker)
    return [
        AlertResponse(
            id=a.id,
            user_id=a.user_id,
            ticker=a.ticker,
            alert_type=a.alert_type,
            threshold_value=a.threshold_value,
            is_active=a.is_active,
        )
        for a in alerts
    ]


# ---------------------------------------------------------------------------
# Alert write endpoints (authenticated via JWT)
# ---------------------------------------------------------------------------
@router.post("/alerts", response_model=AlertResponse, status_code=201)
async def create_alert(
    body: AlertCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
) -> AlertResponse:
    """Create a new alert for the authenticated user."""
    alert = await asyncio.to_thread(
        svc.create_alert,
        user_id=current_user["id"],
        ticker=body.ticker,
        alert_type=body.alert_type,
        threshold_value=body.threshold_value,
    )
    return AlertResponse(
        id=alert.id,
        user_id=alert.user_id,
        ticker=alert.ticker,
        alert_type=alert.alert_type,
        threshold_value=alert.threshold_value,
        is_active=alert.is_active,
    )


@router.delete("/alerts/{alert_id}", status_code=204)
async def deactivate_alert(
    alert_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: UserService = Depends(get_user_service),
):
    """Deactivate an alert (soft-delete). Requires authentication."""
    updated = await asyncio.to_thread(svc.deactivate_alert, alert_id=alert_id, user_id=current_user["id"])
    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")
