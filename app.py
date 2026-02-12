"""
Vanna 2.0 Saudi Stock Market Analyst
=====================================
Connects to a SQLite or PostgreSQL database of ~500 Saudi-listed companies
and exposes a FastAPI chat interface powered by Claude Sonnet 4.5
via the Anthropic API.

Set DB_BACKEND=postgres (with POSTGRES_* env vars) to use PostgreSQL.
Default is SQLite.
"""

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
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from vanna.tools import RunSqlTool, VisualizeDataTool
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
        except Exception:
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
    agent_memory=DemoAgentMemory(max_items=10000),
    system_prompt_builder=SaudiStocksSystemPromptBuilder(),
    config=config,
)

# ---------------------------------------------------------------------------
# 8. FastAPI server
# ---------------------------------------------------------------------------
server = VannaFastAPIServer(agent)
app = server.create_app()

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
    from middleware.error_handler import ErrorHandlerMiddleware
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

    # Rate limiter (skip in debug mode)
    if not _debug_mode:
        app.add_middleware(
            RateLimitMiddleware,
            requests_per_minute=_rate_limit,
            skip_paths=["/health"],
        )

    # Request logging
    app.add_middleware(
        RequestLoggingMiddleware,
        skip_paths=_skip_paths,
    )

    # Error handler (outermost -- catches everything)
    app.add_middleware(ErrorHandlerMiddleware)

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
                except Exception:
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

# PG-backed service routes: register in postgres mode for news, reports,
# announcements, watchlists. Entities and charts have SQLite fallbacks
# registered below (section 9g/9h), so PG versions are optional.
if DB_BACKEND == "postgres":
    try:
        from api.routes.news import router as news_router
        from api.routes.reports import router as reports_router
        from api.routes.announcements import router as announcements_router
        from api.routes.watchlists import router as watchlists_router
        from api.routes.entities import router as pg_entities_router

        app.include_router(news_router)
        app.include_router(reports_router)
        app.include_router(announcements_router)
        app.include_router(watchlists_router)
        app.include_router(pg_entities_router)
        logger.info(
            "PG-backed service routes registered (news, reports, announcements, watchlists, entities)"
        )
    except ImportError as exc:
        logger.warning("PG service routes not available: %s", exc)
else:
    # SQLite mode: register stub routers that return 503 for PG-only endpoints
    # (news, reports, announcements, watchlists). Entities and charts have
    # real SQLite handlers registered in sections 9g/9h below.
    from fastapi import APIRouter as _APIRouter

    _pg_stub_configs = [
        ("/api/news", "news"),
        ("/api/reports", "reports"),
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

        _stub.add_api_route("", _make_stub_handler(_prefix), methods=["GET"])
        _stub.add_api_route(
            "/{path:path}", _make_stub_handler(_prefix), methods=["GET"]
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
@app.get("/", response_class=HTMLResponse)
async def custom_index():
    template_path = _HERE / "templates" / "index.html"
    return template_path.read_text(encoding="utf-8")


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
        from config.logging import setup_logging

        setup_logging()
    except ImportError:
        pass

    # Initialize PostgreSQL connection pool
    if DB_BACKEND == "postgres":
        try:
            from database.pool import init_pool

            _pool_min = _settings.pool.min if _settings else 2
            _pool_max = _settings.pool.max if _settings else 10
            _db_settings = _settings.db if _settings else None
            if _db_settings:
                init_pool(
                    _db_settings, min_connections=_pool_min, max_connections=_pool_max
                )
                logger.info("PostgreSQL connection pool initialized")
        except ImportError:
            logger.warning("database.pool not available -- using direct connections")
        except Exception as exc:
            logger.error("Failed to initialize connection pool: %s", exc)

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

    # SA-04: Warn if JWT secret is not explicitly configured in production
    if DB_BACKEND == "postgres" and _settings:
        _jwt_secret_env = os.environ.get("AUTH_JWT_SECRET", "")
        if not _jwt_secret_env:
            logger.warning(
                "AUTH_JWT_SECRET not configured -- JWT tokens will not persist across restarts"
            )

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


# Register the lifespan with the app
app.router.lifespan_context = lifespan


if __name__ == "__main__":
    import uvicorn

    _port = _settings.server.port if _settings else int(os.environ.get("PORT", "8084"))
    _host = _settings.server.host if _settings else "0.0.0.0"
    uvicorn.run(app, host=_host, port=_port)
