"""
Health check service for TASI AI Platform.
Provides structured health status for database connectivity, LLM availability,
Redis cache status, entities, market data, news pipeline, TASI index cache,
and news scraper scheduler.
"""

import logging
import platform
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional

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
    build_info: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        result = {
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
        if self.build_info:
            result["build_info"] = self.build_info
        return result


def check_database() -> ComponentHealth:
    """Check database connectivity.

    For PostgreSQL, uses the connection pool exclusively.  If the pool has not
    been initialized the check returns ``unhealthy`` immediately — the
    application should not be serving traffic without a healthy pool, and
    falling back to a direct connection would mask a real misconfiguration.

    For SQLite, opens a direct connection to the configured database file.
    """
    settings = get_settings()
    start = time.monotonic()

    try:
        if settings.db.backend == "postgres":
            from database.pool import is_pool_initialized, get_connection

            if not is_pool_initialized():
                latency = (time.monotonic() - start) * 1000
                return ComponentHealth(
                    name="database",
                    status=HealthStatus.UNHEALTHY,
                    latency_ms=latency,
                    message="PostgreSQL connection pool not initialized",
                )

            # Pool is available — use it exclusively; no direct-connection fallback.
            with get_connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT 1")
                cur.close()
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


def _is_pg_backend() -> bool:
    """Return True when the active backend is PostgreSQL."""
    try:
        settings = get_settings()
        return settings.db.backend == "postgres"
    except Exception:
        return False


def _scalar_query(sql: str) -> Any:
    """Execute a scalar query against the active backend.

    Uses the connection pool for PostgreSQL and direct SQLite otherwise.
    """
    if _is_pg_backend():
        from services.db_compat import get_read_connection, scalar_compat

        conn = get_read_connection()
        try:
            return scalar_compat(conn, sql)
        finally:
            conn.close()

    db_path = _get_sqlite_path()
    rows = _sqlite_query(sql, db_path)
    return rows[0][0] if rows else None


def check_entities() -> ComponentHealth:
    """Check if entities/companies data is accessible."""
    start = time.monotonic()
    try:
        if not _is_pg_backend():
            db_path = _get_sqlite_path()
            if not db_path.exists():
                return ComponentHealth(
                    name="entities",
                    status=HealthStatus.UNHEALTHY,
                    latency_ms=(time.monotonic() - start) * 1000,
                    message="Database file not found",
                )
        count = _scalar_query("SELECT COUNT(*) FROM companies") or 0
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
    """Check if market_data table has data with non-null current_price."""
    start = time.monotonic()
    try:
        if not _is_pg_backend():
            db_path = _get_sqlite_path()
            if not db_path.exists():
                return ComponentHealth(
                    name="market_data",
                    status=HealthStatus.UNHEALTHY,
                    latency_ms=(time.monotonic() - start) * 1000,
                    message="Database file not found",
                )
        total = _scalar_query("SELECT COUNT(*) FROM market_data") or 0
        with_price = (
            _scalar_query(
                "SELECT COUNT(*) FROM market_data WHERE current_price IS NOT NULL"
            )
            or 0
        )
        latency = (time.monotonic() - start) * 1000

        if total == 0:
            status = HealthStatus.DEGRADED
            msg = "No market data rows"
        elif with_price == 0:
            status = HealthStatus.DEGRADED
            msg = f"{total} rows but no current_price data"
        else:
            status = HealthStatus.HEALTHY
            msg = f"{total} rows, {with_price} with current_price"
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
        if _is_pg_backend():
            from services.db_compat import (
                get_read_connection,
                scalar_compat,
                table_exists,
            )

            conn = get_read_connection()
            try:
                if not table_exists(conn, "news_articles"):
                    return ComponentHealth(
                        name="news",
                        status=HealthStatus.UNHEALTHY,
                        latency_ms=(time.monotonic() - start) * 1000,
                        message="news_articles table not found",
                    )
                article_count = (
                    scalar_compat(conn, "SELECT COUNT(*) FROM news_articles") or 0
                )
                source_count = (
                    scalar_compat(
                        conn,
                        "SELECT COUNT(DISTINCT source_name) FROM news_articles",
                    )
                    or 0
                )
            finally:
                conn.close()
        else:
            db_path = _get_sqlite_path()
            if not db_path.exists():
                return ComponentHealth(
                    name="news",
                    status=HealthStatus.UNHEALTHY,
                    latency_ms=(time.monotonic() - start) * 1000,
                    message="Database file not found",
                )
            # Check if table exists (SQLite)
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


def check_tasi_index() -> ComponentHealth:
    """Check TASI index data cache and circuit breaker status.

    Reports on whether TASI data is cached, cache age, and whether the
    yfinance circuit breaker is open.  This check is non-fatal: if the
    ``services.tasi_index`` module is unavailable, the component reports
    DEGRADED rather than UNHEALTHY.
    """
    start = time.monotonic()
    try:
        from services.tasi_index import get_cache_status, get_circuit_breaker_status

        cache_info = get_cache_status()
        cb_info = get_circuit_breaker_status()
        latency = (time.monotonic() - start) * 1000

        cache_status = cache_info.get("cache_status", "unknown")
        cache_age = cache_info.get("cache_age_seconds")
        circuit_state = cb_info.get("circuit_state", "unknown")
        consecutive_failures = cb_info.get("consecutive_failures", 0)

        # Build a descriptive message
        parts = [f"cache={cache_status}"]
        if cache_age is not None:
            parts.append(f"age={cache_age}s")
        parts.append(f"circuit_breaker={circuit_state}")
        if consecutive_failures > 0:
            parts.append(f"failures={consecutive_failures}")
        message = ", ".join(parts)

        # Determine status
        if circuit_state == "open":
            status = HealthStatus.DEGRADED
        elif cache_status == "empty":
            status = HealthStatus.DEGRADED
        else:
            status = HealthStatus.HEALTHY

        return ComponentHealth(
            name="tasi_index",
            status=status,
            latency_ms=latency,
            message=message,
        )
    except ImportError:
        latency = (time.monotonic() - start) * 1000
        return ComponentHealth(
            name="tasi_index",
            status=HealthStatus.DEGRADED,
            latency_ms=latency,
            message="tasi_index module not available",
        )
    except Exception as e:
        latency = (time.monotonic() - start) * 1000
        return ComponentHealth(
            name="tasi_index",
            status=HealthStatus.DEGRADED,
            latency_ms=latency,
            message=str(e),
        )


def check_news_scraper() -> ComponentHealth:
    """Check news scraper scheduler status.

    Inspects the running ``NewsScheduler`` instance (via ``app._news_scheduler``)
    to determine if the scheduler thread is alive. Falls back to querying the
    ``news_articles`` table in ``news_feed`` (SQLite) for recent scrape activity.

    This check complements the existing ``check_news()`` function which checks
    the ``news_articles`` table data. This one focuses on the *scraper process*
    health: is the scheduler running, when was the last scrape, and how many
    sources are producing articles.
    """
    start = time.monotonic()
    try:
        scheduler_running = False
        scheduler_info = "scheduler not found"

        # Try to access the scheduler instance from app module
        try:
            import app as _app_module

            scheduler = getattr(_app_module, "_news_scheduler", None)
            if scheduler is not None:
                scheduler_running = getattr(scheduler, "_running", False)
                thread = getattr(scheduler, "_thread", None)
                thread_alive = thread.is_alive() if thread else False
                if scheduler_running and thread_alive:
                    scheduler_info = "running"
                elif scheduler_running and not thread_alive:
                    scheduler_info = "flag=running but thread dead"
                else:
                    scheduler_info = "stopped"
            else:
                scheduler_info = "not initialized"
        except (ImportError, AttributeError):
            scheduler_info = "unable to inspect"

        # Check recent scrape activity from the news_articles table
        active_sources = 0
        last_scrape_age = None

        try:
            if _is_pg_backend():
                from services.db_compat import get_read_connection, scalar_compat

                conn = get_read_connection()
                try:
                    last_created = scalar_compat(
                        conn, "SELECT MAX(created_at) FROM news_articles"
                    )
                    if last_created:
                        try:
                            if hasattr(last_created, "timestamp"):
                                # PG returns datetime objects
                                last_scrape_age = (
                                    datetime.utcnow() - last_created
                                ).total_seconds()
                            else:
                                last_dt = datetime.fromisoformat(str(last_created))
                                last_scrape_age = (
                                    datetime.utcnow() - last_dt
                                ).total_seconds()
                        except (ValueError, TypeError):
                            pass

                    active_sources = (
                        scalar_compat(
                            conn,
                            "SELECT COUNT(DISTINCT source_name) FROM news_articles "
                            "WHERE created_at > NOW() - INTERVAL '1 day'",
                        )
                        or 0
                    )
                finally:
                    conn.close()
            else:
                db_path = _get_sqlite_path()
                if db_path.exists():
                    rows = _sqlite_query(
                        "SELECT MAX(created_at) FROM news_articles", db_path
                    )
                    last_created = rows[0][0] if rows and rows[0][0] else None
                    if last_created:
                        try:
                            last_dt = datetime.fromisoformat(last_created)
                            last_scrape_age = (
                                datetime.utcnow() - last_dt
                            ).total_seconds()
                        except (ValueError, TypeError):
                            pass

                    source_rows = _sqlite_query(
                        "SELECT COUNT(DISTINCT source_name) FROM news_articles "
                        "WHERE created_at > datetime('now', '-1 day')",
                        db_path,
                    )
                    active_sources = source_rows[0][0] if source_rows else 0
        except Exception:
            pass  # DB query failures are non-fatal here

        latency = (time.monotonic() - start) * 1000

        # Build message
        parts = [f"scheduler={scheduler_info}"]
        if last_scrape_age is not None:
            if last_scrape_age < 3600:
                age_str = f"{int(last_scrape_age / 60)}m ago"
            elif last_scrape_age < 86400:
                age_str = f"{last_scrape_age / 3600:.1f}h ago"
            else:
                age_str = f"{last_scrape_age / 86400:.1f}d ago"
            parts.append(f"last_scrape={age_str}")
        parts.append(f"active_sources={active_sources}/5")

        message = ", ".join(parts)

        # Determine status
        if scheduler_info == "running" and active_sources > 0:
            status = HealthStatus.HEALTHY
        elif scheduler_info == "running":
            # Running but no recent articles from any source
            status = HealthStatus.DEGRADED
        elif active_sources > 0:
            # Scheduler not running but we have recent articles (maybe just started)
            status = HealthStatus.DEGRADED
        else:
            status = HealthStatus.DEGRADED

        return ComponentHealth(
            name="news_scraper",
            status=status,
            latency_ms=latency,
            message=message,
        )
    except Exception as e:
        latency = (time.monotonic() - start) * 1000
        return ComponentHealth(
            name="news_scraper",
            status=HealthStatus.DEGRADED,
            latency_ms=latency,
            message=str(e),
        )


def _get_build_info() -> Dict[str, Any]:
    """Collect version and build information for the health report.

    Includes LLM model name, database backend type, and Python version.
    """
    settings = get_settings()
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "db_backend": settings.db.backend,
        "llm_model": settings.llm.model,
    }


