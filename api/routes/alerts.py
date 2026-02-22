"""
Price alert API routes (PostgreSQL backend only — requires JWT).

Provides CRUD operations for user price alerts. Alert evaluation is done
client-side for localStorage alerts and server-side for authenticated users.
"""

from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.api_responses import STANDARD_ERRORS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class AlertCreate(BaseModel):
    ticker: str
    alert_type: str  # price_above, price_below, volume_spike
    threshold_value: float


class AlertUpdate(BaseModel):
    alert_type: Optional[str] = None
    threshold_value: Optional[float] = None
    is_active: Optional[bool] = None


class AlertItem(BaseModel):
    id: str
    ticker: str
    alert_type: str
    threshold_value: float
    is_active: bool = True
    last_triggered_at: Optional[str] = None
    created_at: Optional[str] = None


class AlertListResponse(BaseModel):
    alerts: List[AlertItem] = []
    count: int = 0


# ---------------------------------------------------------------------------
# Dependency: get current user from JWT
# ---------------------------------------------------------------------------

def _get_user_id_from_request():
    """Placeholder — in production, extract user_id from JWT token."""
    # This would normally parse the Authorization header.
    # For now, raise 501 to indicate the feature requires auth setup.
    raise HTTPException(
        status_code=501,
        detail="Alerts API requires JWT authentication (PostgreSQL backend only). "
               "Use localStorage alerts for anonymous/SQLite mode.",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("", response_model=AlertListResponse, responses=STANDARD_ERRORS)
async def list_alerts():
    """List all active alerts for the current user."""
    _get_user_id_from_request()
    return AlertListResponse()


@router.post("", response_model=AlertItem, responses=STANDARD_ERRORS, status_code=201)
async def create_alert(body: AlertCreate):
    """Create a new price alert."""
    _get_user_id_from_request()
    return AlertItem(
        id=str(uuid.uuid4()),
        ticker=body.ticker,
        alert_type=body.alert_type,
        threshold_value=body.threshold_value,
    )


@router.put("/{alert_id}", response_model=AlertItem, responses=STANDARD_ERRORS)
async def update_alert(alert_id: str, body: AlertUpdate):
    """Update an existing alert."""
    _get_user_id_from_request()
    return AlertItem(id=alert_id, ticker="", alert_type="", threshold_value=0)


@router.delete("/{alert_id}", responses=STANDARD_ERRORS)
async def delete_alert(alert_id: str):
    """Delete an alert."""
    _get_user_id_from_request()
    return {"deleted": True}
