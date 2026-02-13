# Database Audit Report

## Overview

The Ra'd AI TASI platform uses a **dual-backend** architecture:

- **SQLite** (default, `DB_BACKEND=sqlite`): Local development, file-based `saudi_stocks.db`
- **PostgreSQL** (`DB_BACKEND=postgres`): Production (Railway/Docker), full schema in `database/schema.sql`

Configuration is managed by `config/settings.py` (`DatabaseSettings`) with `pydantic-settings`. The `api/db_helper.py` module provides a unified interface with automatic `?` to `%s` parameter conversion for PostgreSQL.

---

## 1. Database Schema: Tables, Columns, and Types

### Section 1: Core SQLite Tables (10 tables)

These tables exist in both SQLite and PostgreSQL with identical column names. Type mapping: `REAL` -> `NUMERIC(20,4)`, `INTEGER` -> `BIGINT`, `AUTOINCREMENT` -> `SERIAL`.

| Table | PK | Row Type | SQLite Types | PG Types |
|---|---|---|---|---|
| **companies** | `ticker TEXT` | 1/ticker | TEXT | TEXT |
| **market_data** | `ticker TEXT` (FK) | 1/ticker | REAL, INTEGER | NUMERIC(20,4), BIGINT |
| **valuation_metrics** | `ticker TEXT` (FK) | 1/ticker | REAL | NUMERIC(20,4) |
| **profitability_metrics** | `ticker TEXT` (FK) | 1/ticker | REAL | NUMERIC(20,4) |
| **dividend_data** | `ticker TEXT` (FK) | 1/ticker | REAL, TEXT | NUMERIC(20,4), TEXT |
| **financial_summary** | `ticker TEXT` (FK) | 1/ticker | REAL | NUMERIC(20,4) |
| **analyst_data** | `ticker TEXT` (FK) | 1/ticker | REAL, INTEGER, TEXT | NUMERIC(20,4), BIGINT, TEXT |
| **balance_sheet** | `id INTEGER AUTOINCREMENT` / `SERIAL` | N/ticker | REAL, TEXT, INTEGER | NUMERIC(20,4), TEXT, INTEGER |
| **income_statement** | `id INTEGER AUTOINCREMENT` / `SERIAL` | N/ticker | REAL, TEXT, INTEGER | NUMERIC(20,4), TEXT, INTEGER |
| **cash_flow** | `id INTEGER AUTOINCREMENT` / `SERIAL` | N/ticker | REAL, TEXT, INTEGER | NUMERIC(20,4), TEXT, INTEGER |

### Section 2: PG-Only Reference Tables

| Table | PK | Notes |
|---|---|---|
| **sectors** | `id SERIAL` | Reference: name_en, name_ar, code |
| **entities** | `id UUID` | Enhanced company info with Arabic names, FK to companies(ticker), sectors(id) |

### Section 3: PG-Only Financial Data Tables

| Table | PK | Notes |
|---|---|---|
| **filings** | `id UUID` | Filing metadata, FK to companies(ticker) |
| **xbrl_facts** | `id UUID` | XBRL financial data, FK to companies(ticker), filings(id) |
| **computed_metrics** | `id SERIAL` | Derived ratios, UNIQUE(ticker, metric_name, period_date, period_type) |
| **price_history** | `id SERIAL` | Daily OHLCV, UNIQUE(ticker, trade_date) |

### Section 4: PG-Only Content Tables

| Table | PK | Notes |
|---|---|---|
| **announcements** | `id UUID` | CMA/Tadawul announcements, FK to companies(ticker) |
| **news_articles** (PG version) | `id UUID` | Multi-source with sentiment, JSONB entities_extracted |
| **technical_reports** | `id UUID` | Analyst research with recommendations/targets |

### Section 5: PG-Only User/Auth Tables

| Table | PK | Notes |
|---|---|---|
| **users** | `id UUID` | Auth, profile, subscription tier |
| **user_watchlists** | `id UUID` | Ticker arrays (TEXT[]), FK to users(id) CASCADE |
| **user_alerts** | `id UUID` | Price/event alerts, FK to users(id) CASCADE |
| **query_audit_log** | `id UUID` | Query logging, INET type for ip_address |

### SQLite-Only Table (news_store)

| Table | PK | Notes |
|---|---|---|
| **news_articles** (SQLite version) | `id TEXT` | Different schema from PG version; includes `priority` column, UNIQUE(title, source_name) |

