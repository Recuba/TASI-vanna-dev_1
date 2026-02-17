# Architecture & Design Pattern Audit

**Date:** 2026-02-17
**Auditor:** arch-auditor
**Scope:** Full backend + frontend architecture, Vanna 2.0 integration, layering, design patterns

---

## Executive Summary

The Ra'd AI platform demonstrates a well-structured architecture with clear separation between Vanna 2.0 AI agent assembly, FastAPI route handlers, service layer, and database access. The dual-backend (SQLite/PostgreSQL) abstraction is functional but implemented through two parallel compatibility layers. API versioning is inconsistent, with newer endpoints using `/api/v1/` while legacy endpoints omit the version prefix. The Vanna 2.0 integration follows documented patterns correctly. Overall architectural quality: **B+** (solid with specific areas for improvement).

---

## 1. Layering Audit: Routes -> Services -> Database

### Architecture Diagram

```
Routes (api/routes/*.py)
  |
  +-- db_helper.py (async wrappers, afetchall/afetchone)
  |     |
  |     +-- sqlite3 / psycopg2 (direct connections)
  |
  +-- Services (services/*.py)
  |     |
  |     +-- db_compat.py (alternate compatibility layer)
  |     +-- Direct sqlite3 / psycopg2 connections
  |
  +-- database/queries.py (centralized SQL constants)
```

### Findings

**GOOD: Most routes follow the layering pattern correctly.**
- `market_analytics.py`, `charts_analytics.py`, `stock_data.py`, `sqlite_entities.py` all use `api/db_helper.py` with `afetchall`/`afetchone` async wrappers, and reference centralized SQL from `database/queries.py`. This is clean and consistent.
- `news_feed.py` delegates to `NewsStore` service (correct service-layer usage).
- `health.py` delegates to `services/health_service.py` (correct).
- `tasi_index.py` delegates to `services/tasi_index.py` (correct).
- `widgets_stream.py` delegates to `services/widgets/quotes_hub.py` (correct).

**ISSUE [MINOR]: Some routes bypass the service layer and access the database directly.**
- `stock_data.py:282-285` -- The `/financials` endpoint uses `SELECT * FROM {statement}` with inline SQL (not from `queries.py`). The table name is validated against a whitelist so injection is prevented, and `SELECT *` is justified by the dynamic column set, but this is an exception to the centralization pattern.
- `stock_data.py:389-403` -- The `/quotes` endpoint constructs SQL inline rather than using `queries.py`.
- `sqlite_entities.py:151-175` -- The `list_entities` endpoint builds SQL inline with dynamic WHERE clauses.

**ISSUE [MINOR]: Two parallel database compatibility layers exist.**
- `api/db_helper.py` -- Used by route handlers. Detects backend via `os.environ.get("DB_BACKEND")` at module load time.
- `services/db_compat.py` -- Used by services (health_service). Detects backend via `get_settings().db.backend`.
- Both provide `fetchall`, `fetchone`, connection factories, and dual-backend support, but with slightly different APIs. This creates redundancy and potential for configuration drift (one reads env vars directly, the other uses typed settings).

**Recommendation:** Consolidate into a single database abstraction layer. The `db_compat.py` approach (using typed settings) is preferable. Have `db_helper.py` delegate to it.

### Severity: LOW

---

## 2. Service Abstraction Pattern

### Findings

**Services do NOT follow a uniform interface/implementation pattern.** Each service is implemented differently:

| Service | Pattern | DI? |
|---------|---------|-----|
| `health_service.py` | Module-level functions | No |
| `news_store.py` | Class with `__init__(db_path)` | Manual |
| `reports_service.py` | Class with `__init__(get_conn)` | Callable injection |
| `news_service.py` | Module-level functions (PG-only) | No |
| `announcement_service.py` | Module-level functions (PG-only) | No |
| `tasi_index.py` | Module-level functions + module state | No |
| `stock_ohlcv.py` | Module-level functions | No |
| `cache_utils.py` | Decorator-based | N/A |
| `yfinance_base.py` | Class instances (YFinanceCache, CircuitBreaker) | No |

