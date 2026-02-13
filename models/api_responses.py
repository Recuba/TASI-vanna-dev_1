"""
Standardized API response models for the Ra'd AI TASI Market Analytics API.

All error responses follow the shape::

    {
        "error": {
            "code": "ERROR_CODE",
            "message": "Human-readable message",
            "request_id": "abc123..."
        }
    }

Success responses use endpoint-specific models defined in ``api/schemas/``.
This module provides the shared ``ErrorDetail`` and ``ErrorResponse`` models
for OpenAPI documentation, plus re-exports of key response types.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Standard error response (used by middleware/error_handler.py)
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    """Inner error object in all error responses."""

    code: str = Field(
        ...,
        description="Machine-readable error code (e.g. BAD_REQUEST, NOT_FOUND)",
        examples=["NOT_FOUND"],
    )
    message: str = Field(
        ...,
        description="Human-readable error description",
        examples=["Company not found"],
    )
    request_id: str = Field(
        ...,
        description="Unique request identifier for log correlation",
        examples=["a1b2c3d4e5f6g7h8"],
    )


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    error: ErrorDetail


# ---------------------------------------------------------------------------
# Common success response patterns (for OpenAPI docs)
# ---------------------------------------------------------------------------


class HealthComponentResponse(BaseModel):
    """Health status of a single platform component."""

    name: str
    status: str
    latency_ms: Optional[float] = None
    message: Optional[str] = None


class HealthCheckResponse(BaseModel):
    """Structured health check response."""

    status: str = Field(..., description="Overall status: healthy, degraded, unhealthy")
    service: str = Field(default="raid-ai-tasi")
    version: Optional[str] = None
    uptime_seconds: Optional[float] = None
    components: List[HealthComponentResponse] = []


class ChartDataPointResponse(BaseModel):
    """Single data point for chart endpoints."""

    label: str
    value: float


class ChartDataResponse(BaseModel):
    """Response from chart analytics endpoints."""

    chart_type: str
    title: str
    data: List[ChartDataPointResponse]


# ---------------------------------------------------------------------------
# OpenAPI error response definitions for use in route decorators
# ---------------------------------------------------------------------------

# Common responses dict for use with FastAPI's `responses` parameter:
#   @router.get("/foo", responses=STANDARD_ERRORS)
STANDARD_ERRORS: Dict[int, Dict[str, Any]] = {
    400: {
        "model": ErrorResponse,
        "description": "Bad request -- invalid parameters or input",
    },
    401: {
        "model": ErrorResponse,
        "description": "Unauthorized -- missing or invalid authentication token",
    },
    404: {
        "model": ErrorResponse,
        "description": "Not found -- requested resource does not exist",
    },
    422: {
        "model": ErrorResponse,
        "description": "Validation error -- request body or query parameters failed validation",
    },
    429: {
        "model": ErrorResponse,
        "description": "Rate limited -- too many requests, retry after the indicated period",
    },
    500: {
        "model": ErrorResponse,
        "description": "Internal server error -- unexpected failure",
    },
    503: {
        "model": ErrorResponse,
        "description": "Service unavailable -- database or external dependency down",
    },
}
