"""
Vanna 2.0 Saudi Stock Market Analyst
=====================================
Connects to a SQLite or PostgreSQL database of ~500 Saudi-listed companies
and exposes a FastAPI chat interface powered by Google Gemini 3 Flash
via the Gemini API (OpenAI-compatible endpoint).

Set DB_BACKEND=postgres (with POSTGRES_* env vars) to use PostgreSQL.
Default is SQLite.
"""

import logging
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
from vanna.integrations.openai import OpenAILlmService
from vanna.integrations.sqlite import SqliteRunner
from vanna.integrations.postgres import PostgresRunner
from vanna.servers.fastapi import VannaFastAPIServer
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from vanna.tools import RunSqlTool, VisualizeDataTool
from chart_engine import RaidChartGenerator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 0. Configuration (use config module, log failures instead of silencing)
# ---------------------------------------------------------------------------
try:
    from config import get_settings

    _settings = get_settings()
except Exception as _config_err:
    logger.warning("Failed to load config module, using env var fallbacks: %s", _config_err)
    _settings = None

_HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# 1. LLM -- Google Gemini 3 Flash via Gemini API (OpenAI-compatible)
# ---------------------------------------------------------------------------
import os

_GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyCqSJ4L49W35Nqval5jQqdeafbJ82bgJDs")
_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

llm = OpenAILlmService(
    model=_GEMINI_MODEL,
    api_key=_GEMINI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)

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
        # Fallback for when settings module is unavailable
        import os
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
# 4. User resolver (returns a single default user)
# ---------------------------------------------------------------------------
class DefaultUserResolver(UserResolver):
    async def resolve_user(self, request_context: RequestContext) -> User:
        return User(
            id="default_user",
            email="user@localhost",
            group_memberships=["user"],
        )


# ---------------------------------------------------------------------------
# 5. System prompt builder -- comprehensive schema documentation
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are a Saudi Stock Market financial analyst AI assistant. You help users \
query and analyze Saudi Arabian stock market data (TASI - Tadawul All Share Index).

DATABASE SCHEMA
===============
The database contains comprehensive financial data for ~500 Saudi-listed companies.

TABLE: companies
- ticker (TEXT, PK) - Saudi stock ticker (e.g., '1020.SR', '2222.SR')
- short_name (TEXT) - Company name
- sector (TEXT) - Industry sector (e.g., 'Financial Services', 'Energy', 'Technology')
- industry (TEXT) - Specific industry
- exchange (TEXT) - Exchange code
- quote_type (TEXT) - Always 'EQUITY'
- currency (TEXT) - Trading currency (SAR)
- financial_currency (TEXT) - Financial reporting currency
- market (TEXT) - Market identifier

TABLE: market_data
- ticker (TEXT, PK, FK->companies)
- current_price, previous_close, open_price, day_high, day_low (REAL) - Daily price data
- week_52_high, week_52_low (REAL) - 52-week range
- avg_50d, avg_200d (REAL) - Moving averages
- volume, avg_volume, avg_volume_10d (INTEGER) - Volume data
- beta (REAL) - Market beta
- market_cap (REAL) - Market capitalization in SAR
- shares_outstanding, float_shares, implied_shares_outstanding (REAL)
- pct_held_insiders, pct_held_institutions (REAL) - Ownership percentages

TABLE: valuation_metrics
- ticker (TEXT, PK, FK->companies)
- trailing_pe, forward_pe (REAL) - P/E ratios
- price_to_book, price_to_sales (REAL) - Price ratios
- enterprise_value, ev_to_revenue, ev_to_ebitda (REAL) - Enterprise value metrics
- peg_ratio (REAL) - PEG ratio
- trailing_eps, forward_eps (REAL) - Earnings per share
- book_value, revenue_per_share (REAL)

TABLE: profitability_metrics
- ticker (TEXT, PK, FK->companies)
- roa, roe (REAL) - Return ratios
- profit_margin, operating_margin, gross_margin, ebitda_margin (REAL) - Margin ratios
- earnings_growth, revenue_growth, earnings_quarterly_growth (REAL) - Growth rates