---

## 2. Query Locations by File

### `app.py` (FastAPI Server)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 59-62 | `AnthropicLlmService()` | N/A | LLM config, no DB |
| 71-93 | `_create_sql_runner()` | Both | Creates `SqliteRunner` or `PostgresRunner` |
| 96 | `sql_runner = _create_sql_runner()` | Both | Module-level runner |
| 102-108 | `tools.register_local_tool(RunSqlTool(...))` | Both | Vanna SQL tool |
| 503-516 | `init_pool(...)` | PG only | Connection pool init in lifespan |
| 566-567 | `NewsStore(str(_HERE / "saudi_stocks.db"))` | SQLite | News scheduler uses SQLite store |
| 606-613 | `close_pool()` | PG only | Connection pool close in lifespan |

### `csv_to_sqlite.py` (Data Pipeline)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 314-573 | DDL statements | SQLite only | `AUTOINCREMENT`, `REAL`, `INTEGER` types |
| 685-688 | `safe_to_sql()` with `pd.to_sql()` | SQLite only | Bulk insert via pandas |
| 715-717 | `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON` | SQLite only | SQLite-specific PRAGMAs |
| 753 | `SELECT COUNT(*) FROM {table_name}` | SQLite only | Unparameterized table name (safe: hardcoded list) |

### `config/settings.py`

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 18-67 | `DatabaseSettings` | Both | Accepts `DB_PG_*` and `POSTGRES_*` env vars |
| 79-85 | `PoolSettings` | PG only | `PG_POOL_MIN`, `PG_POOL_MAX` env vars |

### `api/db_helper.py` (Dual-Backend Helper)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 42-66 | `get_conn()` | Both | Returns SQLite or PG connection |
| 74-78 | `_convert_sql()` | Both | Converts `?` to `%s` for PG |
| 84-99 | `fetchall()` | Both | Dict-based result rows |
| 102-115 | `fetchone()` | Both | Dict-based single row |

### `database/pool.py` (Connection Pool)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 46-87 | `init_pool()` | PG only | `ThreadedConnectionPool(minconn, maxconn, ...)` |
| 100-123 | `get_connection()` | PG only | Context manager with commit/rollback |
| 177-194 | `get_pool_connection()` | PG only | Returns `_PooledConnection` wrapper |
| 197-207 | `close_pool()` | PG only | Closes all pool connections |

### `services/news_service.py` (PG-Only)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 107-117 | `INSERT INTO news_articles ... ON CONFLICT (id) DO NOTHING` | PG | Uses `%(name)s` params, `psycopg2.extras.Json` |
| 156-161 | `SELECT ... ORDER BY n.published_at DESC NULLS LAST LIMIT ... OFFSET` | PG | PG-compatible `NULLS LAST` |
| 198-204 | `SELECT ... WHERE ticker = ... ORDER BY published_at DESC NULLS LAST` | PG | Ticker filter |
| 238-245 | `SELECT ... JOIN companies ... WHERE sector ILIKE ...` | PG | `ILIKE` (PG-specific) |
| 257 | `SELECT * FROM news_articles WHERE id = %(id)s` | PG | Single article lookup |
| 292 | `SELECT COUNT(*) FROM news_articles n ...` | PG | Count with optional joins |

### `services/reports_service.py` (PG-Only)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 107-118 | `INSERT INTO technical_reports ... ON CONFLICT (id) DO NOTHING` | PG | `%(name)s` params |
| 141-152 | Bulk `INSERT ... ON CONFLICT DO NOTHING` | PG | `executemany` |
| 193-199 | `SELECT ... WHERE recommendation ILIKE ...` | PG | `ILIKE` (PG-specific) |
| 235-240 | `SELECT ... ORDER BY published_at DESC NULLS LAST` | PG | Ticker filter |
| 253 | `SELECT * FROM technical_reports WHERE id = %(id)s` | PG | Single report lookup |
| 285 | `SELECT COUNT(*) FROM technical_reports ...` | PG | Count with filters |