**GOOD:** `reports_service.py` uses proper dependency injection via constructor -- `TechnicalReportsService(get_conn)` accepts a connection factory callable. This is the best pattern in the codebase.

**ISSUE [MEDIUM]: No service interfaces/protocols.**
- There are no abstract base classes or Python `Protocol` types defining service contracts.
- This makes it harder to swap implementations (e.g., for testing) and means there is no formal guarantee that PG and SQLite services provide the same API surface.

**ISSUE [MINOR]: Module-level singletons leak state.**
- `news_feed.py:29` instantiates `_store = NewsStore(_DB_PATH)` at module import time. This means the DB path is fixed at import, not configurable at runtime.
- `tasi_index.py` uses module-level caches and circuit breakers.

**Recommendation:** Consider adopting FastAPI's dependency injection (`Depends()`) for service resolution. Define `Protocol` classes for services that have dual-backend implementations.

### Severity: MEDIUM

---

## 3. Vanna 2.0 Integration Audit

### Agent Assembly (`app.py:180-187`)

```python
agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=JWTUserResolver(),
    agent_memory=DemoAgentMemory(max_items=10000),
    system_prompt_builder=SaudiStocksSystemPromptBuilder(),
    config=config,
)
```

**PASS: All 5 required components are provided:**
1. `llm_service` -- `AnthropicLlmService` (correct)
2. `tool_registry` -- `ToolRegistry` instance (correct)
3. `user_resolver` -- `JWTUserResolver` (correct, extends `UserResolver`)
4. `agent_memory` -- `DemoAgentMemory(max_items=10000)` (correct)
5. `system_prompt_builder` -- `SaudiStocksSystemPromptBuilder` (correct)

Plus optional `config` -- `AgentConfig(stream_responses=True, max_tool_iterations=...)` (correct).

### Tool Registration (`app.py:103-110`)

```python
tools.register_local_tool(
    RunSqlTool(sql_runner=sql_runner), access_groups=["admin", "user"]
)
tools.register_local_tool(
    VisualizeDataTool(plotly_generator=RaidChartGenerator()),
    access_groups=["admin", "user"],
)
```

**PASS:** Uses `register_local_tool()` (NOT `.register()`). Access groups correctly defined.

### SystemPromptBuilder (`app.py:156-164`)

```python
class SaudiStocksSystemPromptBuilder(SystemPromptBuilder):
    async def build_system_prompt(
        self, user: User, tools: List["ToolSchema"]
    ) -> Optional[str]:
```

**PASS:** Correct abstract method signature `build_system_prompt(self, user, tools)`.

### Default Route Removal (`app.py:223-232`)

```python
app.routes[:] = [
    r for r in app.routes
    if not (hasattr(r, "path") and r.path == "/" and ...)
]
```

**PASS:** Vanna's default "/" route is correctly removed before the custom template route is registered.

### CORS Removal (`app.py:236-240`)

```python
app.user_middleware[:] = [
    m for m in app.user_middleware if m.cls is not _CORSMiddleware
]
```

**PASS:** Vanna's default `CORSMiddleware(allow_origins=["*"])` is properly removed before the application's stricter CORS is configured.

### Severity: NONE (all correct)

---

## 4. Dual-Backend Abstraction Audit

### `services/db_compat.py`

**Coverage:** Provides `is_postgres()`, `get_read_connection()`, `fetchall_compat()`, `fetchone_compat()`, `scalar_compat()`, `table_exists()`, `datetime_recent()`.

**GOOD:** Comprehensive for the health service use case. Handles connection pool awareness, fallback to direct connections, and SQL dialect differences.

