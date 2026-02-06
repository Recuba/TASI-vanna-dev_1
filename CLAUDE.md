# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required Reading (Mandatory)

**At the start of every session**, before making any changes, you MUST read:

1. **`AGENTS.md`** - Read this FIRST, every time. Contains agent configuration rules, constraints, and behavioral guidelines that govern how you operate in this repo.

2. **`vanna-skill/SKILL.md`** and **`vanna-skill/references/`** - The authoritative source for Vanna 2.0 API patterns, correct method signatures, tool registration, and integration best practices. All Vanna-related code MUST conform to these references. When in doubt, read the relevant reference file before writing code.

3. **`vanna_docs/`** - Scraped official Vanna documentation (JSON pages and raw HTML). Consult these when implementing new features, debugging issues, or working with any Vanna API you haven't used before.

**Hard rules:**
- Never guess at Vanna API signatures or patterns — look them up in the skill references and docs first.
- If a pattern in the codebase conflicts with the skill/docs, flag it rather than silently propagating the incorrect pattern.
- Always cross-reference `vanna-skill/references/` for the correct way to register tools, build system prompts, configure agents, set up servers, and integrate LLMs/databases.

## Project Overview

TASI Saudi Stock Market AI Analyst built on **Vanna 2.0** framework. Natural language queries are converted to SQL against a normalized SQLite database of ~500 Saudi-listed companies, with Plotly chart generation. Frontend uses the `<vanna-chat>` web component with a custom Ra'd AI gold-themed dark UI.

## Commands

```bash
# Start server (port 8084)
python app.py

# Run all tests
python -m unittest discover -s . -p "test_*.py"

# Run specific test suites
python test_database.py              # 20 database integrity tests
python test_app_assembly_v2.py       # 24 Vanna assembly tests

# Rebuild SQLite database from CSV
python csv_to_sqlite.py
```

**Environment setup:** Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.

## Architecture

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
5. `SaudiStocksSystemPromptBuilder` - 240-line inline schema documentation

The `VannaFastAPIServer.create_app()` creates the FastAPI app. Vanna's default "/" route is **explicitly removed** (line ~280) before registering the custom template route, because FastAPI uses first-match routing.

### Frontend (`templates/index.html`)
Custom Ra'd AI design with gold palette (#D4A84B), dark background (#0E0E0E), Tajawal font. Embeds `<vanna-chat>` web component loaded as ES module (`type="module"`) from CDN. Suggestion chips use `data-query` attributes and shadow DOM manipulation to inject queries into the component.

## Key Vanna 2.0 Patterns

- **Tool registration**: Use `tools.register_local_tool(tool, access_groups=[...])` - the `.register()` method does NOT exist in Vanna 2.0.2
- **SystemPromptBuilder**: Abstract method signature is `build_system_prompt(self, user, tools)`, not `build()`
- **Agent constructor requires all of**: `llm_service`, `tool_registry`, `user_resolver`, `agent_memory`
- **Streaming**: `AgentConfig(stream_responses=True)` enables SSE streaming; `max_tool_iterations=10` caps tool calls per query
- **vanna-chat script tag**: Must use `type="module"` or the web component won't register

## Gotchas

- The system prompt (lines 62-242 in app.py) documents the full database schema. If schema changes, update both `csv_to_sqlite.py` column mappings AND the system prompt.
- `csv_to_sqlite.py` skips financial statement rows where `period_date` is null — some companies have fewer periods than others (~71% coverage, not 100%).
- Test files have hardcoded Windows paths for the database — they will fail on other machines without path adjustment.
- The `<vanna-chat>` component requires internet (loaded from `https://img.vanna.ai/vanna-components.js`).
- Database path in app.py is script-relative via `Path(__file__).resolve().parent / "saudi_stocks.db"`.