### `services/announcement_service.py` (PG-Only)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 108-118 | `INSERT INTO announcements ... ON CONFLICT (id) DO NOTHING` | PG | `%(name)s` params |
| 167-173 | `SELECT ... WHERE category ILIKE ... ORDER BY announcement_date DESC NULLS LAST` | PG | `ILIKE`, `NULLS LAST` |
| 191 | `WHERE a.is_material = TRUE` | PG | Boolean literal (also valid in SQLite) |
| 241-248 | `SELECT ... JOIN companies ... WHERE sector ILIKE ...` | PG | `ILIKE` (PG-specific) |
| 260 | `SELECT * FROM announcements WHERE id = %(id)s` | PG | Single announcement lookup |
| 292 | `SELECT COUNT(*) FROM announcements a ...` | PG | Count with filters |

### `services/audit_service.py` (PG-Only)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 110-119 | `INSERT INTO query_audit_log ... %(ip_address)s::inet` | PG | `::inet` cast (PG-specific) |
| 170-176 | `SELECT ... ORDER BY created_at DESC LIMIT ... OFFSET` | PG | User query history |
| 192 | `WHERE q.created_at >= NOW() - %(interval)s::interval` | PG | `::interval` cast (PG-specific) |
| 201-213 | `TO_CHAR(...)`, `COUNT(*) FILTER (WHERE ...)` | PG | PG-specific: `TO_CHAR`, `FILTER` clause |
| 250-262 | Monthly stats with `TO_CHAR`, `FILTER`, `::interval` | PG | PG-specific functions |
| 303 | `SELECT COUNT(*) FROM query_audit_log q ...` | PG | Count with filters |

### `services/auth_service.py` (PG-Only)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 49 | `SELECT id FROM users WHERE email = %s` | PG | `%s` positional params |
| 55-59 | `INSERT INTO users ... RETURNING id` | PG | `RETURNING` clause (PG-specific) |
| 78-83 | `SELECT id, auth_provider_id, is_active FROM users WHERE email = %s` | PG | Login query |
| 106 | `SELECT is_active FROM users WHERE id = %s` | PG | Active check |

### `services/user_service.py` (PG-Only)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 153-158 | `INSERT INTO users ... ON CONFLICT (email) DO NOTHING` | PG | Upsert pattern |
| 159 | `SELECT * FROM users WHERE email = %(email)s` | PG | Select after upsert |
| 187 | `SELECT * FROM users WHERE id = %(id)s` | PG | User by ID |
| 202 | `SELECT * FROM users WHERE email = %(email)s` | PG | User by email |
| 217-222 | `UPDATE users SET usage_count = usage_count + 1, last_query_at = NOW()` | PG | `NOW()` function |
| 245-249 | `SELECT * FROM user_watchlists WHERE user_id = ...` | PG | Watchlist list |
| 272-276 | `INSERT INTO user_watchlists ... RETURNING *` | PG | `RETURNING *` (PG-specific) |
| 321-326 | `UPDATE user_watchlists SET ... RETURNING *` | PG | `RETURNING *` (PG-specific) |
| 347-349 | `DELETE FROM user_watchlists WHERE id = ... AND user_id = ...` | PG | Watchlist delete |
| 379-386 | `INSERT INTO user_alerts ... RETURNING *` | PG | `RETURNING *` (PG-specific) |
| 431-436 | `SELECT ... FROM user_alerts WHERE user_id = ... AND is_active = TRUE` | PG | Active alerts |
| 448-452 | `UPDATE user_alerts SET is_active = FALSE WHERE ...` | PG | Deactivate alert |

### `services/health_service.py` (Both Backends)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 88 | `SELECT 1` | PG | Health check ping via pool |
| 103-104 | `SELECT 1` | PG | Health check ping via direct connection |
| 117-118 | `SELECT 1` (via `conn.execute`) | SQLite | Health check ping |
| 234 | `SELECT COUNT(*) FROM companies` | SQLite | Entity count (always SQLite) |
| 264-269 | `SELECT COUNT(*) FROM market_data ...` | SQLite | Market data count (always SQLite) |
| 311-312 | `SELECT name FROM sqlite_master WHERE type='table' AND name='news_articles'` | SQLite | **SQLite-specific**: `sqlite_master` |
| 323-327 | `SELECT COUNT(*) FROM news_articles`, `SELECT COUNT(DISTINCT source_name)` | SQLite | Article counts |
| 461-462 | `SELECT MAX(created_at) FROM news_articles` | SQLite | News scraper check |
| 473-476 | `WHERE created_at > datetime('now', '-1 day')` | SQLite | **SQLite-specific**: `datetime()` function |

