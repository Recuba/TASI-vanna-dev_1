"""Pydantic schemas for chart data endpoints."""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class ChartRequest(BaseModel):
    """Request parameters for a chart query."""

    ticker: str = Field(..., min_length=1, max_length=20)
    chart_type: str = Field("bar", max_length=50)
    period: str = Field("1y", max_length=10)


class ChartDataPoint(BaseModel):
    """Single data point for a chart."""

    label: str
    value: float


class ChartResponse(BaseModel):
    """Response model for chart data."""

    chart_type: str
    title: str
    data: List[ChartDataPoint]