**ISSUE [MEDIUM]: `db_helper.py` duplicates this functionality.**
- `db_helper.py` has its own `is_postgres()`, `fetchall()`, `fetchone()`, `get_conn()`, plus async wrappers.
- Key difference: `db_helper.py` reads `DB_BACKEND` from `os.environ` directly at module load time (line 28), while `db_compat.py` uses `get_settings()` each time.
- This means if settings are overridden (e.g., in tests), `db_helper.py` would still use the env var snapshot.

**ISSUE [MINOR]: Parameter conversion is incomplete.**
- `db_helper.py` converts `?` to `%s` for PostgreSQL. But `reports_service.py` handles its own parameter conversion with `%(name)s` named parameters. There is no single strategy.
- `stock_data.py:283` uses `?` placeholders directly in inline SQL -- this works because `afetchall` calls `_convert_sql`, but the convention is inconsistent.

**ISSUE [MINOR]: No abstraction for SQL dialect differences beyond parameter style.**
- `LIKE` vs `ILIKE` is handled ad-hoc in `reports_service.py` (line 192-195).
- `NULLS LAST` is handled ad-hoc in `reports_service.py` (line 198-200).
- `datetime_recent()` in `db_compat.py` handles date arithmetic differences.
- These should ideally be part of a unified dialect adapter.

**Recommendation:** Merge `db_helper.py` into `db_compat.py` or have `db_helper.py` import from `db_compat.py`. Add dialect-specific functions (LIKE/ILIKE, NULLS LAST, date arithmetic) to the compatibility layer.

### Severity: MEDIUM

---

## 5. Data Pipeline Audit (`csv_to_sqlite.py`)

### Data Validation

**ISSUE [MEDIUM]: Minimal input validation.**
- No schema validation on the CSV columns. Missing columns are handled gracefully (line 598-600: logged as warnings, skipped), but there is no verification that critical columns (e.g., `ticker`) exist.
- No data type validation. Numeric columns are not verified before insertion.
- NaN/null handling is present (`safe_to_sql` replaces NaN with None at line 687).

### Error Handling

**GOOD:** `unpivot_financial()` skips rows with null `period_date` (line 656), preventing null key insertion.

**ISSUE [MINOR]: Errors during row processing are not isolated.**
- If a single row causes an error during `safe_to_sql` / `df.to_sql`, the entire table insert fails. There is no per-row error isolation.
- `executescript` is used for DDL (line 735), which swallows individual statement errors.

### Idempotency

**GOOD:** The script removes the existing database file before recreating it (line 710-712). This makes it fully idempotent.

**ISSUE [MINOR]: No incremental update capability.** The only option is full recreation from the CSV. For 500 stocks this is fast, but the pattern does not scale.

### Severity: MEDIUM (for a data pipeline that runs rarely, acceptable; would be critical if run frequently)

---

## 6. Chart Engine Audit (`chart_engine/raid_chart_generator.py`)

### Design

**GOOD: Clean extension of Vanna's `PlotlyChartGenerator`.**
- Overrides specific methods (`generate_chart`, `_create_bar_chart`, `_create_table`, `_create_grouped_bar_chart`) while delegating to parent for standard charts.
- Heuristic chain (time series -> value heatmap -> histogram -> bar -> scatter -> correlation -> grouped bar -> generic) is well-ordered and covers common financial data patterns.
- Dark gold theme is consistently applied via `_apply_standard_layout()`.

**GOOD: Extensibility.**
- Column labels are configurable via `COLUMN_LABELS` dict.
- Color palette is defined as constants (`RAID_COLORWAY`, `GOLD_COLORSCALE`).
- Percentage detection (`_PCT_KEYWORDS`) and change detection (`_CHANGE_KEYWORDS`) use keyword sets that can be extended.

**ISSUE [MINOR]: `generate_chart` mutates the input DataFrame.**
- Line 98: `df[col] = pd.to_datetime(df[col])` modifies the input DataFrame in-place. Should use `.copy()` at the start.