### `services/news_store.py` (SQLite-Only)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 27-43 | `CREATE TABLE IF NOT EXISTS news_articles (...)` | SQLite | `TEXT PRIMARY KEY`, `UNIQUE(title, source_name)` |
| 64 | `PRAGMA journal_mode=WAL` | SQLite | SQLite-specific PRAGMA |
| 99 | `INSERT OR IGNORE INTO news_articles ...` | SQLite | **SQLite-specific**: `INSERT OR IGNORE` |
| 118 | `SELECT changes()` | SQLite | **SQLite-specific**: `changes()` function |
| 144-157 | `SELECT * FROM news_articles ... ORDER BY priority ASC, created_at DESC` | SQLite | `?` params |
| 166-168 | `SELECT * FROM news_articles WHERE id = ?` | SQLite | Single article |
| 200-207 | `WHERE title LIKE ? OR body LIKE ?` | SQLite | Case-insensitive LIKE (SQLite default) |
| 216-220 | `SELECT source_name, COUNT(*) ... GROUP BY source_name` | SQLite | Source list |
| 230 | `DELETE FROM news_articles WHERE created_at < ?` | SQLite | Cleanup |
| 231 | `SELECT changes()` | SQLite | **SQLite-specific**: `changes()` function |

### `api/routes/market_analytics.py` (Dual-Backend via db_helper)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 76-91 | `_MOVERS_SQL`: `CASE WHEN ... THEN ... END AS change_pct` | Both | Standard SQL, compatible |
| 122 | `ORDER BY change_pct {order} LIMIT ?` | Both | `?` converted to `%s` by db_helper |
| 147-158 | Market summary aggregates with `COALESCE`, `SUM`, `CASE WHEN` | Both | Standard SQL |
| 190-206 | Sector analytics with `AVG`, `SUM`, `COUNT`, `GROUP BY` | Both | Standard SQL |
| 242-256 | Heatmap data with `CASE WHEN` | Both | Standard SQL |

### `api/routes/stock_data.py` (Dual-Backend via db_helper)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 115 | `SELECT 1 FROM companies WHERE ticker = ?` | Both | Existence check |
| 198 | `SELECT * FROM dividend_data WHERE ticker = ?` | Both | Single row |
| 228 | `SELECT * FROM financial_summary WHERE ticker = ?` | Both | Single row |
| 282 | `SELECT * FROM {statement} WHERE ticker = ? AND period_type = ?` | Both | Table name from whitelist |
| 345-348 | `SELECT ticker, short_name FROM companies WHERE ticker IN (...)` | Both | Dynamic placeholders |
| 358-360 | `SELECT {col_list} FROM {table} WHERE ticker IN (...)` | Both | Table/col from whitelist |
| 395-409 | `SELECT ... CASE WHEN ... END AS change_pct ... WHERE ticker IN (...)` | Both | Batch quotes |

### `api/routes/sqlite_entities.py` (Dual-Backend via db_helper)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 139-145 | `WHERE c.sector LIKE ? ... c.ticker LIKE ? OR c.short_name LIKE ?` | Both | `LIKE` (compatible) |
| 155-160 | `SELECT COUNT(*) AS cnt FROM companies c LEFT JOIN market_data m ...` | Both | Count query |
| 164-177 | `SELECT ... FROM companies c LEFT JOIN market_data m ... ORDER BY m.market_cap DESC LIMIT ? OFFSET ?` | Both | Paginated list |
| 207-215 | `SELECT c.sector, COUNT(*) ... GROUP BY c.sector` | Both | Sector counts |
| 250-278 | 7-table JOIN query for full entity detail | Both | `CASE WHEN` for change_pct |

### `api/routes/charts_analytics.py` (Dual-Backend via db_helper)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 54-60 | `SELECT c.sector AS label, SUM(m.market_cap) AS value ... GROUP BY c.sector` | Both | Sector market cap |
| 96-103 | `SELECT c.short_name AS label, m.market_cap AS value ... LIMIT ?` | Both | Top companies |
| 134-141 | `SELECT c.sector AS label, AVG(v.trailing_pe) AS value ... GROUP BY c.sector` | Both | Sector P/E |
| 170-176 | `SELECT c.short_name AS label, d.dividend_yield AS value ... LIMIT ?` | Both | Top dividend yields |

### `api/routes/news_feed.py` (SQLite-Only via NewsStore)

| Line | Query/Action | Backend | Notes |
|---|---|---|---|
| 28 | `NewsStore(_DB_PATH)` | SQLite | Singleton store init |
| All routes | Delegates to `services/news_store.py` | SQLite | Uses SQLite `?` params |

