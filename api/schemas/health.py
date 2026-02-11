"""Pydantic schemas for health check endpoint."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class ComponentHealthResponse(BaseModel):
    """Health status of a single platform component."""

    name: str
    status: str
    latency_ms: Optional[float] = None
    message: str = ""


class HealthResponse(BaseModel):
    """Aggregated health status for the platform."""

    status: str
    service: str = "raid-ai-tasi"
    version: str = "1.0.0"
    uptime_seconds: float = 0.0
    components: List[ComponentHealthResponse]