**ISSUE [MINOR]: Table fallback threshold (8 columns) is hardcoded.**
- Line 110: `if len(df.columns) >= 8` -- this threshold could be configurable.

### Severity: LOW

---

## 7. Frontend Architecture Audit

### App Router Structure

```
frontend/src/app/
  layout.tsx        -- Root layout (RTL, ThemeProvider, Tajawal font)
  page.tsx          -- Homepage
  error.tsx         -- Root error boundary
  not-found.tsx     -- 404 page
  loading.tsx       -- Root loading state
  news/             -- News feed (decomposed into components + hooks)
  charts/           -- TradingView + TASI charts
  market/           -- Market overview
  chat/             -- AI chat interface
  stock/            -- Individual stock detail
  admin/            -- Admin panel
  login/            -- Authentication
  reports/          -- Technical reports
  announcements/    -- CMA announcements
  watchlist/        -- User watchlists
  api-docs/         -- API documentation
  markets/          -- Markets page (separate from market/)
```

**GOOD:** 15 pages with proper app router structure. Each route has its own `loading.tsx` and `error.tsx` for graceful degradation.

**ISSUE [MINOR]: Two market-related routes (`/market` and `/markets`).**
- Both `market/` and `markets/` directories exist. This could be intentional (different views) but the naming is confusing.

### Component Hierarchy

**GOOD:** Well-decomposed component tree:
- `components/layout/` -- Header, Footer, Sidebar
- `components/charts/` -- Chart wrappers (TradingView, TASI, PreBuilt)
- `components/widgets/` -- LiveMarketWidgets (SSE consumer)
- `components/common/` -- ConnectionStatusBadge, CommandPalette
- `news/components/` -- ArticleCard, FilterBar, SearchInput, SkeletonCard (collocated with page)

### Data Flow

**GOOD:** Centralized API client with typed interfaces matching backend Pydantic models.
- `lib/api-client.ts` -- All fetch functions with AbortController
- `lib/config.ts` -- Runtime configuration from NEXT_PUBLIC_* env vars
- `lib/hooks/use-api.ts` -- Data fetching hooks

**GOOD:** SSE data flows through EventSource -> React state -> component render, with reconnection backoff.

### Severity: LOW

---

## 8. Separation of Concerns

### Findings

**ISSUE [HIGH]: `app.py` is a 778-line monolith doing too many things.**

`app.py` currently handles:
1. Configuration loading (lines 46-48)
2. LLM instantiation (lines 54-65)
3. SQL runner creation (lines 70-98)
4. Tool registry setup (lines 103-110)
5. User resolver definition (lines 116-150)
6. System prompt builder definition (lines 156-164)
7. Agent assembly (lines 170-187)
8. FastAPI app creation (lines 192-193)
9. OpenAPI metadata (lines 198-220)
10. Route removal and CORS cleanup (lines 223-240)
11. Middleware stack setup (lines 245-320)
12. JWT auth middleware (lines 324-343)
13. Router registration (16 separate try/except blocks, lines 349-543)
14. Static file serving (lines 549-570)
15. Lifespan handler (lines 576-765)
16. Uvicorn entry point (lines 772-777)

**Recommendation:** Split into:
- `app.py` -- App creation and entry point only
- `agent/assembly.py` -- Vanna agent assembly (items 1-7)
- `api/router_registry.py` -- All router registrations (item 13)
- `middleware/setup.py` -- Middleware stack configuration (items 10-12)

**ISSUE [MINOR]: `health_service.py` does direct SQLite queries.**
- Lines 207-219: `_sqlite_query()` and `_get_sqlite_path()` bypass the compatibility layer for some checks, creating a parallel database access path.

**GOOD: News subsystem has clean separation.**
- `news_scraper.py` -- Fetching
- `news_paraphraser.py` -- Processing
- `news_store.py` -- Storage
- `news_scheduler.py` -- Orchestration
- `news_feed.py` -- API exposure