TABLE: dividend_data
- ticker (TEXT, PK, FK->companies)
- dividend_rate, dividend_yield (REAL) - Current dividend metrics
- ex_dividend_date (TEXT) - Ex-dividend date
- payout_ratio, avg_dividend_yield_5y (REAL)
- last_dividend_value (REAL), last_dividend_date (TEXT)
- trailing_annual_dividend_rate, trailing_annual_dividend_yield (REAL)

TABLE: financial_summary
- ticker (TEXT, PK, FK->companies)
- total_revenue, total_cash, total_cash_per_share (REAL)
- total_debt, debt_to_equity (REAL)
- current_ratio, quick_ratio (REAL) - Liquidity ratios
- operating_cashflow, free_cashflow (REAL)
- ebitda, gross_profits, net_income_to_common (REAL)

TABLE: analyst_data
- ticker (TEXT, PK, FK->companies)
- target_mean_price, target_high_price, target_low_price, target_median_price (REAL)
- analyst_count (INTEGER)
- recommendation (TEXT) - e.g., 'buy', 'hold', 'sell'
- recommendation_score (REAL) - 1=strong buy, 5=strong sell
- most_recent_quarter, last_fiscal_year_end (TEXT)

TABLE: balance_sheet (NORMALIZED - multiple rows per company, one per reporting period)
- id (INTEGER, PK, auto)
- ticker (TEXT, FK->companies)
- period_type (TEXT) - 'annual' or 'quarterly'
- period_index (INTEGER) - 0=most recent, 1=prior period, etc.
- period_date (TEXT) - e.g., '2024-12-31'
-- Assets
- total_assets, current_assets, cash_and_cash_equivalents (REAL)
- cash_cash_equivalents_and_short_term_investments (REAL)
- accounts_receivable, inventory, other_current_assets (REAL)
- total_non_current_assets, net_ppe (REAL)
- goodwill_and_other_intangible_assets, goodwill, other_intangible_assets (REAL)
- long_term_equity_investment, other_non_current_assets (REAL)
-- Liabilities
- total_liabilities_net_minority_interest (REAL)
- current_liabilities, current_debt, accounts_payable, other_current_liabilities (REAL)
- total_non_current_liabilities_net_minority_interest (REAL)
- long_term_debt, long_term_capital_lease_obligation, capital_lease_obligations (REAL)
- other_non_current_liabilities (REAL)
-- Equity
- total_equity_gross_minority_interest, stockholders_equity, common_stock_equity (REAL)
- retained_earnings, common_stock, additional_paid_in_capital (REAL)
- treasury_stock, minority_interest (REAL)
-- Derived
- total_capitalization, net_tangible_assets, working_capital (REAL)
- invested_capital, tangible_book_value (REAL)
- total_debt, net_debt (REAL)
- share_issued, ordinary_shares_number, treasury_shares_number (REAL)

TABLE: income_statement (NORMALIZED - multiple rows per company)
- id (INTEGER, PK, auto)
- ticker (TEXT, FK->companies)
- period_type (TEXT) - 'annual', 'quarterly', or 'ttm'
- period_index (INTEGER)
- period_date (TEXT)
-- Revenue & Profit
- total_revenue, operating_revenue, cost_of_revenue, gross_profit (REAL)
-- Expenses
- operating_expense (REAL)
- selling_general_and_administration, general_and_administrative_expense (REAL)
- research_and_development (REAL)
- operating_income (REAL)
-- Interest & Other
- net_non_operating_interest_income_expense (REAL)
- interest_income, interest_expense (REAL)
- other_non_operating_income_expenses (REAL)
-- Income & Tax
- pretax_income, tax_provision, tax_rate_for_calcs (REAL)
- net_income, net_income_common_stockholders (REAL)
- net_income_continuous_operations, net_income_including_noncontrolling_interests (REAL)
-- Per Share
- diluted_eps, basic_eps (REAL)
- diluted_average_shares, basic_average_shares (REAL)
-- EBITDA & Other
- ebitda, ebit, reconciled_depreciation (REAL)
- total_operating_income_as_reported, normalized_ebitda, normalized_income (REAL)
- net_interest_income, total_expenses (REAL)
- minority_interests (REAL)

