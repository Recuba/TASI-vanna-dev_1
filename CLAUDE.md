# CLAUDE.md

[![CI](https://github.com/Recuba/TASI-vanna-dev_1/actions/workflows/ci.yml/badge.svg)](https://github.com/Recuba/TASI-vanna-dev_1/actions/workflows/ci.yml)
[![Deploy](https://github.com/Recuba/TASI-vanna-dev_1/actions/workflows/deploy.yml/badge.svg)](https://github.com/Recuba/TASI-vanna-dev_1/actions/workflows/deploy.yml)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required Reading (Mandatory)

**At the start of every session**, before making any changes, you MUST read:

1. **`AGENTS.md`** - Read this FIRST, every time. Contains agent configuration rules, constraints, and behavioral guidelines that govern how you operate in this repo.

2. **`vanna-skill/SKILL.md`** and **`vanna-skill/references/`** - The authoritative source for Vanna 2.0 API patterns, correct method signatures, tool registration, and integration best practices. All Vanna-related code MUST conform to these references. When in doubt, read the relevant reference file before writing code.

3. **`vanna_docs/`** - Scraped official Vanna documentation (JSON pages and raw HTML). Consult these when implementing new features, debugging issues, or working with any Vanna API you haven't used before.

**Hard rules:**
- Never guess at Vanna API signatures or patterns -- look them up in the skill references and docs first.
- If a pattern in the codebase conflicts with the skill/docs, flag it rather than silently propagating the incorrect pattern.
- Always cross-reference `vanna-skill/references/` for the correct way to register tools, build system prompts, configure agents, set up servers, and integrate LLMs/databases.

## Project Overview

**Ra'd AI** is a TASI Saudi Stock Market AI Platform built on the **Vanna 2.0** framework. It supports dual database backends (SQLite for development, PostgreSQL for production). Natural language queries are converted to SQL against a normalized database of ~500 Saudi-listed companies, with Plotly chart generation. The platform includes news aggregation, announcement tracking, and technical report services.

## Directory Structure

```
.
├── app.py                          # Vanna 2.0 FastAPI server (dual SQLite/PostgreSQL backend)
├── csv_to_sqlite.py                # CSV-to-normalized-SQLite converter
├── config/
│   ├── __init__.py                 # Singleton get_settings() + re-exports
│   ├── settings.py                 # Pydantic Settings (DatabaseSettings, LLMSettings, ServerSettings)
│   └── logging.py                  # JSON (prod) / pretty (dev) logging configuration
├── database/
│   ├── schema.sql                  # Full PostgreSQL schema (DDL for all tables + indexes + views)
│   ├── queries.py                  # Centralized SQL query strings
│   ├── migrate_sqlite_to_pg.py     # SQLite -> PostgreSQL data migration
│   └── csv_to_postgres.py          # CSV -> PostgreSQL direct pipeline
├── services/
│   ├── __init__.py
│   ├── health_service.py           # Health checks (DB connectivity, LLM status)
│   ├── news_store.py               # SQLite news storage (sync + async wrappers)
│   ├── news_scraper.py             # 5-source Arabic news scraper
│   ├── news_scheduler.py           # Background news fetch scheduler
│   ├── news_paraphraser.py         # Arabic synonym substitution
│   ├── news_service.py             # News CRUD (PostgreSQL only)
│   ├── reports_service.py          # CRUD for technical_reports table
│   ├── announcement_service.py     # CRUD for announcements table
│   ├── auth_service.py             # JWT authentication service
│   ├── db_compat.py                # SQLite/PostgreSQL abstraction layer
│   ├── stock_ohlcv.py              # OHLCV data service
│   ├── tasi_index.py               # TASI index data service
│   ├── yfinance_base.py            # Shared yfinance cache + circuit breaker
│   ├── cache_utils.py              # Unified @cache_response decorator (LRU + TTL)
│   └── widgets/
│       ├── __init__.py
│       ├── quotes_hub.py           # QuotesHub: market quote orchestrator (Redis pub/sub)
│       └── providers/
│           ├── __init__.py
│           ├── crypto.py           # Cryptocurrency quotes
│           ├── metals.py           # Precious metals quotes
│           ├── oil.py              # Oil & energy quotes
│           └── indices.py          # Global market indices
├── api/
│   ├── models/
│   │   └── widgets.py              # QuoteItem Pydantic model
│   ├── routes/                     # FastAPI route handlers (async)
│   │   ├── news_feed.py            # /api/v1/news/feed (SQLite news API)
│   │   ├── news_stream.py          # /api/v1/news/stream (SSE endpoint)
│   │   ├── widgets_stream.py       # /api/v1/widgets/stream (SSE market quotes)
│   │   ├── charts_analytics.py     # Chart data endpoints
│   │   ├── market_analytics.py     # Market analytics endpoints
│   │   ├── stock_data.py           # Stock data endpoints
│   │   ├── sqlite_entities.py      # Entity search (SQLite)
│   │   └── ...                     # auth, health, reports, announcements
│   └── db_helper.py                # Async DB query wrappers (asyncio.to_thread)
├── frontend/                       # Next.js 14 app (production)
│   ├── src/
│   │   ├── app/                    # Next.js app router pages
│   │   │   ├── news/               # News feed (decomposed)
│   │   │   │   ├── page.tsx        # Main news page (~500 lines)
│   │   │   │   ├── utils.ts        # Shared constants & helpers
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useNewsFilters.ts
│   │   │   │   ├── components/
│   │   │   │   │   ├── ArticleCard.tsx
│   │   │   │   │   ├── FilterBar.tsx
│   │   │   │   │   ├── NewArticlesBanner.tsx
│   │   │   │   │   ├── SearchInput.tsx
│   │   │   │   │   ├── SkeletonCard.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   └── [id]/page.tsx   # Article detail page
│   │   │   ├── charts/             # TradingView + TASI charts
│   │   │   ├── market/             # Market overview
│   │   │   ├── chat/               # AI chat interface
│   │   │   └── ...                 # admin, login, reports, etc.
│   │   ├── components/             # Shared components
│   │   │   ├── layout/             # Header, Footer, Sidebar
│   │   │   ├── charts/             # Chart wrappers
│   │   │   ├── chat/               # AI chat components
│   │   │   ├── widgets/            # LiveMarketWidgets (SSE market ticker)
│   │   │   └── common/             # Command palette, ConnectionStatusBadge, etc.
│   │   ├── lib/
│   │   │   ├── api-client.ts       # API functions with AbortController
│   │   │   ├── config.ts           # Runtime config (env-driven)
│   │   │   ├── hooks/use-api.ts    # Data fetching hooks
│   │   │   └── utils.ts            # Utility functions
│   │   ├── providers/              # ThemeProvider, LanguageProvider
│   │   └── styles/design-system.ts # Gold/dark design tokens
│   └── package.json
├── templates/
│   └── index.html                  # Legacy frontend UI (vanna-chat web component)
├── ingestion/                      # Data ingestion pipelines (in progress)
├── docker-compose.yml              # PostgreSQL 16 + app + pgAdmin (optional)
├── Dockerfile                      # Python 3.11 FastAPI container
├── requirements.txt                # Python dependencies
├── .env.example                    # All environment variables documented
├── .dockerignore
├── test_database.py                # 20 database integrity tests (unittest)
├── test_app_assembly_v2.py         # 24 Vanna assembly tests
├── vanna-skill/                    # Vanna 2.0 API reference (read-only)
│   ├── SKILL.md
│   └── references/
├── vanna_docs/                     # Scraped Vanna docs (read-only)
├── saudi_stocks.db                 # SQLite database (generated, not committed)
├── saudi_stocks_yahoo_data.csv     # Source data (500 stocks, 1062 columns)
├── AGENTS.md                       # Agent behavioral rules
└── CLAUDE.md                       # This file
```

## Commands

```bash
# Start server (port 8084, SQLite backend)
python app.py

# Start with PostgreSQL via Docker
docker compose up -d

# Start with pgAdmin included
docker compose --profile tools up -d

# Run backend tests (573 tests)
python -m pytest tests/ -q

# Run frontend tests (139 tests)
cd frontend && npx vitest run

# Frontend production build (15 pages)
cd frontend && npx next build

# Rebuild SQLite database from CSV
python csv_to_sqlite.py

# Migrate SQLite data to PostgreSQL
python database/migrate_sqlite_to_pg.py

# Load CSV directly into PostgreSQL
python database/csv_to_postgres.py

# Lint frontend for RTL violations (physical direction classes)
cd frontend && npm run lint:rtl
```

**Environment setup:** Copy `.env.example` to `.env` and configure. At minimum set `GEMINI_API_KEY`. See `.env.example` for all available settings. For the frontend, copy `frontend/.env.local.example` to `frontend/.env.local`.

## Architecture

### Dual Database Backend

The app supports two database backends controlled by `DB_BACKEND` env var:
- **SQLite** (default): Uses `saudi_stocks.db` via `SqliteRunner`. Good for local development.
- **PostgreSQL**: Uses `PostgresRunner` with `POSTGRES_*` env vars. Used in Docker/production. Full schema in `database/schema.sql`.

### Configuration Module (`config/`)

Typed settings via `pydantic-settings`:
- `DatabaseSettings` (env prefix `DB_`): backend selection, SQLite path, PostgreSQL connection. Accepts both `DB_PG_*` and `POSTGRES_*` env var names for Docker compatibility.
- `LLMSettings` (env prefix `LLM_`): model, API key, max tool iterations (Anthropic only).
- `ServerSettings` (env prefix `SERVER_`): host, port, debug mode.
- `Settings`: top-level aggregator with `.env` file loading and backward-compatible `ANTHROPIC_API_KEY`.
- `get_settings()`: cached singleton accessor.

### Data Pipeline (`csv_to_sqlite.py`)
Transforms a 1062-column flat CSV into 10 normalized SQLite tables:
- **7 simple tables** (1 row per ticker): companies, market_data, valuation_metrics, profitability_metrics, dividend_data, financial_summary, analyst_data
- **3 financial statement tables** (multiple rows per ticker, unpivoted from wide to tall): balance_sheet, income_statement, cash_flow

Financial statements use `period_type` ('annual'/'quarterly'/'ttm') and `period_index` (0=most recent) for time-series querying. Column mappings are declarative dicts at the top of the file. The unpivot logic in `unpivot_financial()` converts prefixed columns (e.g., `bs_y0_Total_Assets`) into normalized rows.

### Server (`app.py`)
Assembles a Vanna 2.0 `Agent` with 5 components:
1. `AnthropicLlmService` - Claude Sonnet 4.5
2. `ToolRegistry` with `RunSqlTool` + `VisualizeDataTool` (access_groups: admin, user)
3. `DefaultUserResolver` - returns single default user (no auth)
4. `DemoAgentMemory` - in-memory conversation storage
5. `SaudiStocksSystemPromptBuilder` - schema documentation (includes PostgreSQL notes when using PG backend)

The `VannaFastAPIServer.create_app()` creates the FastAPI app. Vanna's default "/" route is **explicitly removed** before registering the custom template route, because FastAPI uses first-match routing.

### Services (`services/`)

**SQLite services** (work with both backends):
- `news_store.py` - SQLite news storage with sync methods + async wrappers (`aget_*` via `asyncio.to_thread`). The sync methods are deprecated in favor of their async counterparts for use in FastAPI handlers.
- `news_scraper.py` - Scrapes 5 Arabic news sources (config-driven via `ScraperSettings`)
- `news_scheduler.py` - Background daemon thread for periodic news fetching
- `news_paraphraser.py` - Arabic synonym substitution for content diversity
- `db_compat.py` - SQLite/PostgreSQL abstraction layer
- `health_service.py` - Structured health checks (database connectivity, LLM availability)

**PostgreSQL-only CRUD services** (using `psycopg2`):
- `news_service.py` - News article aggregation and retrieval (PostgreSQL)
- `announcement_service.py` - CMA/Tadawul announcement tracking

**Dual-backend CRUD services** (SQLite + PostgreSQL):
- `reports_service.py` - Technical/analyst report management. Auto-creates the `technical_reports` table in SQLite.

### Async I/O Layer

All route handlers are `async def`. Synchronous database calls (sqlite3, psycopg2) are wrapped in `asyncio.to_thread()` to prevent blocking the event loop:
- `api/db_helper.py` - `afetchall()` and `afetchone()` async wrappers
- `services/news_store.py` - `aget_latest_news()`, `acount_articles()`, etc.
- `database/manager.py` - `aconnection()` async context manager

### Frontend
- **Legacy** (`templates/index.html`): Custom Ra'd AI design with gold palette (#D4A84B), dark background (#0E0E0E), Tajawal font. Embeds `<vanna-chat>` web component loaded as ES module from CDN.
- **Production** (`frontend/`): Next.js 14 app with TypeScript, Tailwind CSS, gold/dark design system. 15 pages. Features include:
  - Full Arabic RTL support via Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`) with lint enforcement (`npm run lint:rtl`)
  - Real-time news feed via SSE (`/api/v1/news/stream`)
  - Live market widgets via SSE (`/api/v1/widgets/stream`) with reconnection backoff
  - Navigation progress bar (NextTopLoader, gold #D4A84B)
  - Connection status badge (live/reconnecting/offline)
  - AbortController on all fetch calls (race-condition-safe), including header health polling
  - Virtual scrolling for large lists
  - Mobile-responsive card view for market data tables
  - Route-level `loading.tsx` and `error.tsx` for news, market, charts, and chat
  - localStorage quota resilience in chat hook
  - Env-driven runtime config (`frontend/src/lib/config.ts`)

### Live Market Widgets (`services/widgets/`)

Real-time market quotes delivered via SSE:
- **`QuotesHub`** (`quotes_hub.py`): Orchestrates 4 provider fetchers and broadcasts updates. Supports optional Redis pub/sub for multi-instance deployments.
- **Providers** (`providers/`): Modular fetchers for crypto, precious metals, oil, and global indices.
- **`QuoteItem`** (`api/models/widgets.py`): Pydantic model for quote data (symbol, price, change, category).
- **SSE endpoint** (`api/routes/widgets_stream.py`): Streams quote updates to the frontend at `/api/v1/widgets/stream`.
- **Frontend** (`frontend/src/components/widgets/LiveMarketWidgets.tsx`): React component with EventSource, exponential backoff reconnection, and category filter tabs.
- **`ConnectionStatusBadge`** (`frontend/src/components/common/ConnectionStatusBadge.tsx`): Reusable live/reconnecting/offline indicator used by both the widgets ticker and the header.

The hub is started as a background task during FastAPI lifespan and its route is registered in `app.py`.

### Caching & Shared Utilities

- **`@cache_response`** (`services/cache_utils.py`): Unified caching decorator with TTL expiration and LRU eviction (max 500 entries by default).
- **`YFinanceCache`** (`services/yfinance_base.py`): Shared LRU cache for yfinance API calls with configurable TTL.
- **`CircuitBreaker`** (`services/yfinance_base.py`): Prevents cascading failures when yfinance endpoints are down.

### Middleware

- **GZipMiddleware**: Compresses responses larger than 1000 bytes (added in `app.py`).
- **X-Request-ID**: Added to all response headers for request tracing.

### Docker (`docker-compose.yml`)
- **postgres**: PostgreSQL 16 Alpine, auto-initialized with `database/schema.sql`, health-checked
- **app**: Python 3.11 FastAPI container, auto-connects to postgres
- **pgadmin**: Optional (via `--profile tools`), accessible on port 5050

## Key Vanna 2.0 Patterns

- **Tool registration**: Use `tools.register_local_tool(tool, access_groups=[...])` - the `.register()` method does NOT exist in Vanna 2.0.2
- **SystemPromptBuilder**: Abstract method signature is `build_system_prompt(self, user, tools)`, not `build()`
- **Agent constructor requires all of**: `llm_service`, `tool_registry`, `user_resolver`, `agent_memory`
- **Streaming**: `AgentConfig(stream_responses=True)` enables SSE streaming; `max_tool_iterations=10` caps tool calls per query
- **vanna-chat script tag**: Must use `type="module"` or the web component won't register

## Gotchas

- The system prompt in `app.py` documents the full database schema. If schema changes, update both the column mappings AND the system prompt.
- `csv_to_sqlite.py` skips financial statement rows where `period_date` is null -- some companies have fewer periods than others (~71% coverage, not 100%).
- Test files have hardcoded Windows paths for the database -- they will fail on other machines without path adjustment.
- The `<vanna-chat>` component requires internet (loaded from CDN).
- Database path in app.py is script-relative via `Path(__file__).resolve().parent / "saudi_stocks.db"`.
- PostgreSQL-only services (`news_service.py`, `announcement_service.py`) use `psycopg2` and are not available with SQLite backend. Use `news_store.py` for SQLite news operations. `reports_service.py` supports both backends.
- `config/settings.py` uses `validation_alias` for POSTGRES_* env vars so the same `.env` file works for both Docker Compose and the config module.
- In FastAPI route handlers, always use `aget_*` async methods from `news_store.py`, never the sync `get_*` methods (they block the event loop).
- Frontend uses Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`) for RTL. Do NOT use `ml-*`, `mr-*`, `pl-*`, `pr-*` for horizontal spacing. Run `npm run lint:rtl` to check.
- The Live Market Widgets system works without Redis (single-process mode). Redis (`REDIS_URL`, `CACHE_ENABLED=true`) is only needed for multi-instance deployments.
- All SSE endpoints must include `request.is_disconnected()` checks in their generator loops to avoid orphaned server-side generators.
- The `QuotesHub` background task is started during FastAPI lifespan. If you add new SSE producers, register them similarly in `app.py`'s lifespan handler.
- Tadawul trading days are Sunday-Thursday. Friday and Saturday are weekends (not the Western Saturday/Sunday).
- Health check routes are wrapped in `asyncio.to_thread()` to prevent blocking during database health probes.
- JWT secret is enforced at startup in production PostgreSQL mode -- missing `JWT_SECRET_KEY` raises `RuntimeError`.
- SQL query strings are centralized in `database/queries.py`. Prefer using these constants over inline SQL in route handlers.
- Pagination `limit` parameters have an upper bound of 100 (`le=100`) across all list endpoints.