---

## 3. SQLite-Specific vs PG-Compatible Queries

### SQLite-Specific Constructs (NOT compatible with PostgreSQL)

| File | Line | Construct | PG Equivalent |
|---|---|---|---|
| `csv_to_sqlite.py:436` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `csv_to_sqlite.py:715-717` | `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;` | No equivalent needed |
| `services/news_store.py:27-43` | `CREATE TABLE ... id TEXT PRIMARY KEY ...` | `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()` |
| `services/news_store.py:64` | `PRAGMA journal_mode=WAL` | No equivalent needed |
| `services/news_store.py:99` | `INSERT OR IGNORE INTO ...` | `INSERT ... ON CONFLICT DO NOTHING` |
| `services/news_store.py:118,231` | `SELECT changes()` | Use cursor's `rowcount` attribute |
| `services/health_service.py:311` | `SELECT name FROM sqlite_master WHERE type='table'` | `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'` |
| `services/health_service.py:474` | `datetime('now', '-1 day')` | `NOW() - INTERVAL '1 day'` |

### PG-Specific Constructs (NOT compatible with SQLite)

| File | Line | Construct | Notes |
|---|---|---|---|
| `services/audit_service.py:119` | `%(ip_address)s::inet` | PostgreSQL type cast |
| `services/audit_service.py:192` | `%(interval)s::interval` | PostgreSQL type cast |
| `services/audit_service.py:203-206` | `TO_CHAR(...)`, `COUNT(*) FILTER (WHERE ...)` | PG-specific functions |
| `services/news_service.py:126` | `psycopg2.extras.Json(...)` | PG JSONB adapter |
| `services/news_service.py:225` | `ILIKE` | PG case-insensitive LIKE |
| `services/reports_service.py:180` | `ILIKE` | PG case-insensitive LIKE |
| `services/announcement_service.py:155,228` | `ILIKE` | PG case-insensitive LIKE |
| `services/auth_service.py:57` | `INSERT ... RETURNING id` | PG-specific `RETURNING` |
| `services/user_service.py:276,326,386` | `INSERT/UPDATE ... RETURNING *` | PG-specific `RETURNING` |
| `services/user_service.py:220` | `NOW()` | PG function (but also supported in SQLite via custom function) |
| `database/schema.sql:21-22` | `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; "pg_trgm"` | PG extensions |
| `database/schema.sql:595` | `USING GIN (... gin_trgm_ops)` | PG GIN index |

### Cross-Compatible Queries (work on both backends)

All queries in these files use standard SQL compatible with both backends (via `api/db_helper.py`):
- `api/routes/market_analytics.py` -- Standard `CASE WHEN`, `SUM`, `AVG`, `COUNT`, `GROUP BY`
- `api/routes/stock_data.py` -- Standard `SELECT`, `JOIN`, `WHERE IN`
- `api/routes/sqlite_entities.py` -- Standard `SELECT`, `JOIN`, `LIKE`, `COUNT`
- `api/routes/charts_analytics.py` -- Standard `SELECT`, `JOIN`, `GROUP BY`, `ORDER BY`

---

## 4. Connection Pooling Configuration

### Current Implementation (`database/pool.py`)

- **Pool type**: `psycopg2.pool.ThreadedConnectionPool`
- **Default min**: 2 connections (`PG_POOL_MIN` env var)
- **Default max**: 10 connections (`PG_POOL_MAX` env var)
- **Key strategy**: UUID-based unique keys (avoids async handler thread-sharing issue)
- **Connection wrapper**: `_PooledConnection` class returns connections to pool on `close()`
- **Lifecycle**: Initialized in `app.py` lifespan (`_lifespan`), closed on shutdown
- **Health check**: `is_pool_initialized()` function, used by `health_service.py`

### Architecture Layers

```
Route handler
  -> api/dependencies.py:get_db_connection()
    -> database/manager.py:DatabaseManager._get_raw_connection()
      -> database/pool.py:get_pool_connection() [if pool initialized]
      -> psycopg2.connect() [fallback if pool not initialized]
```

The `DatabaseManager` (singleton via `get_database_manager()`) is the centralized connection factory. For PostgreSQL, it checks if the pool is initialized and delegates to `get_pool_connection()`. If the pool is unavailable (e.g., import error or not yet initialized), it falls back to a direct `psycopg2.connect()`.

