"""
Application lifecycle handlers for startup and shutdown.

Provides structured logging of startup diagnostics and graceful shutdown
coordination. Designed to be called from the FastAPI lifespan context.

Usage in app.py:
    from config.lifecycle import on_startup, on_shutdown

    async def lifespan(app):
        on_startup()
        yield
        on_shutdown()
"""

import logging
import sys
import time

logger = logging.getLogger(__name__)

_APP_VERSION = "1.0.0"
_start_time: float = 0.0


def on_startup() -> None:
    """Run startup diagnostics.

    Logs version, Python info, database backend, and validates environment.
    """
    global _start_time
    _start_time = time.monotonic()

    logger.info("=" * 60)
    logger.info("Ra'd AI TASI Platform v%s starting", _APP_VERSION)
    logger.info("Python %s on %s", sys.version.split()[0], sys.platform)

    # Validate environment variables
    try:
        from config.env_validator import validate_and_log

        if not validate_and_log():
            logger.critical(
                "Startup aborted: environment validation errors must be resolved before starting."
            )
            sys.exit(1)
    except ImportError:
        logger.debug("env_validator not available, skipping validation")

    # Log database backend
    try:
        from config import get_settings

        settings = get_settings()
        logger.info("Database backend: %s", settings.db.backend.upper())
        logger.info("Server: %s:%d", settings.server.host, settings.server.port)
    except Exception as exc:
        logger.warning("Could not load settings: %s", exc)

    # Log connection pool status
    try:
        from config import get_settings as _get_settings

        _settings = _get_settings()
        if _settings.db.backend == "postgres":
            try:
                from database.pool import _pool

                if _pool is not None:
                    logger.info("PG pool: min=%d max=%d", _pool.minconn, _pool.maxconn)
                else:
                    logger.info("PG pool: not yet initialized")
            except Exception as _exc:
                logger.debug("Could not read PG pool status: %s", _exc)
        else:
            try:
                from services.sqlite_pool import _pool as _sq_pool

                if _sq_pool is not None:
                    logger.info("SQLite pool: size=%d", _sq_pool.pool_size)
                else:
                    logger.info("SQLite pool: not yet initialized")
            except Exception as _exc:
                logger.debug("Could not read SQLite pool status: %s", _exc)
    except Exception as _exc:
        logger.debug("Pool status check failed: %s", _exc)

    # Log Prometheus availability
    try:
        import prometheus_fastapi_instrumentator  # noqa: F401

        logger.info("Prometheus metrics: available at /metrics")
    except ImportError:
        logger.info("Prometheus metrics: not installed")

    logger.info("=" * 60)


def on_shutdown() -> None:
    """Run graceful shutdown procedures.

    Logs shutdown timing and flushes log handlers.
    """
    elapsed = time.monotonic() - _start_time if _start_time else 0
    logger.info("Shutting down after %.1f seconds of uptime", elapsed)

    # Flush all log handlers to ensure nothing is lost
    for handler in logging.root.handlers:
        try:
            handler.flush()
        except Exception:  # noqa: BLE001 — shutdown teardown, nothing useful to do
            pass

    logger.info("Shutdown complete")
