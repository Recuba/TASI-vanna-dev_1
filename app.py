"""
Vanna 2.0 Saudi Stock Market Analyst
=====================================
Connects to a SQLite or PostgreSQL database of ~500 Saudi-listed companies
and exposes a FastAPI chat interface powered by Claude Sonnet 4.5
via the Anthropic API.

Set DB_BACKEND=postgres (with POSTGRES_* env vars) to use PostgreSQL.
Default is SQLite.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:
    from vanna.core.tool import ToolSchema
from dotenv import load_dotenv

load_dotenv()

from vanna import Agent, AgentConfig, ToolRegistry
from vanna.core.system_prompt.base import SystemPromptBuilder
from vanna.core.user.resolver import UserResolver, RequestContext, User
from vanna.integrations.local.agent_memory.in_memory import DemoAgentMemory
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.sqlite import SqliteRunner
from vanna.integrations.postgres import PostgresRunner
from vanna.servers.fastapi import VannaFastAPIServer
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from vanna.tools import RunSqlTool, VisualizeDataTool
import jwt
from chart_engine import RaidChartGenerator
from config.prompts import SAUDI_STOCKS_SYSTEM_PROMPT, PG_NOTES

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 0. Configuration (fail fast on invalid configuration)
# ---------------------------------------------------------------------------
from config import get_settings

_settings = get_settings()

_HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# 1. LLM -- Claude Sonnet 4.5 via Anthropic API
# ---------------------------------------------------------------------------
_llm_model = _settings.llm.model if _settings else "claude-sonnet-4-5-20250929"
_llm_api_key = (
    _settings.get_llm_api_key()
    if _settings
    else os.environ.get("ANTHROPIC_API_KEY", "")
)

llm = AnthropicLlmService(
    model=_llm_model,
    api_key=_llm_api_key,
)
logger.info("LLM configured: model=%s, provider=anthropic", _llm_model)

# ---------------------------------------------------------------------------
# 2. SQL runner -- SQLite (default) or PostgreSQL
# ---------------------------------------------------------------------------
DB_BACKEND = (_settings.db.backend if _settings else "sqlite").lower()


def _create_sql_runner():
    """Create the SQL runner based on configuration."""
    if DB_BACKEND == "postgres":
        if _settings:
            return PostgresRunner(
                host=_settings.db.pg_host,
                database=_settings.db.pg_database,
                user=_settings.db.pg_user,
                password=_settings.db.pg_password,
                port=_settings.db.pg_port,
            )
        # Fallback only when settings module failed to load entirely
        logger.warning("Config unavailable for PostgreSQL; using env var fallbacks")
        return PostgresRunner(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            database=os.environ.get("POSTGRES_DB", "saudi_stocks"),
            user=os.environ.get("POSTGRES_USER", "postgres"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
        )
    if _settings:
        return SqliteRunner(str(_settings.db.resolved_sqlite_path))
    return SqliteRunner(str(_HERE / "saudi_stocks.db"))


sql_runner = _create_sql_runner()

# ---------------------------------------------------------------------------
# 3. Tool registry
# ---------------------------------------------------------------------------
tools = ToolRegistry()
tools.register_local_tool(
    RunSqlTool(sql_runner=sql_runner), access_groups=["admin", "user"]
)
tools.register_local_tool(
    VisualizeDataTool(plotly_generator=RaidChartGenerator()),
    access_groups=["admin", "user"],
)


# ---------------------------------------------------------------------------
# 4. User resolver (JWT-aware; auth required in PostgreSQL mode)
# ---------------------------------------------------------------------------
class JWTUserResolver(UserResolver):
    """Resolve user identity from JWT token.

    Authentication is optional: if a valid token is present, the user
    identity is extracted from it. Otherwise, an anonymous user is returned.
    Invalid tokens are still rejected to prevent confusion.
    """

    async def resolve_user(self, request_context: RequestContext) -> User:
        auth_header = request_context.get_header("authorization")

        token = None
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header[7:]

        if not token:
            return User(
                id="anonymous",
                email="anonymous@localhost",
                group_memberships=["user"],
            )

        try:
            from auth.jwt_handler import decode_token

            payload = decode_token(token, expected_type="access")
            user_id = payload.get("sub", "authenticated_user")
            email = payload.get("email", "user@localhost")
            return User(
                id=str(user_id),
                email=email,
                group_memberships=["user"],
            )
        except (jwt.PyJWTError, ValueError, KeyError):
            raise ValueError("Invalid or expired authentication token")


# ---------------------------------------------------------------------------
# 5. System prompt builder -- uses extracted prompt from config/prompts.py
# ---------------------------------------------------------------------------
class SaudiStocksSystemPromptBuilder(SystemPromptBuilder):
    """Provides the LLM with full schema documentation for the Saudi stocks DB."""

    async def build_system_prompt(
        self, user: User, tools: List["ToolSchema"]
    ) -> Optional[str]:
        if DB_BACKEND == "postgres":
            return SAUDI_STOCKS_SYSTEM_PROMPT + PG_NOTES
        return SAUDI_STOCKS_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 6. Agent configuration
# ---------------------------------------------------------------------------
_max_iterations = _settings.llm.max_tool_iterations if _settings else 10

config = AgentConfig(
    stream_responses=True,
    max_tool_iterations=_max_iterations,
)

# ---------------------------------------------------------------------------
# 7. Assemble the agent
# ---------------------------------------------------------------------------
agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=JWTUserResolver(),
    # Production-safe memory limit: each item can contain large SQL results
    # or Plotly chart JSON. 500 items ~= 50 conversations * 10 turns each.
    # For persistent storage, replace with a database-backed AgentMemory.
    agent_memory=DemoAgentMemory(max_items=500),
    system_prompt_builder=SaudiStocksSystemPromptBuilder(),
    config=config,
)

# ---------------------------------------------------------------------------
# 8. FastAPI server
# ---------------------------------------------------------------------------
server = VannaFastAPIServer(agent)
app = server.create_app()

# ---------------------------------------------------------------------------
# 8.05. Prometheus metrics (optional -- gracefully skipped if not installed)
# ---------------------------------------------------------------------------
try:
    from prometheus_fastapi_instrumentator import Instrumentator as _PIInstrumentator
    _pfi = _PIInstrumentator(should_group_status_codes=True, should_group_untemplated=True)
    _pfi.instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
    logger.info("Prometheus metrics exposed at /metrics")
except ImportError:
    logger.warning("prometheus-fastapi-instrumentator not installed; /metrics unavailable")

# ---------------------------------------------------------------------------
# 8.1. OpenAPI metadata
# ---------------------------------------------------------------------------
app.title = "Ra'd AI — TASI Market Analytics API"
app.description = (
    "AI-powered Saudi Stock Market analytics platform built on Vanna 2.0. "
    "Provides natural-language SQL queries, chart generation, market analytics, "
    "news aggregation, and stock data for ~500 TASI-listed companies."
)
app.version = "2.0.0"
app.openapi_tags = [
    {"name": "health", "description": "Platform health checks"},
    {"name": "auth", "description": "Authentication and user management"},
    {"name": "entities", "description": "Company/stock entity lookup and listing"},
    {
        "name": "stock-data",
        "description": "Per-stock dividends, financials, comparison, and quotes",
    },
    {
        "name": "market-analytics",
        "description": "Market movers, summary, sector analytics, heatmap",
    },
    {
        "name": "charts-analytics",
        "description": "Pre-built chart data (sector market cap, P/E, dividends)",
    },
    {
        "name": "market-overview",
        "description": "World 360 global market overview (10 instruments)",
    },
    {"name": "tasi-index", "description": "TASI index OHLCV data and health"},
    {"name": "stock-ohlcv", "description": "Per-stock OHLCV chart data"},
    {
        "name": "news-feed",
        "description": "Live news feed from Arabic financial sources",
    },
    {"name": "news", "description": "News articles (PostgreSQL-backed)"},
    {"name": "reports", "description": "Technical/analyst reports (dual-backend)"},
    {
        "name": "announcements",
        "description": "CMA/Tadawul announcements (PostgreSQL-backed)",
    },
    {"name": "watchlists", "description": "User watchlists and alerts (authenticated)"},
]

# Remove Vanna's default "/" route so our custom template takes precedence
app.routes[:] = [
    r
    for r in app.routes
    if not (
        hasattr(r, "path")
        and r.path == "/"
        and hasattr(r, "methods")
        and "GET" in r.methods
    )
]

# Remove Vanna's default CORSMiddleware (allow_origins=["*"]) so our
# configured CORS settings (from MiddlewareSettings) take effect.
from fastapi.middleware.cors import CORSMiddleware as _CORSMiddleware

app.user_middleware[:] = [
    m for m in app.user_middleware if m.cls is not _CORSMiddleware
]

# ---------------------------------------------------------------------------
# 8a. Middleware (outermost first: error_handler -> request_logging -> rate_limit -> CORS)
# ---------------------------------------------------------------------------
try:
    from middleware.error_handler import (
        ErrorHandlerMiddleware,
        install_exception_handlers,
    )
    from middleware.request_logging import RequestLoggingMiddleware
    from middleware.rate_limit import RateLimitMiddleware
    from middleware.cors import setup_cors

    _mw_settings = _settings.middleware if _settings else None

    _cors_origins = (
        _mw_settings.cors_origins_list
        if _mw_settings
        else ["http://localhost:3000", "http://localhost:8084"]
    )

    # Dynamically add origins from environment variables if not already present
    import os as _os

    _frontend_url = _os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    if _frontend_url and _frontend_url not in _cors_origins:
        _cors_origins.append(_frontend_url)

    _railway_domain = _os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip()
    if _railway_domain:
        _railway_origin = (
            f"https://{_railway_domain}"
            if not _railway_domain.startswith("http")
            else _railway_domain
        )
        if _railway_origin not in _cors_origins:
            _cors_origins.append(_railway_origin)

    _rate_limit = _mw_settings.rate_limit_per_minute if _mw_settings else 60
    _skip_paths = (
        _mw_settings.log_skip_paths_list
        if _mw_settings
        else ["/health", "/favicon.ico"]
    )
    _debug_mode = _settings.server.debug if _settings else False

    # CORS is applied via FastAPI's add_middleware (innermost)
    setup_cors(app, _cors_origins)

    # GZip compression (after CORS, before rate limiter)
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Rate limiter (skip in debug mode)
    if not _debug_mode:
        app.add_middleware(
            RateLimitMiddleware,
            requests_per_minute=_rate_limit,
            skip_paths=["/health"],
            path_limits={
                "/api/auth/login": 10,
                "/api/auth/register": 10,
                "/api/v1/charts": 120,
            },
        )

    # Request logging
    app.add_middleware(
        RequestLoggingMiddleware,
        skip_paths=_skip_paths,
    )

    # Error handler (outermost -- catches everything)
    app.add_middleware(ErrorHandlerMiddleware)

    # Register exception handlers for HTTPException and RequestValidationError
    # so all error responses use the same {"error": {...}} shape.
    install_exception_handlers(app)

    logger.info(
        "Middleware stack initialized (CORS, rate_limit, logging, error_handler)"
    )
except ImportError as exc:
    logger.warning("Middleware modules not available, skipping: %s", exc)

# Postgres mode: validate JWT for Vanna chat HTTP endpoints if present.
# Anonymous access is allowed (token optional), but invalid tokens are rejected.
if DB_BACKEND == "postgres":
    from fastapi import Request as _Request

    @app.middleware("http")
    async def _require_chat_auth(request: _Request, call_next):
        if request.url.path in ("/api/vanna/v2/chat_sse", "/api/vanna/v2/chat_poll"):
            auth_header = request.headers.get("authorization", "")
            if auth_header.lower().startswith("bearer "):
                token = auth_header[7:]
                try:
                    from auth.jwt_handler import decode_token

                    decode_token(token, expected_type="access")
                except (jwt.PyJWTError, ValueError, KeyError):
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Invalid or expired authentication token"},
                    )
            # If no auth header, allow through (anonymous access)
        return await call_next(request)


# ---------------------------------------------------------------------------
# 9. API routers -- always registered, with graceful degradation
# ---------------------------------------------------------------------------
# Health route works with both backends (health_service checks backend internally)
try:
    from api.routes.health import router as health_router

    app.include_router(health_router)
    logger.info("Health route registered at /health")
except ImportError as exc:
    logger.warning("Health route not available: %s", exc)

# Reports route works with both SQLite and PostgreSQL backends.
try:
    from api.routes.reports import router as reports_router

    app.include_router(reports_router)
    logger.info("Reports route registered (dual-backend)")
except ImportError as exc:
    logger.warning("Reports route not available: %s", exc)

# PG-backed service routes: register in postgres mode for news,
# announcements, watchlists. Entities and charts have SQLite fallbacks
# registered below (section 9g/9h), so PG versions are optional.
if DB_BACKEND == "postgres":
    try:
        from api.routes.news import router as news_router
        from api.routes.announcements import router as announcements_router
        from api.routes.watchlists import router as watchlists_router
        from api.routes.entities import router as pg_entities_router

        app.include_router(news_router)
        app.include_router(announcements_router)
        app.include_router(watchlists_router)
        app.include_router(pg_entities_router)
        logger.info(
            "PG-backed service routes registered (news, announcements, watchlists, entities)"
        )
    except ImportError as exc:
        logger.warning("PG service routes not available: %s", exc)
else:
    # SQLite mode: register stub routers that return 503 for PG-only endpoints
    # (news, announcements, watchlists). Entities and charts have
    # real SQLite handlers registered in sections 9g/9h below.
    from fastapi import APIRouter as _APIRouter

    _pg_stub_configs = [
        ("/api/news", "news"),
        ("/api/announcements", "announcements"),
        ("/api/watchlists", "watchlists"),
    ]

    for _prefix, _tag in _pg_stub_configs:
        _stub = _APIRouter(prefix=_prefix, tags=[_tag])

        # Capture prefix in closure
        def _make_stub_handler(prefix: str):
            async def _stub_handler():
                return JSONResponse(
                    status_code=503,
                    content={
                        "detail": "This endpoint requires PostgreSQL backend. "
                        "Current backend: SQLite. Set DB_BACKEND=postgres to enable.",
                        "endpoint_prefix": prefix,
                    },
                )

            return _stub_handler

        _all_methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
        _stub.add_api_route("", _make_stub_handler(_prefix), methods=_all_methods)
        _stub.add_api_route(
            "/{path:path}", _make_stub_handler(_prefix), methods=_all_methods
        )
        app.include_router(_stub)

    logger.info("SQLite mode: PG-only endpoint stubs registered (503 responses)")

# Auth routes (guest endpoint works with any backend; login/register need PG)
try:
    from api.routes.auth import router as auth_router

    app.include_router(auth_router)
    logger.info("Auth routes registered at /api/auth")
except ImportError as exc:
    logger.warning("Auth routes not available: %s", exc)


# ---------------------------------------------------------------------------
# 9b. TASI index route (no database dependency -- works with any backend)
# ---------------------------------------------------------------------------
try:
    from api.routes.tasi_index import router as tasi_index_router

    app.include_router(tasi_index_router)
    logger.info("TASI index route registered at /api/v1/charts/tasi/index")
except ImportError as exc:
    logger.warning("TASI index route not available: %s", exc)

# ---------------------------------------------------------------------------
# 9c. Per-stock OHLCV route (no database dependency -- works with any backend)
# ---------------------------------------------------------------------------
try:
    from api.routes.stock_ohlcv import router as stock_ohlcv_router

    app.include_router(stock_ohlcv_router)
    logger.info("Stock OHLCV route registered at /api/v1/charts/{ticker}/ohlcv")
except ImportError as exc:
    logger.warning("Stock OHLCV route not available: %s", exc)

# ---------------------------------------------------------------------------
# 9d. News feed route (SQLite-backed -- works with any backend)
# ---------------------------------------------------------------------------
try:
    from api.routes.news_feed import router as news_feed_router

    app.include_router(news_feed_router)
    logger.info("News feed route registered at /api/v1/news/feed")
except ImportError as exc:
    logger.warning("News feed route not available: %s", exc)

# ---------------------------------------------------------------------------
# 9d-2. News SSE stream route (real-time push via Server-Sent Events)
# ---------------------------------------------------------------------------
try:
    from api.routes.news_stream import router as news_stream_router

    app.include_router(news_stream_router)
    logger.info("News stream route registered at /api/v1/news/stream")
except ImportError as exc:
    logger.warning("News stream route not available: %s", exc)


# ---------------------------------------------------------------------------
# 9d-3. Live market widgets SSE stream (Redis-backed)
# ---------------------------------------------------------------------------
try:
    from api.routes.widgets_stream import router as widgets_stream_router

    app.include_router(widgets_stream_router)
    logger.info("Widgets stream route registered at /api/v1/widgets/quotes/stream")
except ImportError as exc:
    logger.warning("Widgets stream route not available: %s", exc)

# ---------------------------------------------------------------------------
# 9d-4. Market overview route (World 360 page -- no database dependency)
# ---------------------------------------------------------------------------
try:
    from api.routes.market_overview import router as market_overview_router

    app.include_router(market_overview_router)
    logger.info("Market overview route registered at /api/v1/market-overview")
except ImportError as exc:
    logger.warning("Market overview route not available: %s", exc)

# ---------------------------------------------------------------------------
# 9e. Market analytics routes (Dual-backend (SQLite/PostgreSQL) -- works with any backend)
# ---------------------------------------------------------------------------
try:
    from api.routes.market_analytics import router as market_analytics_router

    app.include_router(market_analytics_router)
    logger.info("Market analytics routes registered at /api/v1/market")
except ImportError as exc:
    logger.warning("Market analytics routes not available: %s", exc)

# ---------------------------------------------------------------------------
# 9f. Stock data routes (Dual-backend (SQLite/PostgreSQL) -- works with any backend)
# ---------------------------------------------------------------------------
try:
    from api.routes.stock_data import router as stock_data_router

    app.include_router(stock_data_router)
    logger.info("Stock data routes registered at /api/v1/stocks")
except ImportError as exc:
    logger.warning("Stock data routes not available: %s", exc)

# ---------------------------------------------------------------------------
# 9g. SQLite entities routes (registered only when using SQLite backend)
# ---------------------------------------------------------------------------
if DB_BACKEND != "postgres":
    try:
        from api.routes.sqlite_entities import router as sqlite_entities_router

        app.include_router(sqlite_entities_router)
        logger.info("SQLite entities routes registered at /api/entities")
    except ImportError as exc:
        logger.warning("SQLite entities routes not available: %s", exc)

# ---------------------------------------------------------------------------
# 9h. Chart analytics routes (Dual-backend (SQLite/PostgreSQL))
# ---------------------------------------------------------------------------
try:
    from api.routes.charts_analytics import router as charts_analytics_router

    app.include_router(charts_analytics_router)
    logger.info("SQLite chart analytics routes registered at /api/charts")
except ImportError as exc:
    logger.warning("SQLite chart analytics routes not available: %s", exc)


# ---------------------------------------------------------------------------
# 10. Custom routes and static files
# ---------------------------------------------------------------------------
_TEMPLATE_RAW = (_HERE / "templates" / "index.html").read_text(encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
async def custom_index():
    # Inject the actual frontend URL (env-driven, default to local dev)
    frontend_url = (
        os.environ.get("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
    )
    html = _TEMPLATE_RAW.replace("{{FRONTEND_URL}}", frontend_url)
    return html


# Serve static assets (logo, favicon, etc.)
_TEMPLATES_DIR = _HERE / "templates"
app.mount("/static", StaticFiles(directory=str(_TEMPLATES_DIR)), name="static")


@app.get("/favicon.ico")
async def favicon():
    favicon_path = _HERE / "templates" / "favicon.svg"
    if favicon_path.exists():
        return FileResponse(str(favicon_path), media_type="image/svg+xml")
    return HTMLResponse("")


# ---------------------------------------------------------------------------
# 11. Lifespan (replaces deprecated on_event startup/shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app):
    """Initialize resources on startup and clean up on shutdown."""
    # Setup logging
    try:
        from config.logging_config import setup_logging

        setup_logging()
    except ImportError:
        pass

    # Install request_id filter on root logger so all log records carry request_id
    try:
        from middleware.request_context import RequestIdFilter
        _root_logger = logging.getLogger()
        if not any(isinstance(f, RequestIdFilter) for f in _root_logger.filters):
            _root_logger.addFilter(RequestIdFilter())
    except ImportError:
        pass

    # Initialize error tracking
    try:
        from config.error_tracking import init_error_tracking

        init_error_tracking()
    except ImportError:
        pass

    # Lifecycle startup diagnostics (version, env validation, backend info)
    try:
        from config.lifecycle import on_startup

        on_startup()
    except ImportError:
        pass

    # Initialize PostgreSQL connection pool
    if DB_BACKEND == "postgres":
        try:
            from api.dependencies import init_pg_pool

            _pool_min = _settings.pool.min if _settings else 2
            _pool_max = _settings.pool.max if _settings else 10
            _db_settings = _settings.db if _settings else None
            if _db_settings:
                pg_dsn = _db_settings.pg_connection_string
                init_pg_pool(pg_dsn, minconn=_pool_min, maxconn=_pool_max)
                logger.info("PostgreSQL connection pool initialized")
        except ImportError:
            logger.warning("database.pool not available -- using direct connections")
        except Exception as exc:
            logger.error("Failed to initialize connection pool: %s", exc)

    # Initialize SQLite connection pool (WAL mode, 5 connections)
    if DB_BACKEND != "postgres":
        try:
            from services.sqlite_pool import init_pool as _init_sqlite_pool

            _sqlite_db_path = (
                str(_settings.db.resolved_sqlite_path)
                if _settings
                else str(_HERE / "saudi_stocks.db")
            )
            _init_sqlite_pool(_sqlite_db_path, pool_size=5)
            logger.info("SQLite connection pool initialized for: %s", _sqlite_db_path)
        except Exception as exc:
            logger.warning("Failed to initialize SQLite connection pool: %s", exc)

    # Initialize Redis (if enabled)
    _cache_enabled = _settings.cache.enabled if _settings else False
    _redis_status = "disabled"
    if _cache_enabled:
        try:
            from cache import init_redis

            _redis_url = (
                _settings.cache.redis_url if _settings else "redis://localhost:6379/0"
            )
            init_redis(_redis_url)
            _redis_status = "connected"
            logger.info("Redis cache initialized")
        except ImportError:
            _redis_status = "unavailable"
            logger.warning("cache module not available -- running without cache")
        except Exception as exc:
            _redis_status = "error"
            logger.warning("Failed to initialize Redis: %s", exc)

    # -----------------------------------------------------------------------
    # Startup diagnostics
    # -----------------------------------------------------------------------
    logger.info("Database: %s", DB_BACKEND.upper())
    logger.info("Routes registered: %d", len(app.routes))
    logger.info("Redis: %s", _redis_status)

    # SA-06: Warn if debug mode is enabled (rate limiting disabled)
    _is_debug = globals().get("_debug_mode", False)
    if _is_debug:
        logger.warning("Debug mode is ON -- rate limiting is DISABLED")

    # Start news scheduler (SQLite-backed, works with any backend)
    _news_scheduler = None
    try:
        from services.news_store import NewsStore as _NewsStore
        from services.news_scheduler import NewsScheduler as _NewsScheduler

        _news_store = _NewsStore(str(_HERE / "saudi_stocks.db"))
        _news_scheduler = _NewsScheduler(_news_store)
        _news_scheduler.start()
        logger.info("News scheduler started")
    except ImportError as exc:
        logger.warning("News scheduler not available: %s", exc)
    except Exception as exc:
        logger.warning("Failed to start news scheduler: %s", exc)

    # Start quotes hub background task (Redis or in-memory fallback)
    _quotes_hub_task = None
    try:
        from services.widgets.quotes_hub import run_quotes_hub

        _redis_for_hub = None
        if _redis_status == "connected":
            from cache import get_redis as _get_redis_client

            _redis_for_hub = _get_redis_client()

        _quotes_hub_task = asyncio.create_task(run_quotes_hub(_redis_for_hub))
        _hub_mode = "Redis" if _redis_for_hub else "in-memory"
        logger.info("Quotes hub background task started (mode: %s)", _hub_mode)
    except ImportError as exc:
        logger.warning("Quotes hub not available: %s", exc)
    except Exception as exc:
        logger.warning("Failed to start quotes hub: %s", exc)

    # Non-blocking yfinance reachability check
    import threading as _th

    def _check_yfinance():
        try:
            import yfinance as yf

            ticker = yf.Ticker("^TASI")
            df = ticker.history(period="5d", auto_adjust=True, timeout=5)
            if df is not None and not df.empty:
                logger.info("yfinance: reachable (^TASI returned %d rows)", len(df))
            else:
                logger.warning("yfinance: reachable but returned empty data")
        except ImportError:
            logger.warning("yfinance: not installed")
        except Exception as exc:
            logger.warning("yfinance: unreachable (%s: %s)", type(exc).__name__, exc)

    _th.Thread(target=_check_yfinance, daemon=True).start()

    yield

    # Shutdown: cancel quotes hub background task
    if _quotes_hub_task is not None:
        _quotes_hub_task.cancel()
        try:
            await _quotes_hub_task
        except asyncio.CancelledError:
            pass
        logger.info("Quotes hub background task stopped")

    # Shutdown: stop news scheduler
    if _news_scheduler is not None:
        try:
            _news_scheduler.stop()
            logger.info("News scheduler stopped")
        except Exception as exc:
            logger.warning("Error stopping news scheduler: %s", exc)

    # Shutdown: close connection pool and Redis
    if DB_BACKEND == "postgres":
        try:
            from database.pool import close_pool

            close_pool()
            logger.info("PostgreSQL connection pool closed")
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("Error closing connection pool: %s", exc)

    try:
        from cache import close_redis

        close_redis()
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("Error closing Redis: %s", exc)

    # Lifecycle shutdown (flush logs, log uptime)
    try:
        from config.lifecycle import on_shutdown

        on_shutdown()
    except ImportError:
        pass


# Register the lifespan with the app
app.router.lifespan_context = lifespan


if __name__ == "__main__":
    import uvicorn

    _port = _settings.server.port if _settings else int(os.environ.get("PORT", "8084"))
    _host = _settings.server.host if _settings else "0.0.0.0"
    uvicorn.run(app, host=_host, port=_port)