TABLE: cash_flow (NORMALIZED - multiple rows per company)
- id (INTEGER, PK, auto)
- ticker (TEXT, FK->companies)
- period_type (TEXT) - 'annual', 'quarterly', or 'ttm'
- period_index (INTEGER)
- period_date (TEXT)
-- Operating Activities
- operating_cash_flow (REAL)
- change_in_working_capital, change_in_receivables (REAL)
- change_in_inventory, change_in_payable, change_in_prepaid_assets (REAL)
- stock_based_compensation (REAL)
- net_income_from_continuing_operations (REAL)
- depreciation_and_amortization (REAL)
- interest_paid_cfo, interest_received_cfo, taxes_refund_paid (REAL)
-- Investing Activities
- investing_cash_flow (REAL)
- capital_expenditure (REAL)
- purchase_of_business (REAL)
- purchase_of_investment, sale_of_investment, net_investment_purchase_and_sale (REAL)
- purchase_of_ppe, sale_of_ppe, net_ppe_purchase_and_sale (REAL)
- dividends_received_cfi (REAL)
-- Financing Activities
- financing_cash_flow (REAL)
- issuance_of_debt, long_term_debt_issuance, long_term_debt_payments (REAL)
- repayment_of_debt (REAL)
- issuance_of_capital_stock, common_stock_issuance (REAL)
- net_other_financing_charges (REAL)
-- Derived
- free_cash_flow (REAL)
- net_other_investing_changes (REAL)
- beginning_cash_position, end_cash_position, changes_in_cash (REAL)
- other_non_cash_items (REAL)

QUERY TIPS
==========
- Join companies with other tables using ticker.
- For financial statements, filter by period_type ('annual', 'quarterly', 'ttm') \
and use period_index=0 for the latest period.
- Market cap is in SAR (Saudi Riyal).
- Use sector/industry from the companies table for sector analysis.
- Common joins: companies JOIN market_data, companies JOIN balance_sheet, etc.

VISUALIZATION
=============
After running a SQL query, you can visualize the results using the visualize_data tool.
- The run_sql tool saves results to a CSV file (shown in the response as the filename).
- Pass that filename to visualize_data to create an interactive Plotly chart.
- Chart type is AUTO-SELECTED based on the number and types of columns in the result.
- Always visualize results when the user asks for charts, graphs, comparisons, or trends.

CHART TYPE RULES (the chart engine selects automatically based on column types):

1. **Bar chart** (1 text + 1 numeric = 2 columns):
   Query EXACTLY 1 text column and 1 numeric column.
   Example: SELECT short_name, market_cap FROM companies JOIN market_data USING(ticker) ORDER BY market_cap DESC LIMIT 10

2. **Value heatmap** (1 text + 3-6 numeric = 4-7 columns):
   Query 1 text column (entity labels) + 3 or more numeric columns (metrics).
   Each row = one entity. Each numeric column = one metric. Colors show relative magnitude.
   Example: SELECT c.short_name, p.roe, p.roa, p.profit_margin
   FROM companies c JOIN profitability_metrics p USING(ticker)
   JOIN market_data m USING(ticker)
   WHERE p.roe IS NOT NULL ORDER BY m.market_cap DESC LIMIT 15

3. **Scatter plot** (2 numeric columns, no text):
   Query EXACTLY 2 numeric columns.
   Example: SELECT market_cap, trailing_pe FROM market_data JOIN valuation_metrics USING(ticker) WHERE trailing_pe IS NOT NULL

4. **Histogram** (1 numeric column, no text):
   Query EXACTLY 1 numeric column to show its distribution.
   Example: SELECT dividend_yield FROM dividend_data WHERE dividend_yield IS NOT NULL AND dividend_yield > 0

5. **Line chart / time series** (1 date + 1-5 numeric):
   Query a date column (YYYY-MM-DD format) + numeric columns. Date strings are auto-detected.
   Example: SELECT period_date, total_revenue FROM income_statement WHERE ticker='2222.SR' AND period_type='annual' ORDER BY period_date