### Pool Usage Paths

| Consumer | Connection Source | Pattern |
|---|---|---|
| `api/dependencies.py:get_db_connection()` | `DatabaseManager._get_raw_connection()` | Pool-based when PG, delegates to pool |
| `api/dependencies.py:get_db_connection_dep()` | Generator wrapping `get_db_connection()` | FastAPI `Depends()` with auto-close |
| `api/db_helper.py:get_conn()` | `api.dependencies.get_db_connection()` | Dual-backend routes |
| `services/db_compat.py:get_read_connection()` | `database.pool.get_pool_connection()` | Backend-aware health checks |
| Service constructors (News, Reports, etc.) | `get_conn=get_db_connection` | Lazy connection per operation |

### Config (`config/settings.py:79-85`)

```python
class PoolSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PG_POOL_")
    min: int = 2
    max: int = 10
```

### Pool Initialization (`app.py:553-569`)

```python
if DB_BACKEND == "postgres":
    from database.pool import init_pool
    _pool_min = _settings.pool.min if _settings else 2
    _pool_max = _settings.pool.max if _settings else 10
    init_pool(_db_settings, min_connections=_pool_min, max_connections=_pool_max)
```

### Production Sizing Recommendations

| Deployment | `PG_POOL_MIN` | `PG_POOL_MAX` | Rationale |
|---|---|---|---|
| Development (single user) | 1 | 5 | Low concurrency, minimal resource use |
| Railway (1 dyno, 512MB) | 2 | 10 | Default values, suitable for moderate traffic |
| Railway (1 dyno, 1GB) | 3 | 15 | Higher concurrency, more headroom |
| Multi-instance (2+ dynos) | 2 | 8 | Per-instance; total = N * max; keep under PG `max_connections` (default 100) |

**Key considerations**:
- PostgreSQL default `max_connections` is 100. With connection pooling across N app instances, ensure `N * PG_POOL_MAX` stays well below this limit.
- Each idle connection in the min pool consumes ~5-10MB of PG memory. Set `PG_POOL_MIN` to match steady-state concurrent query count.
- The UUID-based key strategy is correct for async FastAPI. Without it, all async handlers sharing the event loop thread would get the same connection.
- `_PooledConnection.close()` calls `rollback()` before returning to pool, which is defensive but correct -- prevents uncommitted state from leaking between checkouts.

### Connection Lifecycle Correctness

| Scenario | Behavior | Status |
|---|---|---|
| Clean exit from `get_connection()` context manager | `conn.commit()` then `putconn()` | Correct |
| Exception in `get_connection()` context manager | `conn.rollback()` then `putconn()` | Correct |
| `get_pool_connection()` caller calls `close()` | `rollback()` then `putconn()` | Correct |
| Pool not initialized | `RuntimeError` raised | Correct |
| Pool already initialized (double init) | Warning logged, skipped | Correct |
| `close_pool()` when not initialized | No-op | Correct |
| `close_pool()` exception in `closeall()` | Exception logged, pool set to None | Correct |
| `DatabaseManager` with no pool | Falls back to direct `psycopg2.connect()` | Correct |

### Tests (`tests/test_connection_pool.py`)

- 8 test methods using mocked `psycopg2` (no real PG required)
- Coverage: init, double-init skip, init failure, get_connection commit, get_connection rollback on exception, get_pool_connection wrapper close, close_pool, close_pool error handling
- `reset_pool` autouse fixture ensures clean state per test

### Identified Issues and Recommendations

1. **No connection timeout on pool checkout**: `ThreadedConnectionPool.getconn()` can block indefinitely if all connections are in use. Consider wrapping with a timeout or switching to a pool implementation that supports `timeout` (e.g., `psycopg2.pool.SimpleConnectionPool` with manual locking, or `psycogreen`/`psycopg3`).

2. **No connection validation/keepalive**: Idle connections may be terminated by PG (via `idle_in_transaction_session_timeout` or network timeouts). The pool does not validate connections before returning them. Consider adding a `SELECT 1` health check on checkout or using `keepalives` parameters:
   ```python
   psycopg2.connect(..., keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)
   ```

3. **No pool metrics exposure**: The pool size, active connections, and available connections are not exposed to the health endpoint or monitoring. Consider adding a `pool_status()` function that returns `{ "min": N, "max": N, "active": N, "available": N }`.

