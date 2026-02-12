"""
Health check service for TASI AI Platform.
Provides structured health status for database connectivity, LLM availability,
Redis cache status, entities, market data, and news pipeline.
"""

import logging
import os
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

from config import get_settings

logger = logging.getLogger(__name__)

_STARTUP_TIME = datetime.utcnow()


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
    service: str = "raid-ai-tasi"
    version: str = "1.0.0"
    uptime_seconds: float = 0.0
    components: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "service": self.service,
            "version": self.version,
            "uptime_seconds": round(self.uptime_seconds, 1),
            "components": [
                {
                    "name": c.name,
                    "status": c.status.value,
                    "latency_ms": round(c.latency_ms, 2)
                    if c.latency_ms is not None
                    else None,
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
    """Check LLM API key is configured (does not make a live API call).

    Checks ANTHROPIC_API_KEY / LLM_API_KEY for the Claude Sonnet 4.5 provider.
    """
    settings = get_settings()

    api_key = settings.get_llm_api_key()
    if api_key and len(api_key) > 10:
        return ComponentHealth(
            name="llm",
            status=HealthStatus.HEALTHY,
            message=f"provider=anthropic, model={settings.llm.model}",
        )

    return ComponentHealth(
        name="llm",
        status=HealthStatus.DEGRADED,
        message="No LLM API key configured (set ANTHROPIC_API_KEY or LLM_API_KEY)",
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


def _get_sqlite_path() -> Path:
    """Resolve the SQLite database path."""
    return Path(__file__).resolve().parent.parent / "saudi_stocks.db"


def _sqlite_query(sql: str, db_path: Optional[Path] = None):
    """Execute a read-only SQLite query and return all rows."""
    path = db_path or _get_sqlite_path()
    conn = sqlite3.connect(str(path), timeout=5)
    try:
        return conn.execute(sql).fetchall()
    finally:
        conn.close()


def check_entities() -> ComponentHealth:
    """Check if entities/companies data is accessible."""
    start = time.monotonic()
    try:
        db_path = _get_sqlite_path()
        if not db_path.exists():
            return ComponentHealth(
                name="entities",
                status=HealthStatus.UNHEALTHY,
                latency_ms=(time.monotonic() - start) * 1000,
                message="Database file not found",
            )
        rows = _sqlite_query("SELECT COUNT(*) FROM companies", db_path)
        count = rows[0][0] if rows else 0
        latency = (time.monotonic() - start) * 1000
        return ComponentHealth(
            name="entities",
            status=HealthStatus.HEALTHY if count > 0 else HealthStatus.DEGRADED,
            latency_ms=latency,
            message=f"{count} companies available",
        )
    except Exception as e:
        return ComponentHealth(
            name="entities",
            status=HealthStatus.UNHEALTHY,
            latency_ms=(time.monotonic() - start) * 1000,
            message=str(e),
        )


def check_market_data() -> ComponentHealth:
    """Check if market_data table has data with non-null change_pct."""
    start = time.monotonic()
    try:
        db_path = _get_sqlite_path()
        if not db_path.exists():
            return ComponentHealth(
                name="market_data",
                status=HealthStatus.UNHEALTHY,
                latency_ms=(time.monotonic() - start) * 1000,
                message="Database file not found",
            )
        total_rows = _sqlite_query("SELECT COUNT(*) FROM market_data", db_path)
        total = total_rows[0][0] if total_rows else 0
        pct_rows = _sqlite_query(
            "SELECT COUNT(*) FROM market_data WHERE change_pct IS NOT NULL",
            db_path,
        )
        with_pct = pct_rows[0][0] if pct_rows else 0
        latency = (time.monotonic() - start) * 1000

        if total == 0:
            status = HealthStatus.DEGRADED
            msg = "No market data rows"
        elif with_pct == 0:
            status = HealthStatus.DEGRADED
            msg = f"{total} rows but no change_pct data"
        else:
            status = HealthStatus.HEALTHY
            msg = f"{total} rows, {with_pct} with change_pct"
        return ComponentHealth(
            name="market_data", status=status, latency_ms=latency, message=msg
        )
    except Exception as e:
        return ComponentHealth(
            name="market_data",
            status=HealthStatus.UNHEALTHY,
            latency_ms=(time.monotonic() - start) * 1000,
            message=str(e),
        )


def check_news() -> ComponentHealth:
    """Check if news_articles table exists and has data.

    Returns HEALTHY if articles exist, DEGRADED if no articles,
    UNHEALTHY if the table is missing.
    """
    start = time.monotonic()
    try:
        db_path = _get_sqlite_path()
        if not db_path.exists():
            return ComponentHealth(
                name="news",
                status=HealthStatus.UNHEALTHY,
                latency_ms=(time.monotonic() - start) * 1000,
                message="Database file not found",
            )
        # Check if table exists
        table_check = _sqlite_query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='news_articles'",
            db_path,
        )
        if not table_check:
            return ComponentHealth(
                name="news",
                status=HealthStatus.UNHEALTHY,
                latency_ms=(time.monotonic() - start) * 1000,
                message="news_articles table not found",
            )
        # Count articles and distinct sources
        count_rows = _sqlite_query("SELECT COUNT(*) FROM news_articles", db_path)
        article_count = count_rows[0][0] if count_rows else 0
        source_rows = _sqlite_query(
            "SELECT COUNT(DISTINCT source_name) FROM news_articles", db_path
        )
        source_count = source_rows[0][0] if source_rows else 0
        latency = (time.monotonic() - start) * 1000

        if article_count == 0:
            return ComponentHealth(
                name="news",
                status=HealthStatus.DEGRADED,
                latency_ms=latency,
                message="No articles in news_articles table",
            )
        return ComponentHealth(
            name="news",
            status=HealthStatus.HEALTHY,
            latency_ms=latency,
            message=f"{article_count} articles from {source_count} sources",
        )
    except Exception as e:
        return ComponentHealth(
            name="news",
            status=HealthStatus.UNHEALTHY,
            latency_ms=(time.monotonic() - start) * 1000,
            message=str(e),
        )


def get_uptime_seconds() -> float:
    """Return seconds since the health service module was loaded."""
    return (datetime.utcnow() - _STARTUP_TIME).total_seconds()


def get_health() -> HealthReport:
    """Run all health checks and return a structured report."""
    report = HealthReport()
    report.uptime_seconds = get_uptime_seconds()
    report.components = [
        check_database(),
        check_llm(),
        check_redis(),
        check_entities(),
        check_market_data(),
        check_news(),
    ]

    # Overall status is the worst component status
    statuses = [c.status for c in report.components]
    if HealthStatus.UNHEALTHY in statuses:
        report.status = HealthStatus.UNHEALTHY
    elif HealthStatus.DEGRADED in statuses:
        report.status = HealthStatus.DEGRADED
    else:
        report.status = HealthStatus.HEALTHY

    return report