6. **Correlation heatmap** (3+ numeric columns, NO text column):
   Query only numeric columns to see correlations between metrics.
   Example: SELECT roe, roa, profit_margin, operating_margin FROM profitability_metrics WHERE roe IS NOT NULL

7. **Table** (8+ columns): Very wide queries render as formatted tables.

IMPORTANT GUIDELINES:
- For heatmaps: ALWAYS include a text column as the first column for entity labels (e.g., company name, sector).
- For bar charts: Use EXACTLY 2 columns. Do NOT add extra columns like sector - this changes the chart type.
- For scatter plots: Use EXACTLY 2 numeric columns with no text columns.
- If a user asks to "compare" multiple metrics for entities, use a value heatmap (1 text + 3+ numeric).
- If a user asks for a "chart" of a single metric across entities, use a bar chart (1 text + 1 numeric).
- NULL values are automatically handled - use WHERE ... IS NOT NULL for cleaner results.
- Prefer LIMIT to keep charts readable (10-20 entities is ideal).
"""


_PG_NOTES = """

POSTGRESQL NOTES
================
- This database uses PostgreSQL. Use ILIKE for case-insensitive text matching (not LIKE).
- Use single quotes for string literals: WHERE sector ILIKE '%energy%'
- Use || for string concatenation (not +).
- LIMIT syntax is standard: SELECT ... LIMIT 10
- Use CAST(x AS NUMERIC) or x::numeric for type casting.
- Use TRUE/FALSE for boolean literals.
"""


class SaudiStocksSystemPromptBuilder(SystemPromptBuilder):
    """Provides the LLM with full schema documentation for the Saudi stocks DB."""

    async def build_system_prompt(
        self, user: User, tools: List["ToolSchema"]
    ) -> Optional[str]:
        if DB_BACKEND == "postgres":
            return SYSTEM_PROMPT + _PG_NOTES
        return SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 6. Agent configuration
# ---------------------------------------------------------------------------
config = AgentConfig(
    stream_responses=True,
    max_tool_iterations=10,
)

# ---------------------------------------------------------------------------
# 7. Assemble the agent
# ---------------------------------------------------------------------------
agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=DefaultUserResolver(),
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
    _rate_limit = _mw_settings.rate_limit_per_minute if _mw_settings else 60
    _skip_paths = (
        _mw_settings.log_skip_paths_list
        if _mw_settings
        else ["/health", "/favicon.ico"]
    )
    _debug_mode = (
        _settings.server.debug
        if _settings
        else os.environ.get("SERVER_DEBUG", "false").lower() in ("true", "1")
    )

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

# ---------------------------------------------------------------------------
# 9. API routers (PostgreSQL-backed services)
# ---------------------------------------------------------------------------
if DB_BACKEND == "postgres":
    from api.routes.health import router as health_router
    from api.routes.news import router as news_router
    from api.routes.reports import router as reports_router
    from api.routes.announcements import router as announcements_router
    from api.routes.entities import router as entities_router
    from api.routes.watchlists import router as watchlists_router
    from api.routes.charts import router as charts_router

    app.include_router(health_router)
    app.include_router(news_router)
    app.include_router(reports_router)
    app.include_router(announcements_router)
    app.include_router(entities_router)
    app.include_router(watchlists_router)
    app.include_router(charts_router)

# Auth routes (PostgreSQL-only, since users table is PG-only)
if DB_BACKEND == "postgres":
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
    import os

    _cache_enabled = (
        _settings.cache.enabled
        if _settings
        else os.environ.get("CACHE_ENABLED", "false").lower() in ("true", "1")
    )
    _redis_status = "disabled"
    if _cache_enabled:
        try:
            from cache import init_redis

            _redis_url = (
                _settings.cache.redis_url
                if _settings
                else os.environ.get("REDIS_URL", "redis://localhost:6379/0")
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
    import os

    port = int(os.environ.get("PORT", "8084"))
    uvicorn.run(app, host="0.0.0.0", port=port)
