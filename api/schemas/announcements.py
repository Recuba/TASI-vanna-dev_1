"""Pydantic schemas for announcement endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AnnouncementCreate(BaseModel):
    """Request body for creating an announcement."""

    ticker: Optional[str] = Field(None, max_length=20)
    title_ar: Optional[str] = Field(None, max_length=500)
    title_en: Optional[str] = Field(None, max_length=500)
    body_ar: Optional[str] = None
    body_en: Optional[str] = None
    source: Optional[str] = Field(None, max_length=50)
    announcement_date: Optional[datetime] = None
    category: Optional[str] = Field(None, max_length=100)
    classification: Optional[str] = Field(None, max_length=100)
    is_material: bool = False
    source_url: Optional[str] = Field(None, max_length=2000)


class AnnouncementResponse(BaseModel):
    """Response model for a single announcement."""

    id: str
    ticker: Optional[str] = None
    title_ar: Optional[str] = None
    title_en: Optional[str] = None
    body_ar: Optional[str] = None
    body_en: Optional[str] = None
    source: Optional[str] = None
    announcement_date: Optional[datetime] = None
    category: Optional[str] = None
    classification: Optional[str] = None
    is_material: bool = False
    source_url: Optional[str] = None
    created_at: Optional[datetime] = None
