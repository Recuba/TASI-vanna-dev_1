"""Pydantic schemas for news article endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NewsCreate(BaseModel):
    """Request body for creating a news article."""

    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    ticker: Optional[str] = Field(None, max_length=20)
    source: Optional[str] = Field(None, max_length=200)
    source_url: Optional[str] = Field(None, max_length=2000)
    language: str = Field("ar", max_length=5)
    sentiment_score: Optional[float] = Field(None, ge=-1.0, le=1.0)
    sentiment_label: Optional[str] = Field(None, max_length=20)


class NewsUpdate(BaseModel):
    """Request body for updating a news article. All fields optional."""

    title: Optional[str] = Field(None, min_length=1, max_length=500)
    content: Optional[str] = Field(None, min_length=1)
    ticker: Optional[str] = Field(None, max_length=20)
    source: Optional[str] = Field(None, max_length=200)
    source_url: Optional[str] = Field(None, max_length=2000)
    language: Optional[str] = Field(None, max_length=5)
    sentiment_score: Optional[float] = Field(None, ge=-1.0, le=1.0)
    sentiment_label: Optional[str] = Field(None, max_length=20)


class NewsResponse(BaseModel):
    """Response model for a single news article."""

    id: str
    ticker: Optional[str] = None
    title: str
    body: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    published_at: Optional[datetime] = None
    sentiment_score: Optional[float] = None
    sentiment_label: Optional[str] = None
    language: str = "ar"
    created_at: Optional[datetime] = None