4. **Env var documentation**: The `PG_POOL_MIN` and `PG_POOL_MAX` env vars are not documented in `.env.example`. They should be added for operator visibility.

---

## 5. Skipped PostgreSQL Tests

### `test_database.py` (23 skipped tests)

- **Condition**: `@unittest.skipUnless(_pg_available(), "PostgreSQL not available (set POSTGRES_HOST)")`
- **Class**: `TestDatabaseIntegrityPG` (line 447)
- **Inherits**: `_DatabaseTestMixin` with 23 test methods covering:
  - Table existence, row counts, column presence
  - Foreign key relationships, index existence
  - Data integrity (non-null tickers, valid period types)
  - Financial statement validation
  - Cross-table consistency
- **PG check**: Requires `POSTGRES_HOST` env var and reachable PG server

### `test_app_assembly_v2.py` (3 skipped tests)

- **Test 3.2** (line 258): `PostgresRunner` construction -- skipped if `PG_AVAILABLE` is False
- **Test 7.4** (line 596): Full agent assembly with `PostgresRunner` -- skipped if `PG_AVAILABLE` is False
- **Test 11.2** (line 840): PG env vars present when `DB_BACKEND=postgres` -- skipped if backend is sqlite
- **PG check**: Same `_pg_available()` function checking `POSTGRES_HOST` env var

### `tests/test_services.py` (3 skipped test classes)

- **`TestNewsServicePG`** (line 406): `@unittest.skipUnless(PG_AVAILABLE, ...)`
  - 3 test methods: store_articles, get_latest_news, get_news_by_ticker
- **`TestUserServicePG`** (line 451): `@unittest.skipUnless(PG_AVAILABLE, ...)`
  - 3 test methods: get_or_create_user, increment_usage, watchlist CRUD
- **`TestAuditServicePG`** (line 504): `@unittest.skipUnless(PG_AVAILABLE, ...)`
  - 3 test methods: log_query, get_user_query_history, get_usage_stats_daily

### `tests/test_api_routes.py` (1 skipped test class)

- **`TestAPIRoutesIntegrationPG`** (line 342): `@unittest.skipUnless(PG_AVAILABLE, ...)`
  - Tests API routes against live PostgreSQL with `TestClient`
  - Sets `DB_BACKEND=postgres` before importing app
  - Tests: health, news, reports, announcements endpoints

### Summary of Skipped PG Tests

| File | Test Class/Function | Approx Tests Skipped | Skip Condition |
|---|---|---|---|
| `test_database.py` | `TestDatabaseIntegrityPG` | 23 | `POSTGRES_HOST` not set |
| `test_app_assembly_v2.py` | Tests 3.2, 7.4, 11.2 | 3 | `POSTGRES_HOST` not set |
| `tests/test_services.py` | 3 classes (News, User, Audit) | ~9 | `POSTGRES_HOST` not set |
| `tests/test_api_routes.py` | `TestAPIRoutesIntegrationPG` | ~5+ | `POSTGRES_HOST` not set |
| **Total** | | **~40** | |

### PG Test Infrastructure

**Shared fixtures** (`tests/conftest.py`):
- `pg_conn` (session-scoped): Live PG connection, auto-skips when `POSTGRES_HOST` not set
- `pg_cursor`: PG cursor with SAVEPOINT/ROLLBACK isolation per test
- `pg_conn_factory`: Callable returning new PG connections (for services accepting `get_conn`)
- `PG_AVAILABLE`: Module-level boolean for skip conditions

**Runner scripts**:
- `scripts/run_pg_tests.sh`: Starts PG via docker-compose, sets env vars, initializes schema, runs all test suites. Supports `--down` (teardown after) and `--pg-only` (PG tests only).
- `scripts/test_pg.sh`: Similar runner created by test-integr team.

---

## 6. Backend-Specific Service Classification

### SQLite-Only Services

| Service | File | DB Interaction |
|---|---|---|
| `NewsStore` | `services/news_store.py` | SQLite `news_articles` table, `INSERT OR IGNORE`, `SELECT changes()`, `PRAGMA journal_mode=WAL` |
| `NewsScheduler` | `services/news_scheduler.py` | Delegates to `NewsStore` |
| `NewsScraper` | `services/news_scraper.py` | No direct DB (passes articles to `NewsStore`) |
| `NewsParaphraser` | `services/news_paraphraser.py` | No DB access |

### PG-Only Services

