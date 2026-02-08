"""Pydantic schemas for watchlist and alert endpoints."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class WatchlistCreateRequest(BaseModel):
    """Request body for creating a watchlist."""

    name: str = Field("Default", min_length=1, max_length=100)
    tickers: List[str] = Field(default_factory=list)


class WatchlistAddRequest(BaseModel):
    """Request body for adding a single ticker to a watchlist."""

    ticker: str = Field(..., min_length=1, max_length=20)


class WatchlistUpdateRequest(BaseModel):
    """Request body for updating a watchlist."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    tickers: Optional[List[str]] = None


class WatchlistResponse(BaseModel):
    """Response model for a watchlist."""

    id: str
    user_id: str
    name: str
    tickers: List[str]


class AlertCreateRequest(BaseModel):
    """Request body for creating a price/volume alert."""

    ticker: str = Field(..., min_length=1, max_length=20)
    alert_type: str = Field(..., min_length=1, max_length=50)
    threshold_value: Optional[float] = None


class AlertResponse(BaseModel):
    """Response model for a user alert."""

    id: str
    user_id: str
    ticker: str
    alert_type: str
    threshold_value: Optional[float] = None
    is_active: bool = True
