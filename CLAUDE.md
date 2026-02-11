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
│   ├── migrate_sqlite_to_pg.py     # SQLite -> PostgreSQL data migration
│   └── csv_to_postgres.py          # CSV -> PostgreSQL direct pipeline
├── services/
│   ├── __init__.py
│   ├── health_service.py           # Health checks (DB connectivity, LLM status)
│   ├── news_service.py             # CRUD for news_articles table
│   ├── reports_service.py          # CRUD for technical_reports table
│   └── announcement_service.py     # CRUD for announcements table
├── frontend/                       # Next.js 14 app (Ra'd AI portal, in progress)
│   ├── src/
│   │   ├── app/                    # Next.js app router pages
│   │   ├── components/layout/      # Header, Footer, Sidebar
│   │   ├── providers/              # ThemeProvider
│   │   ├── styles/design-system.ts # Gold/dark design tokens
│   │   └── lib/utils.ts            # Utility functions
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

# Run all tests
python -m unittest discover -s . -p "test_*.py"

# Run specific test suites
python test_database.py              # 20 database integrity tests
python test_app_assembly_v2.py       # 24 Vanna assembly tests

# Rebuild SQLite database from CSV
python csv_to_sqlite.py

# Migrate SQLite data to PostgreSQL
python database/migrate_sqlite_to_pg.py

# Load CSV directly into PostgreSQL
python database/csv_to_postgres.py
```

**Environment setup:** Copy `.env.example` to `.env` and configure. At minimum set `ANTHROPIC_API_KEY`. See `.env.example` for all available settings.

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
PostgreSQL-backed CRUD services using `psycopg2`:
- `news_service.py` - News article aggregation and retrieval
- `reports_service.py` - Technical/analyst report management
- `announcement_service.py` - CMA/Tadawul announcement tracking
- `health_service.py` - Structured health checks (database connectivity, LLM availability)

### Frontend
- **Legacy** (`templates/index.html`): Custom Ra'd AI design with gold palette (#D4A84B), dark background (#0E0E0E), Tajawal font. Embeds `<vanna-chat>` web component loaded as ES module from CDN.
- **New** (`frontend/`): Next.js 14 app with TypeScript, Tailwind CSS, gold/dark design system. In progress.

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
- Test files resolve the database path via `Path(__file__).resolve().parent / "saudi_stocks.db"` -- ensure the SQLite database exists in the project root before running tests.
- The `<vanna-chat>` component requires internet (loaded from CDN).
- Database path in app.py is script-relative via `Path(__file__).resolve().parent / "saudi_stocks.db"`.
- Services in `services/` require PostgreSQL (`psycopg2`) -- they are not available when running with SQLite backend.
- `config/settings.py` uses `validation_alias` for POSTGRES_* env vars so the same `.env` file works for both Docker Compose and the config module.
