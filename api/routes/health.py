"""
Health check API routes.

Provides three endpoints:
  /health        - Full health report with all component checks
  /health/live   - Lightweight liveness probe (always 200 if process is running)
  /health/ready  - Readiness probe (200 only if database is reachable)
"""

import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from api.schemas.health import ComponentHealthResponse, HealthResponse
from services.health_service import (
    check_database,
    get_health,
    get_pool_stats,
    get_uptime_seconds,
    HealthStatus,
)

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return structured health status for all platform components."""
    report = await asyncio.to_thread(get_health)
    pool_stats = await asyncio.to_thread(get_pool_stats)
    status_code = 200 if report.status != HealthStatus.UNHEALTHY else 503

    response = HealthResponse(
        status=report.status.value,
        service=report.service,
        version=report.version,
        uptime_seconds=round(report.uptime_seconds, 1),
        components=[
            ComponentHealthResponse(
                name=c.name,
                status=c.status.value,
                latency_ms=round(c.latency_ms, 2) if c.latency_ms is not None else None,
                message=c.message,
            )
            for c in report.components
        ],
        pool_stats=pool_stats,
    )

    if status_code == 503:
        return JSONResponse(content=response.model_dump(), status_code=status_code)
    return response


@router.get("/health/live")
async def liveness():
    """Liveness probe for load balancers and orchestrators.

    Returns 200 if the process is running. Does not check external dependencies.
    """
    return {"status": "alive", "uptime_seconds": round(get_uptime_seconds(), 1)}


@router.get("/health/ready")
async def readiness():
    """Readiness probe — returns 200 only when the database is reachable."""
    db = await asyncio.to_thread(check_database)
    if db.status == HealthStatus.HEALTHY:
        return {"status": "ready"}
    return JSONResponse(
        status_code=503,
        content={"status": "not_ready", "reason": db.message},
    )
