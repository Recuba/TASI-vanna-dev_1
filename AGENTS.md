# AGENTS.md

This file provides guidance for AI coding agents working on this codebase.

## CRITICAL: First Steps for Every Session

Before making ANY changes to this codebase, you MUST:

1. **Read `AGENTS.md`** (this file) in full and follow all instructions.
2. **Read `CLAUDE.md`** if it exists in the project root or any relevant subdirectory. Its instructions are equally binding.
3. **Load the `/vanna` skill** (invoke it via the Skill tool) and read the Vanna 2.0 documentation and best practices it provides. All Vanna-related code must conform to the patterns, APIs, and conventions described in that skill.

These are non-negotiable prerequisites. Do not skip them, even for "small" changes.

## Project Overview

**Ra'd AI** is a Saudi Stock Market AI Analyst. It exposes a FastAPI chat interface powered by [Vanna 2.0](https://vanna.ai/) that lets users query a normalized SQLite database of ~500 TASI-listed Saudi companies using natural language. The LLM (Claude Sonnet 4.5 via Anthropic API) generates SQL, executes it, and optionally visualizes results with Plotly charts.

## Tech Stack

- **Language:** Python 3.10+
- **Framework:** Vanna 2.0 (agent framework) + FastAPI (HTTP server)
- **LLM:** Claude Sonnet 4.5 via `AnthropicLlmService`
- **Database:** SQLite (`saudi_stocks.db`)
- **Frontend:** Single-page HTML (`templates/index.html`) using the `<vanna-chat>` web component
- **Server:** Uvicorn on port 8084
- **Data Pipeline:** pandas + numpy for CSV-to-SQLite normalization

## File Structure

```
.
├── app.py                    # Vanna 2.0 FastAPI server (main entry point)
├── csv_to_sqlite.py          # CSV-to-normalized-SQLite converter
├── saudi_stocks.db           # SQLite database (generated, not committed)
├── saudi_stocks_yahoo_data.csv  # Source data (500 stocks, 1062 columns)
├── templates/
│   └── index.html            # Frontend UI (Ra'd AI branded)
├── test_database.py          # Database integrity tests (unittest, 20 tests)
├── test_app_assembly_v2.py   # Vanna assembly/import tests (24 tests)
├── .env                      # API keys (NEVER commit)
└── AGENTS.md                 # This file
```

## Database Schema

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

- Simple tables have one row per ticker (500 rows each).
- Financial statement tables are **unpivoted** with multiple rows per ticker (one per reporting period).
- Financial statement rows use `period_type` (`annual`, `quarterly`, `ttm`) and `period_index` (0 = most recent).
- All tables join on `ticker` (e.g., `'1020.SR'`, `'2222.SR'`).

## Setup & Run

```bash
# Install dependencies
pip install vanna fastapi uvicorn python-dotenv

# Regenerate the database from CSV (destructive - replaces saudi_stocks.db)
python csv_to_sqlite.py

# Start the server
python app.py
# Server runs at http://localhost:8084
```

Requires `ANTHROPIC_API_KEY` in `.env` or environment.

## Testing

```bash
# Database integrity tests (20 tests)
python -m unittest test_database.py -v

# Vanna assembly tests (24 tests)
python test_app_assembly_v2.py
```

All tests must pass before merging changes.

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
- ALWAYS use `try/finally` for SQLite connections to ensure cleanup.
- ALWAYS replace NaN with `None` before writing to SQLite (use `df.where(pd.notnull(df), None)`).
- The system prompt in `app.py` must document ALL database columns. If you add or remove columns, update `SYSTEM_PROMPT` to match.
- When modifying `csv_to_sqlite.py` column mappings, verify against the actual CSV headers.
- ALWAYS read `AGENTS.md` and `CLAUDE.md` at the start of every session before making changes.
- ALWAYS invoke the `/vanna` skill and follow its best practices before writing or modifying any Vanna 2.0 code.