| Service | File | DB Interaction |
|---|---|---|
| `NewsAggregationService` | `services/news_service.py` | `psycopg2`, `%(name)s` params, `ON CONFLICT`, `ILIKE`, `NULLS LAST` |
| `TechnicalReportsService` | `services/reports_service.py` | `psycopg2`, `%(name)s` params, `ON CONFLICT`, `ILIKE`, `NULLS LAST` |
| `AnnouncementService` | `services/announcement_service.py` | `psycopg2`, `%(name)s` params, `ON CONFLICT`, `ILIKE`, `NULLS LAST` |
| `AuditService` | `services/audit_service.py` | `psycopg2`, `::inet`, `::interval`, `TO_CHAR`, `FILTER` |
| `AuthService` | `services/auth_service.py` | `psycopg2`, `%s` params, `RETURNING` |
| `UserService` | `services/user_service.py` | `psycopg2`, `%(name)s` params, `RETURNING *`, `ON CONFLICT`, `NOW()` |

### No-DB Services

| Service | File | Notes |
|---|---|---|
| `TASIIndex` | `services/tasi_index.py` | yfinance only, in-memory cache |
| `StockOHLCV` | `services/stock_ohlcv.py` | yfinance only, in-memory cache |

### Dual-Backend (via db_helper)

| Route File | Uses | Notes |
|---|---|---|
| `api/routes/market_analytics.py` | `api.db_helper` | `?` params auto-converted |
| `api/routes/stock_data.py` | `api.db_helper` | `?` params auto-converted |
| `api/routes/sqlite_entities.py` | `api.db_helper` | `?` params auto-converted |
| `api/routes/charts_analytics.py` | `api.db_helper` | `?` params auto-converted |

### Health Service (Both Backends)

| Check | Backend | File:Line |
|---|---|---|
| `check_database()` | Both | `services/health_service.py:71-136` |
| `check_entities()` | SQLite always | `services/health_service.py:222-249` |
| `check_market_data()` | SQLite always | `services/health_service.py:252-291` |
| `check_news()` | SQLite always | `services/health_service.py:294-350` |
| `check_news_scraper()` | SQLite always | `services/health_service.py:415-522` |
| `check_tasi_index()` | No DB | `services/health_service.py:353-412` |
| `check_llm()` | No DB | `services/health_service.py:139-158` |
| `check_redis()` | No DB | `services/health_service.py:161-204` |

**Note**: `check_entities()`, `check_market_data()`, `check_news()`, and `check_news_scraper()` always query the SQLite database regardless of `DB_BACKEND` setting. This is a known limitation -- in PG mode, these health checks still read from `saudi_stocks.db`.

---

## 7. Identified Issues and Recommendations

### Issue 1: Health Checks Hardcoded to SQLite

`check_entities()`, `check_market_data()`, `check_news()`, and `check_news_scraper()` in `services/health_service.py` always use `_get_sqlite_path()` and `_sqlite_query()`, even when running with PostgreSQL backend. These should be made backend-aware.

### Issue 2: `news_articles` Table Schema Divergence

The SQLite version (in `services/news_store.py`) and PostgreSQL version (in `database/schema.sql`) have different schemas:
- SQLite: `id TEXT`, `priority INTEGER`, `UNIQUE(title, source_name)`, no `entities_extracted`
- PG: `id UUID`, `entities_extracted JSONB`, no `priority`, PK on `id` only

This means the same table name is used for different purposes in each backend.

### Issue 3: No `change_pct` Column in `market_data`

Several route queries compute `change_pct` dynamically via `CASE WHEN`. The health check `check_market_data()` references `change_pct` as if it were a real column, but it only checks for non-null values. The PG `market_data` table schema does not include `change_pct` -- this works because it's always computed inline.

### Issue 4: `LIKE` vs `ILIKE` Inconsistency

Dual-backend routes use `LIKE` (case-sensitive in PG, case-insensitive in SQLite by default). PG-only services use `ILIKE`. If dual-backend routes need case-insensitive search on PG, they should use `ILIKE` or `LOWER()`.

### Issue 5: Pool Settings Env Prefix

`PoolSettings` uses `PG_POOL_` prefix, but `app.py` references `_settings.pool.min` / `_settings.pool.max`. Env vars are `PG_POOL_MIN` and `PG_POOL_MAX`. This is correct but could be confusing alongside `POSTGRES_*` prefixes.