### Severity: HIGH (for `app.py` size), LOW (for health_service)

---

## 9. Dependency Direction

### Findings

**GOOD: Dependencies generally flow downward.**

```
app.py (orchestration)
  -> config/ (settings)
  -> api/routes/ (route handlers)
     -> api/db_helper.py (database access)
     -> database/queries.py (SQL constants)
     -> services/ (business logic)
     -> models/ (validators, response schemas)
  -> middleware/ (cross-cutting)
  -> chart_engine/ (visualization)
  -> services/widgets/ (real-time data)
```

**No circular dependencies detected.** Lower layers (services, database) do not import from higher layers (routes, middleware).

**ISSUE [MINOR]: `health_service.py` reaches into `app` module.**
- Line 494: `import app as _app_module` -- `check_news_scraper()` imports the app module to inspect the scheduler instance. This creates a reverse dependency from services to the app entry point.

**ISSUE [MINOR]: `services/news_store.py` is both a service and a data access layer.** It contains direct SQLite DDL, CRUD queries, and business logic. This conflates the service and repository layers.

### Severity: LOW

---

## 10. Configuration Pattern Audit

### `get_settings()` Usage

**GOOD: `get_settings()` singleton is the primary configuration mechanism** for:
- `app.py` (lines 47, 54-59, 70, 170, etc.)
- `config/settings.py` (cached with `@lru_cache(maxsize=1)`)
- `services/db_compat.py` (lines 30-31)
- `services/health_service.py` (lines 77, 144, 170, etc.)

### Direct `os.environ` Access

**ISSUE [MEDIUM]: Significant direct `os.environ.get()` usage outside of `get_settings()`.**

In application code (not scripts/tests):
- `api/db_helper.py:28` -- `_DB_BACKEND = os.environ.get("DB_BACKEND", "sqlite")` -- Reads backend from env var at import time instead of using `get_settings().db.backend`. This could diverge from the typed settings.
- `app.py:87-91` -- Fallback PostgreSQL config reads env vars directly (guarded by `if _settings` check, so only activates if settings fail to load).
- `app.py:262-274` -- `FRONTEND_URL` and `RAILWAY_PUBLIC_DOMAIN` are read directly from env vars for CORS configuration.
- `app.py:555` -- `FRONTEND_URL` read again for template injection.
- `app.py:650` -- `AUTH_JWT_SECRET` checked directly from env var.
- `config/logging_config.py:91-98` -- Multiple direct env var reads (`IS_DEVELOPMENT`, `SERVER_DEBUG`, `ENVIRONMENT`).
- `config/env_validator.py` -- Reads all env vars directly (by design, since it validates before settings load).
- `middleware/error_handler.py:39` -- `SERVER_DEBUG` read directly from env var.

In scripts and tests (acceptable):
- `database/migrate_sqlite_to_pg.py`, `csv_to_postgres.py`, `ingestion/*.py` -- CLI tools use argparse with env var defaults (correct pattern for standalone tools).
- `tests/` -- Test files read `POSTGRES_*` env vars directly (acceptable for test infrastructure).

**Recommendation:** Add `FRONTEND_URL` and `RAILWAY_PUBLIC_DOMAIN` to `ServerSettings`. Have `db_helper.py` use `get_settings()` instead of direct env var read. Add a `SettingsConfigDict(env_prefix)` for middleware debug mode.

### Severity: MEDIUM

---

## 11. API Versioning Audit

### Route Prefix Analysis

