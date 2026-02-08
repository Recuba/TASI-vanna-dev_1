"""Pydantic schemas for technical report endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReportCreate(BaseModel):
    """Request body for creating a technical report."""

    title: str = Field(..., min_length=1, max_length=500)
    ticker: Optional[str] = Field(None, max_length=20)
    summary: Optional[str] = Field(None, max_length=5000)
    author: Optional[str] = Field(None, max_length=200)
    source_name: Optional[str] = Field(None, max_length=200)
    source_url: Optional[str] = Field(None, max_length=2000)
    published_at: Optional[datetime] = None
    recommendation: Optional[str] = Field(None, max_length=50)
    target_price: Optional[float] = Field(None, ge=0)
    current_price_at_report: Optional[float] = Field(None, ge=0)
    report_type: Optional[str] = Field(None, max_length=50)


class ReportUpdate(BaseModel):
    """Request body for updating a technical report. All fields optional."""

    title: Optional[str] = Field(None, min_length=1, max_length=500)
    ticker: Optional[str] = Field(None, max_length=20)
    summary: Optional[str] = Field(None, max_length=5000)
    author: Optional[str] = Field(None, max_length=200)
    source_name: Optional[str] = Field(None, max_length=200)
    source_url: Optional[str] = Field(None, max_length=2000)
    published_at: Optional[datetime] = None
    recommendation: Optional[str] = Field(None, max_length=50)
    target_price: Optional[float] = Field(None, ge=0)
    current_price_at_report: Optional[float] = Field(None, ge=0)
    report_type: Optional[str] = Field(None, max_length=50)


class ReportResponse(BaseModel):
    """Response model for a single technical report."""

    id: str
    ticker: Optional[str] = None
    title: str
    summary: Optional[str] = None
    author: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    published_at: Optional[datetime] = None
    recommendation: Optional[str] = None
    target_price: Optional[float] = None
    current_price_at_report: Optional[float] = None
    report_type: Optional[str] = None
    created_at: Optional[datetime] = None
