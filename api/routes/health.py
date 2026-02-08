"""
Health check API routes.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from api.schemas.health import ComponentHealthResponse, HealthResponse
from services.health_service import get_health, HealthStatus

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return structured health status for all platform components."""
    report = get_health()
    status_code = 200 if report.status != HealthStatus.UNHEALTHY else 503

    response = HealthResponse(
        status=report.status.value,
        components=[
            ComponentHealthResponse(
                name=c.name,
                status=c.status.value,
                latency_ms=round(c.latency_ms, 2) if c.latency_ms is not None else None,
                message=c.message,
            )
            for c in report.components
        ],
    )

    if status_code == 503:
        return JSONResponse(
            content=response.model_dump(), status_code=status_code
        )
    return response
