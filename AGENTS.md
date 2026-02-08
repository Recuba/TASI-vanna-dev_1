# AGENTS.md

This file provides guidance for AI coding agents working on this codebase.

## CRITICAL: First Steps for Every Session

Before making ANY changes to this codebase, you MUST:

1. **Read `AGENTS.md`** (this file) in full and follow all instructions.
2. **Read `CLAUDE.md`** if it exists in the project root or any relevant subdirectory. Its instructions are equally binding.
3. **Load the `/vanna` skill** (invoke it via the Skill tool) and read the Vanna 2.0 documentation and best practices it provides. All Vanna-related code must conform to the patterns, APIs, and conventions described in that skill.

These are non-negotiable prerequisites. Do not skip them, even for "small" changes.

## Project Overview

**Ra'd AI** is a TASI Saudi Stock Market AI Platform. It exposes a FastAPI chat interface powered by [Vanna 2.0](https://vanna.ai/) that lets users query a normalized database of ~500 TASI-listed Saudi companies using natural language. The LLM (Claude Sonnet 4.5 via Anthropic API) generates SQL, executes it, and optionally visualizes results with Plotly charts. The platform supports dual database backends (SQLite for development, PostgreSQL for production) and includes news, announcement, and technical report services.

## Tech Stack

- **Language:** Python 3.11+
- **Framework:** Vanna 2.0 (agent framework) + FastAPI (HTTP server)
- **LLM:** Claude Sonnet 4.5 via `AnthropicLlmService`
- **Database:** SQLite (dev) / PostgreSQL 16 (prod), controlled by `DB_BACKEND` env var
- **Configuration:** `pydantic-settings` (`config/settings.py`)
- **Frontend (legacy):** Single-page HTML (`templates/index.html`) using `<vanna-chat>` web component
- **Frontend (new):** Next.js 14 + TypeScript + Tailwind CSS (`frontend/`)
- **Server:** Uvicorn on port 8084
- **Container:** Docker Compose (PostgreSQL + app + optional pgAdmin)
- **Data Pipeline:** pandas + numpy for CSV normalization

## File Ownership

When working in a team, respect file ownership boundaries:

| Owner | Files |
|---|---|
| **database-architect** | `database/`, `csv_to_sqlite.py`, `ingestion/` |
| **backend-services** | `app.py`, `services/` (except `health_service.py`) |
| **frontend-dev** | `frontend/`, `templates/` |
| **infra-testing** | `config/`, `tests/`, `.github/`, `docker-compose.yml`, `Dockerfile`, `requirements.txt`, `services/health_service.py`, `CLAUDE.md`, `AGENTS.md`, `README.md` |

Do NOT modify files owned by other agents unless coordinating with them.

## File Structure

```
.
├── app.py                          # Vanna 2.0 FastAPI server (dual backend)
├── csv_to_sqlite.py                # CSV -> normalized SQLite
├── config/
│   ├── __init__.py                 # get_settings() singleton
│   ├── settings.py                 # Pydantic Settings classes
│   └── logging.py                  # JSON/pretty log formatters
├── database/
│   ├── schema.sql                  # PostgreSQL DDL (all tables + indexes + views)
│   ├── migrate_sqlite_to_pg.py     # SQLite -> PostgreSQL migration
│   └── csv_to_postgres.py          # CSV -> PostgreSQL pipeline
├── services/
│   ├── health_service.py           # Health checks (DB, LLM)
│   ├── news_service.py             # News article CRUD
│   ├── reports_service.py          # Technical reports CRUD
│   └── announcement_service.py     # Announcement CRUD
├── frontend/                       # Next.js 14 app (in progress)
├── templates/index.html            # Legacy vanna-chat UI
├── docker-compose.yml              # PostgreSQL + app + pgAdmin
├── Dockerfile                      # Python 3.11 container
├── requirements.txt                # Python deps
├── .env.example                    # All env vars documented
├── test_database.py                # 20 DB integrity tests
├── test_app_assembly_v2.py         # 24 Vanna assembly tests
├── vanna-skill/                    # Vanna 2.0 reference (read-only)
├── vanna_docs/                     # Scraped Vanna docs (read-only)
├── saudi_stocks.db                 # SQLite DB (generated)
└── saudi_stocks_yahoo_data.csv     # Source data
```

## Database Schema

### Core Tables (SQLite + PostgreSQL)

10 normalized tables derived from a 1062-column flat CSV:

| Table | Rows | Key |
|---|---|---|
| `companies` | 500 | `ticker` (PK) |
| `market_data` | 500 | `ticker` (PK, FK) |
| `valuation_metrics` | 500 | `ticker` (PK, FK) |
| `profitability_metrics` | 500 | `ticker` (PK, FK) |
| `dividend_data` | 500 | `ticker` (PK, FK) |
| `financial_summary` | 500 | `ticker` (PK, FK) |
| `analyst_data` | 500 | `ticker` (PK, FK) |
| `balance_sheet` | ~2,527 | `id` (PK), `ticker` (FK) |
| `income_statement` | ~2,632 | `id` (PK), `ticker` (FK) |
| `cash_flow` | ~2,604 | `id` (PK), `ticker` (FK) |

### PostgreSQL-Only Tables (see `database/schema.sql`)

- `sectors`, `entities` - Reference/enrichment tables
- `filings`, `xbrl_facts`, `computed_metrics` - XBRL financial data
- `price_history` - Daily price/volume history
- `announcements`, `news_articles`, `technical_reports` - Content tables
- `users`, `user_watchlists`, `user_alerts` - User management
- `query_audit_log` - Query tracking

## Setup & Run

### Local Development (SQLite)

```bash
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY

python csv_to_sqlite.py   # Build SQLite DB from CSV
python app.py             # Server at http://localhost:8084
```

### Docker (PostgreSQL)

```bash
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY and POSTGRES_PASSWORD

docker compose up -d                          # PostgreSQL + app
docker compose --profile tools up -d          # Also start pgAdmin on :5050
```

### Data Migration

```bash
python database/migrate_sqlite_to_pg.py       # SQLite -> PostgreSQL
python database/csv_to_postgres.py            # CSV -> PostgreSQL directly
```

## Testing

```bash
python -m unittest test_database.py -v        # 20 DB integrity tests
python test_app_assembly_v2.py                # 24 Vanna assembly tests
```

All tests must pass before merging changes.

## Configuration

All settings are managed via environment variables and `.env` file. See `.env.example` for the full list.

| Prefix | Class | Purpose |
|---|---|---|
| `DB_` | `DatabaseSettings` | Backend selection, SQLite path, PG connection |
| `POSTGRES_*` | (alias) | Docker-compatible PG connection vars |
| `LLM_` | `LLMSettings` | Model, API key, max tool iterations (Anthropic only) |
| `SERVER_` | `ServerSettings` | Host, port, debug mode |
| `LOG_LEVEL` | logging | DEBUG, INFO, WARNING, ERROR |
| (none) | `ANTHROPIC_API_KEY` | Backward-compatible API key |

Usage: `from config import get_settings; s = get_settings()`

## Vanna 2.0 Patterns

ALWAYS invoke the `/vanna` skill before writing or modifying any Vanna-related code. The skill contains the authoritative Vanna 2.0 API documentation, best practices, integration patterns, and known pitfalls. Treat its guidance as the source of truth for all Vanna work in this project. If anything in this section conflicts with the skill's documentation, the skill takes precedence.

These are critical patterns specific to Vanna 2.0. Getting them wrong causes runtime errors:

- **Tool registration:** Use `tools.register_local_tool(tool, access_groups=[...])`. Do NOT use `tools.register()` (does not exist).
- **SystemPromptBuilder:** Abstract method signature is `build_system_prompt(self, user, tools)`, not `build()`.
- **Agent constructor requires:** `llm_service`, `tool_registry`, `user_resolver`, `agent_memory` (all required).
- **Agent memory:** Use `DemoAgentMemory(max_items=N)` for in-memory storage.
- **FastAPI compatibility:** Requires FastAPI 0.115.6+ (older versions cause Starlette middleware errors).

## Important Rules

- NEVER commit `.env` or API keys.
- NEVER modify the database schema without updating the system prompt in `app.py` (the `SYSTEM_PROMPT` string documents every column).
- ALWAYS use script-relative paths via `Path(__file__).resolve().parent` for file references (not `./relative`).
- ALWAYS use `try/finally` for database connections to ensure cleanup.
- ALWAYS replace NaN with `None` before writing to SQLite (use `df.where(pd.notnull(df), None)`).
- The system prompt in `app.py` must document ALL database columns. If you add or remove columns, update `SYSTEM_PROMPT` to match.
- When modifying `csv_to_sqlite.py` column mappings, verify against the actual CSV headers.
- ALWAYS read `AGENTS.md` and `CLAUDE.md` at the start of every session before making changes.
- ALWAYS invoke the `/vanna` skill and follow its best practices before writing or modifying any Vanna 2.0 code.
- Services in `services/` use `psycopg2` and require PostgreSQL. They do not work with SQLite.
- Configuration changes should go through `config/settings.py`, not raw `os.environ.get()` calls.
