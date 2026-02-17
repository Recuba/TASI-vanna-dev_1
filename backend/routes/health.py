"""
Health check API routes for Ra'd AI TASI platform.

Provides three endpoints (no auth required):

    GET /health         -> Liveness probe (always 200 if process is running)
    GET /ready          -> Readiness probe (checks DB, Redis, Vanna/LLM)
    GET /metrics/basic  -> Basic operational metrics (uptime, request counts,
                           connections, error rate, circuit breaker states)
"""

import logging
import threading
import time
from typing import Any, List, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

_START_TIME = time.monotonic()
_REQUEST_COUNTER = 0
_ERROR_COUNTER = 0
_counter_lock = threading.Lock()


def record_request(*, is_error: bool = False) -> None:
    """Increment global request counters (called from middleware)."""
    global _REQUEST_COUNTER, _ERROR_COUNTER
    with _counter_lock:
        _REQUEST_COUNTER += 1
        if is_error:
            _ERROR_COUNTER += 1


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class LivenessResponse(BaseModel):
    """Response for GET /health (liveness probe)."""

    status: str = Field(default="alive", description="Always 'alive' if process is up")
    uptime_seconds: float = Field(description="Seconds since process start")


class ComponentReadiness(BaseModel):
    """Readiness status of a single dependency."""

    name: str = Field(description="Dependency name")
    ready: bool = Field(description="Whether the dependency is reachable")
    latency_ms: Optional[float] = Field(
        default=None, description="Check latency in milliseconds"
    )
    message: str = Field(default="", description="Human-readable status detail")


class ReadinessResponse(BaseModel):
    """Response for GET /ready."""

    status: str = Field(description="'ready' or 'not_ready'")
    components: List[ComponentReadiness] = Field(default_factory=list)


class CircuitBreakerMetric(BaseModel):
    """Snapshot of a single circuit breaker for the metrics endpoint."""

    name: str
    state: str
    failure_count: int
    total_failures: int
    total_successes: int
    total_rejected: int


class BasicMetricsResponse(BaseModel):
    """Response for GET /metrics/basic."""

    uptime_seconds: float
    total_requests: int
    total_errors: int
    error_rate: float = Field(description="Errors / requests (0.0 if no requests)")
    circuit_breakers: List[CircuitBreakerMetric] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Dependency check helpers
# ---------------------------------------------------------------------------


async def _check_database() -> ComponentReadiness:
    """Check whether the database (SQLite or PostgreSQL) is reachable."""
    start = time.monotonic()
    try:
        from services.health_service import check_database, HealthStatus

        result = check_database()
        latency = (time.monotonic() - start) * 1000
        return ComponentReadiness(
            name="database",
            ready=result.status == HealthStatus.HEALTHY,
            latency_ms=round(latency, 2),
            message=result.message,
        )
    except Exception as exc:
        latency = (time.monotonic() - start) * 1000
        return ComponentReadiness(
            name="database",
            ready=False,
            latency_ms=round(latency, 2),
            message=str(exc),
        )


async def _check_redis() -> ComponentReadiness:
    """Check whether Redis cache is reachable (non-fatal if disabled)."""
    start = time.monotonic()
    try:
        from services.health_service import check_redis, HealthStatus

        result = check_redis()
        latency = (time.monotonic() - start) * 1000
        return ComponentReadiness(
            name="redis",
            ready=result.status != HealthStatus.UNHEALTHY,
            latency_ms=round(latency, 2),
            message=result.message,
        )
    except Exception as exc:
        latency = (time.monotonic() - start) * 1000
        return ComponentReadiness(
            name="redis",
            ready=False,
            latency_ms=round(latency, 2),
            message=str(exc),
        )


async def _check_llm() -> ComponentReadiness:
    """Check whether the LLM API key is configured."""
    start = time.monotonic()
    try:
        from services.health_service import check_llm, HealthStatus

        result = check_llm()
        latency = (time.monotonic() - start) * 1000
        return ComponentReadiness(
            name="vanna_llm",
            ready=result.status == HealthStatus.HEALTHY,
            latency_ms=round(latency, 2),
            message=result.message,
        )
    except Exception as exc:
        latency = (time.monotonic() - start) * 1000
        return ComponentReadiness(
            name="vanna_llm",
            ready=False,
            latency_ms=round(latency, 2),
            message=str(exc),
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/health",
    response_model=LivenessResponse,
    summary="Liveness probe",
    description="Returns 200 if the process is running. No dependency checks.",
)
async def liveness() -> LivenessResponse:
    """Liveness probe -- always returns 200 if the process is up."""
    uptime = time.monotonic() - _START_TIME
    return LivenessResponse(uptime_seconds=round(uptime, 1))


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe",
    description="Checks PG/SQLite, Redis, and Vanna LLM. Returns 200 or 503.",
)
async def readiness() -> Any:
    """Readiness probe -- returns 200 when all critical deps are reachable.

    Database is the only hard requirement; Redis and LLM being unavailable
    results in 503 but are logged as warnings rather than errors.
    """
    components = [
        await _check_database(),
        await _check_redis(),
        await _check_llm(),
    ]

    # Database is the hard gate; others are soft checks
    db_ready = components[0].ready
    all_ready = all(c.ready for c in components)

    if not db_ready:
        return JSONResponse(
            status_code=503,
            content=ReadinessResponse(
                status="not_ready", components=components
            ).model_dump(),
        )

    if not all_ready:
        return JSONResponse(
            status_code=503,
            content=ReadinessResponse(
                status="not_ready", components=components
            ).model_dump(),
        )

    return ReadinessResponse(status="ready", components=components)


@router.get(
    "/metrics/basic",
    response_model=BasicMetricsResponse,
    summary="Basic operational metrics",
    description="Uptime, request counts, error rate, circuit breaker states.",
)
async def basic_metrics() -> BasicMetricsResponse:
    """Return basic operational metrics for monitoring dashboards."""
    uptime = time.monotonic() - _START_TIME

    # Collect circuit breaker stats
    cb_metrics: List[CircuitBreakerMetric] = []
    try:
        from backend.services.resilience.circuit_breaker import get_all_stats

        for stats in get_all_stats():
            cb_metrics.append(
                CircuitBreakerMetric(
                    name=stats.name,
                    state=stats.state.value,
                    failure_count=stats.failure_count,
                    total_failures=stats.total_failures,
                    total_successes=stats.total_successes,
                    total_rejected=stats.total_rejected,
                )
            )
    except ImportError:
        logger.debug("Circuit breaker module not available for metrics")

    error_rate = (_ERROR_COUNTER / _REQUEST_COUNTER) if _REQUEST_COUNTER > 0 else 0.0

    return BasicMetricsResponse(
        uptime_seconds=round(uptime, 1),
        total_requests=_REQUEST_COUNTER,
        total_errors=_ERROR_COUNTER,
        error_rate=round(error_rate, 4),
        circuit_breakers=cb_metrics,
    )