| Router | Prefix | Versioned? |
|--------|--------|-----------|
| `health.py` | `/health` | No |
| `auth.py` | `/api/auth` | No |
| `entities.py` (PG) | `/api/entities` | No |
| `sqlite_entities.py` | `/api/entities` | No |
| `news.py` (PG) | `/api/news` | No |
| `announcements.py` | `/api/announcements` | No |
| `watchlists.py` | `/api/watchlists` | No |
| `reports.py` | `/api/reports` | No |
| `charts.py` (PG) | `/api/charts` | No |
| `charts_analytics.py` | `/api/charts` | No |
| **market_analytics.py** | **`/api/v1/market`** | **Yes** |
| **stock_data.py** | **`/api/v1/stocks`** | **Yes** |
| **news_feed.py** | **`/api/v1/news`** | **Yes** |
| **news_stream.py** | **`/api/v1/news`** | **Yes** |
| **tasi_index.py** | **`/api/v1/charts/tasi`** | **Yes** |
| **stock_ohlcv.py** | **`/api/v1/charts`** | **Yes** |
| **widgets_stream.py** | **`/api/v1/widgets`** | **Yes** |
| **market_overview.py** | **`/api/v1/market-overview`** | **Yes** |

**ISSUE [MEDIUM]: Inconsistent API versioning.**
- **8 routers** use `/api/v1/` prefix (newer endpoints).
- **8 routers** use `/api/` without version (legacy endpoints).
- Health endpoint uses `/health` without any API prefix (acceptable for health probes).
- Vanna's built-in chat endpoints use `/api/vanna/v2/` (Vanna's own versioning).

**Pattern:** Endpoints created during the production readiness sprint and later consistently use `/api/v1/`. Original PG-backed service endpoints (`/api/news`, `/api/reports`, etc.) lack versioning.

**ISSUE [MINOR]: Potential route conflict between `charts.py` and `charts_analytics.py`.**
- Both use prefix `/api/charts`. The PG version (`charts.py`) is only registered in postgres mode, so they don't conflict in practice, but the same prefix on different routers is fragile.

**Recommendation:** Migrate all endpoints to `/api/v1/` prefix. Maintain backward compatibility with redirect routes if needed.

### Severity: MEDIUM

---

## Summary of Findings

| # | Area | Severity | Status |
|---|------|----------|--------|
| 1 | Layering (routes -> services -> DB) | LOW | Some inline SQL in routes; two parallel DB layers |
| 2 | Service abstraction inconsistency | MEDIUM | No interfaces, no DI framework, mixed patterns |
| 3 | Vanna 2.0 integration | NONE | All patterns correct per docs |
| 4 | Dual-backend abstraction | MEDIUM | Two redundant compatibility layers |
| 5 | Data pipeline validation | MEDIUM | Minimal input validation, not incremental |
| 6 | Chart engine design | LOW | Clean extension pattern, minor mutation bug |
| 7 | Frontend architecture | LOW | Well-structured, minor naming issue |
| 8 | Separation of concerns | HIGH | `app.py` is a 778-line monolith |
| 9 | Dependency direction | LOW | Generally correct, one reverse dep in health |
| 10 | Configuration pattern | MEDIUM | Significant direct `os.environ` usage |
| 11 | API versioning | MEDIUM | Only 50% of endpoints use `/api/v1/` |

---

## Priority Recommendations

### P0 (Should fix)
1. **Split `app.py`** into agent assembly, router registration, and middleware setup modules. This is the single highest-impact improvement for maintainability.

### P1 (Should fix soon)
2. **Consolidate `db_helper.py` and `db_compat.py`** into a single database abstraction layer that uses `get_settings()`.
3. **Standardize API versioning** to `/api/v1/` across all endpoints.
4. **Move direct `os.environ` reads** in `db_helper.py` and `error_handler.py` to use `get_settings()`.

### P2 (Nice to have)
5. **Add `Protocol` types** for services with dual implementations (news, reports).
6. **Add CSV schema validation** to `csv_to_sqlite.py` before processing.
7. **Fix DataFrame mutation** in `RaidChartGenerator.generate_chart()`.
8. **Consider FastAPI `Depends()`** for service injection in route handlers.

---

*End of Architecture & Design Pattern Audit*