def get_pool_stats() -> Dict[str, Any]:
    """Return connection pool statistics for the active backend.

    For SQLite: returns pool_size from the SQLitePool instance.
    For PostgreSQL: returns minconn/maxconn from ThreadedConnectionPool.
    Always returns a dict and never raises.
    """
    try:
        settings = get_settings()
        backend = settings.db.backend
    except Exception:
        backend = "sqlite"

    if backend == "postgres":
        try:
            from database.pool import _pool as _pg_pool

            if _pg_pool is not None:
                return {
                    "backend": "postgres",
                    "min": _pg_pool.minconn,
                    "max": _pg_pool.maxconn,
                }
            return {"backend": "postgres", "pool_size": "unknown"}
        except Exception:
            return {"backend": "postgres", "pool_size": "unknown"}
    else:
        try:
            from services.sqlite_pool import _pool as _sq_pool

            if _sq_pool is not None:
                pool_size = _sq_pool.pool_size
                return {"backend": "sqlite", "pool_size": pool_size}
            return {"backend": "sqlite", "pool_size": "unknown"}
        except Exception:
            return {"backend": "sqlite", "pool_size": "unknown"}


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
        check_tasi_index(),
        check_news_scraper(),
    ]

    # Overall status is the worst component status
    statuses = [c.status for c in report.components]
    if HealthStatus.UNHEALTHY in statuses:
        report.status = HealthStatus.UNHEALTHY
    elif HealthStatus.DEGRADED in statuses:
        report.status = HealthStatus.DEGRADED
    else:
        report.status = HealthStatus.HEALTHY

    # Attach version/build metadata
    try:
        report.build_info = _get_build_info()
    except Exception as e:
        logger.warning("Failed to collect build info: %s", e)
        report.build_info = {"error": str(e)}

    return report
