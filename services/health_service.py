"""
Health check service for TASI AI Platform.
Provides structured health status for database connectivity, LLM availability,
and Redis cache status.
"""

import sqlite3
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

from config import get_settings


class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class ComponentHealth:
    name: str
    status: HealthStatus
    latency_ms: Optional[float] = None
    message: str = ""


@dataclass
class HealthReport:
    status: HealthStatus = HealthStatus.HEALTHY
    components: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "components": [
                {
                    "name": c.name,
                    "status": c.status.value,
                    "latency_ms": round(c.latency_ms, 2) if c.latency_ms is not None else None,
                    "message": c.message,
                }
                for c in self.components
            ],
        }


def check_database() -> ComponentHealth:
    """Check database connectivity.

    When the connection pool is initialized, uses a pool connection for the
    PostgreSQL check. Falls back to a direct connection otherwise.
    """
    settings = get_settings()
    start = time.monotonic()

    try:
        if settings.db.backend == "postgres":
            from database.pool import is_pool_initialized, get_connection

            if is_pool_initialized():
                # Use the pool
                with get_connection() as conn:
                    cur = conn.cursor()
                    cur.execute("SELECT 1")
                    cur.close()
            else:
                # Fallback to direct connection
                import psycopg2

                conn = psycopg2.connect(
                    host=settings.db.pg_host,
                    port=settings.db.pg_port,
                    dbname=settings.db.pg_database,
                    user=settings.db.pg_user,
                    password=settings.db.pg_password,
                    connect_timeout=5,
                )
                try:
                    cur = conn.cursor()
                    cur.execute("SELECT 1")
                    cur.close()
                finally:
                    conn.close()
        else:
            db_path = settings.db.resolved_sqlite_path
            if not db_path.exists():
                return ComponentHealth(
                    name="database",
                    status=HealthStatus.UNHEALTHY,
                    message=f"SQLite file not found: {db_path}",
                )
            conn = sqlite3.connect(str(db_path), timeout=5)
            try:
                conn.execute("SELECT 1")
            finally:
                conn.close()

        latency = (time.monotonic() - start) * 1000
        return ComponentHealth(
            name="database",
            status=HealthStatus.HEALTHY,
            latency_ms=latency,
            message=f"{settings.db.backend} connected",
        )
    except Exception as e:
        latency = (time.monotonic() - start) * 1000
        return ComponentHealth(
            name="database",
            status=HealthStatus.UNHEALTHY,
            latency_ms=latency,
            message=str(e),
        )


def check_llm() -> ComponentHealth:
    """Check LLM API key is configured (does not make a live API call)."""
    settings = get_settings()
    api_key = settings.get_llm_api_key()

    if api_key and len(api_key) > 10:
        return ComponentHealth(
            name="llm",
            status=HealthStatus.HEALTHY,
            message=f"model={settings.llm.model}",
        )
    return ComponentHealth(
        name="llm",
        status=HealthStatus.DEGRADED,
        message="API key not configured or too short",
    )


def check_redis() -> ComponentHealth:
    """Check Redis cache connectivity.

    Redis is optional -- if caching is disabled the component reports HEALTHY
    with a note that it is disabled. If enabled but unreachable, reports DEGRADED
    (not UNHEALTHY, since the app works without cache).
    """
    settings = get_settings()
    start = time.monotonic()

    if not settings.cache.enabled:
        return ComponentHealth(
            name="redis",
            status=HealthStatus.HEALTHY,
            message="caching disabled",
        )

    try:
        from cache.redis_client import is_redis_available

        available = is_redis_available()
        latency = (time.monotonic() - start) * 1000

        if available:
            return ComponentHealth(
                name="redis",
                status=HealthStatus.HEALTHY,
                latency_ms=latency,
                message="connected",
            )
        return ComponentHealth(
            name="redis",
            status=HealthStatus.DEGRADED,
            latency_ms=latency,
            message="cache enabled but Redis not reachable",
        )
    except Exception as e:
        latency = (time.monotonic() - start) * 1000
        return ComponentHealth(
            name="redis",
            status=HealthStatus.DEGRADED,
            latency_ms=latency,
            message=str(e),
        )


def get_health() -> HealthReport:
    """Run all health checks and return a structured report."""
    report = HealthReport()
    report.components = [check_database(), check_llm(), check_redis()]

    # Overall status is the worst component status
    statuses = [c.status for c in report.components]
    if HealthStatus.UNHEALTHY in statuses:
        report.status = HealthStatus.UNHEALTHY
    elif HealthStatus.DEGRADED in statuses:
        report.status = HealthStatus.DEGRADED
    else:
        report.status = HealthStatus.HEALTHY

    return report
