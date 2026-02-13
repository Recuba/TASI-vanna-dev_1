# Migration Strategy: SQLite to PostgreSQL

## Overview

This document describes the migration strategy for moving the Ra'd AI TASI platform from SQLite (development) to PostgreSQL (production). It covers schema mapping, data pipelines, rollback procedures, and operational considerations.

---

## 1. Schema Comparison

### 1.1 Shared Tables (10 tables)

These tables exist in both SQLite and PostgreSQL with identical column names. The PostgreSQL version has more columns (fuller data mapping from the source CSV) and stricter types.

| Table | SQLite PK | PG PK | Type Changes |
|---|---|---|---|
| `companies` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` | None (TEXT stays TEXT) |
| `market_data` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY REFERENCES companies(ticker)` | `REAL` -> `NUMERIC(20,4)`, `INTEGER` -> `BIGINT` |
| `valuation_metrics` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY REFERENCES companies(ticker)` | `REAL` -> `NUMERIC(20,4)` |
| `profitability_metrics` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY REFERENCES companies(ticker)` | `REAL` -> `NUMERIC(20,4)` |
| `dividend_data` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY REFERENCES companies(ticker)` | `REAL` -> `NUMERIC(20,4)` |
| `financial_summary` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY REFERENCES companies(ticker)` | `REAL` -> `NUMERIC(20,4)` |
| `analyst_data` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY REFERENCES companies(ticker)` | `REAL` -> `NUMERIC(20,4)`, `INTEGER` -> `BIGINT` |
| `balance_sheet` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | `REAL` -> `NUMERIC(20,4)` |
| `income_statement` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | `REAL` -> `NUMERIC(20,4)` |
| `cash_flow` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | `REAL` -> `NUMERIC(20,4)` |

### 1.2 PostgreSQL-Only Tables (13 tables)

| Table | PK Type | Purpose | FK References |
|---|---|---|---|
| `sectors` | `SERIAL` | Reference table (Arabic/English sector names) | None |
| `entities` | `UUID` | Enhanced company info (Arabic names, CMA/Tadawul IDs) | `companies(ticker)`, `sectors(id)` |
| `filings` | `UUID` | Filing metadata (annual, quarterly, interim) | `companies(ticker)` |
| `xbrl_facts` | `UUID` | XBRL financial data with concept identification | `companies(ticker)`, `filings(id)` |
| `computed_metrics` | `SERIAL` | Derived ratios, growth rates | `companies(ticker)` |
| `price_history` | `SERIAL` | Daily OHLCV with moving averages | `companies(ticker)` |
| `announcements` | `UUID` | CMA/Tadawul announcements (Arabic) | `companies(ticker)` |
| `news_articles` | `UUID` | Multi-source news with sentiment, entities | `companies(ticker)` |
| `technical_reports` | `UUID` | Analyst research with recommendations | `companies(ticker)` |
| `users` | `UUID` | User accounts (auth provider, subscription) | None |
| `user_watchlists` | `UUID` | Per-user ticker watchlists | `users(id)` |
| `user_alerts` | `UUID` | Price/event alerts per user | `users(id)`, `companies(ticker)` |
| `query_audit_log` | `UUID` | Query logging for analytics | `users(id)` |

### 1.3 SQLite-Only Tables

| Table | Purpose | Notes |
|---|---|---|
| `news_feed` | Scraped Arabic news (5 sources) | Created by `services/news_store.py`, uses `INSERT OR IGNORE`, `PRAGMA journal_mode=WAL` |

The `news_feed` table exists only in SQLite and is managed by the news scraper pipeline. It does not have a PostgreSQL equivalent; the PG-only `news_articles` table serves a similar but structurally different purpose.

### 1.4 PostgreSQL Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Trigram text search (Arabic names)
```

### 1.5 PostgreSQL Views

| View | Purpose |
|---|---|
| `v_latest_annual_metrics` | Joins companies with most recent annual financial statements (period_index=0) |
| `v_company_summary` | Comprehensive company overview: company + entity + market + valuation + profitability |

### 1.6 PostgreSQL Indexes (30+ indexes)

See `database/schema.sql` Section 6. Key index types:
- **B-tree**: Standard lookups (ticker, sector, dates)
- **GIN trigram**: Arabic text search (`name_ar`, `title_ar`, `body_ar`) using `gin_trgm_ops`
- **GIN JSONB**: Entity extraction search on `news_articles.entities_extracted`
- **Composite**: Multi-column for common query patterns (`ticker, period_type, period_date`)

---

## 2. Migration Pipelines

### 2.1 Pipeline A: SQLite -> PostgreSQL Migration

**Script**: `database/migrate_sqlite_to_pg.py`

**What it does**:
1. Applies `database/schema.sql` to create all PG tables (unless `--skip-schema`)
2. Reads all 10 shared tables from `saudi_stocks.db`
3. Maps types: `NaN` -> `NULL`, `Infinity` -> `NULL`
4. Excludes `id` column for SERIAL tables (PG auto-generates)
5. Batch inserts via `psycopg2.extras.execute_batch` (default batch size: 250)
6. Populates `sectors` reference table from unique sectors in `companies`
7. Populates `entities` table from `companies` (ticker, short_name, sector_id)

**Usage**:
```bash
# Dry run (preview, no writes)
python database/migrate_sqlite_to_pg.py --dry-run

# Full migration
python database/migrate_sqlite_to_pg.py \
    --pg-host localhost --pg-port 5432 \
    --pg-dbname tasi_platform --pg-user tasi_user --pg-password changeme

# Skip schema (tables already exist)
python database/migrate_sqlite_to_pg.py --skip-schema
```

**Environment variables**: `PG_HOST`, `PG_PORT`, `PG_DBNAME`, `PG_USER`, `PG_PASSWORD`

### 2.2 Pipeline B: CSV -> PostgreSQL Direct

**Script**: `database/csv_to_postgres.py`

**What it does**:
1. Reads `saudi_stocks_yahoo_data.csv` (500 rows, 1062 columns)
2. Applies schema, normalizes into 10 core tables + sectors + entities
3. Supports `--upsert` mode (updates existing, inserts new)
4. Same column mappings as `csv_to_sqlite.py`

**Usage**:
```bash
# Initial load
python database/csv_to_postgres.py

# Upsert mode (incremental update)
python database/csv_to_postgres.py --upsert

# Dry run
python database/csv_to_postgres.py --dry-run
```

### 2.3 Pipeline C: CSV -> SQLite

**Script**: `csv_to_sqlite.py`

**What it does**:
- Transforms the 1062-column flat CSV into 10 normalized SQLite tables
- Financial statements use `unpivot_financial()` to convert wide to tall format
- Period types: `annual`, `quarterly`, `ttm`
- Period index: 0 = most recent

---

## 3. Migration Procedures

### 3.1 Local Development: SQLite -> Docker PG

**Prerequisites**: Docker, Docker Compose, Python with psycopg2

```bash
# 1. Start PostgreSQL
export POSTGRES_PASSWORD=changeme
docker compose up -d postgres

# 2. Wait for readiness
docker compose exec postgres pg_isready -U tasi_user -d tasi_platform

# 3. Migrate data
python database/migrate_sqlite_to_pg.py \
    --pg-host localhost --pg-port 5432 \
    --pg-dbname tasi_platform --pg-user tasi_user --pg-password changeme

# 4. Switch backend
export DB_BACKEND=postgres
export POSTGRES_HOST=localhost
python app.py

# 5. Verify
curl http://localhost:8084/health
```

### 3.2 Docker Compose (Full Stack)

```bash
# 1. Configure .env
cp .env.example .env
# Edit .env: set DB_BACKEND=postgres, POSTGRES_PASSWORD, ANTHROPIC_API_KEY

# 2. Start all services
docker compose up -d

# The app container auto-connects to postgres container
# Schema is applied via docker-entrypoint-initdb.d/01-schema.sql
```

### 3.3 Railway Deployment (Production)

The `entrypoint.sh` script handles production initialization:

1. Maps `POSTGRES_*` env vars to `PG_*` vars
2. Checks if `companies` table exists in PG
3. If not: applies `database/schema.sql` via `psql`, loads CSV data via `csv_to_postgres.py`
4. Starts `uvicorn app:app --host 0.0.0.0 --port $PORT`

**Railway environment variables** (set in Railway dashboard):
```
DB_BACKEND=postgres
POSTGRES_HOST=postgres.railway.internal
POSTGRES_PORT=5432
POSTGRES_DB=raid_ai
POSTGRES_USER=raid
POSTGRES_PASSWORD=<strong-password>
GEMINI_API_KEY=<key>
AUTH_JWT_SECRET=<stable-secret>
```

### 3.4 Data Refresh (Re-import from CSV)

When the source CSV is updated with new stock data:

```bash
# Option A: SQLite then migrate
python csv_to_sqlite.py
python database/migrate_sqlite_to_pg.py

# Option B: Direct to PG with upsert
python database/csv_to_postgres.py --upsert
```

---

## 4. Rollback Strategy

### 4.1 SQLite Fallback

SQLite remains the default backend. Rollback is immediate:

```bash
# 1. Stop PG-backed app
# 2. Unset/change env vars
export DB_BACKEND=sqlite
unset POSTGRES_HOST

# 3. Restart
python app.py
```

The SQLite database (`saudi_stocks.db`) is always present and unmodified by PG migration.

### 4.2 PostgreSQL Data Reset

To reset the PostgreSQL database and re-migrate:

```bash
# Drop all tables (use with caution)
docker compose exec postgres psql -U tasi_user -d tasi_platform -c \
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-apply schema and data
python database/migrate_sqlite_to_pg.py
```

### 4.3 Docker Volume Reset

For a clean start:

```bash
docker compose down -v    # Removes volumes (deletes all PG data)
docker compose up -d      # Fresh start with schema init
```

---

## 5. SQL Compatibility Notes

### 5.1 Constructs That Differ Between Backends

| Pattern | SQLite | PostgreSQL |
|---|---|---|
| Parameter placeholder | `?` | `%s` |
| Named parameter | Not standard | `%(name)s` |
| Auto-increment PK | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| Upsert | `INSERT OR IGNORE` | `ON CONFLICT ... DO NOTHING` |
| Last change count | `SELECT changes()` | `RETURNING` clause |
| Table existence | `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?` | `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=%s` |
| Recent datetime | `datetime('now', '-1 day')` | `NOW() - INTERVAL '1 day'` |
| Case-insensitive search | `LIKE` (default case-insensitive) | `ILIKE` |
| Schema inspection | `PRAGMA table_info(...)` | `information_schema.columns` |
| Boolean type | `INTEGER (0/1)` | `BOOLEAN` |
| Array type | Not supported | `TEXT[]` |
| JSON type | Not supported | `JSONB` |
| IP address type | `TEXT` | `INET` |
| Trigram search | Not supported | `pg_trgm` extension with GIN indexes |

### 5.2 Compatibility Layer

The `services/db_compat.py` module provides backend-aware helpers:

```python
from services.db_compat import (
    is_postgres,          # True when DB_BACKEND=postgres
    get_read_connection,  # Pool-based for PG, file-based for SQLite
    fetchall_compat,      # Dict-based results for either backend
    fetchone_compat,      # Single row dict for either backend
    scalar_compat,        # Single scalar value for either backend
    table_exists,         # information_schema vs sqlite_master
    datetime_recent,      # NOW() - INTERVAL vs datetime('now', '-N')
)
```

For route-level queries, `api/db_helper.py` provides automatic `?` -> `%s` conversion.

### 5.3 Backend-Specific Services

| Category | Services | Backend |
|---|---|---|
| PG-only | `news_service`, `reports_service`, `announcement_service`, `user_service`, `audit_service`, `auth_service` | PostgreSQL (psycopg2) |
| SQLite-only | `news_store`, `news_scraper`, `news_scheduler`, `news_paraphraser` | SQLite |
| Dual-backend | `health_service` (via `db_compat`), routes in `api/routes/` (via `db_helper`) | Both |
| No DB | `tasi_index`, `stock_ohlcv` | yfinance API |

---

## 6. Testing the Migration

### 6.1 Automated PG Tests

```bash
# Run all tests with PG backend (starts Docker PG, sets env vars, runs tests)
bash scripts/run_pg_tests.sh

# Run and tear down after
bash scripts/run_pg_tests.sh --down

# Run only PG-specific tests
bash scripts/run_pg_tests.sh --pg-only
```

### 6.2 Test Coverage

| Test File | SQLite Tests | PG Tests | Skip Condition |
|---|---|---|---|
| `test_database.py` | 23 (always run) | 23 (skipped without PG) | `POSTGRES_HOST` not set |
| `test_app_assembly_v2.py` | ~21 | 3 | `POSTGRES_HOST` not set |
| `tests/test_services.py` | ~20 (mock) | ~9 (live PG) | `POSTGRES_HOST` not set |
| `tests/test_api_routes.py` | ~15 (mock) | ~10 (live PG) | `POSTGRES_HOST` not set |
| `tests/test_connection_pool.py` | 8 (mocked) | 0 | N/A (fully mocked) |
| **Total** | ~87 | ~45 | |

### 6.3 Manual Verification Checklist

After migration, verify:

- [ ] `GET /health` returns `"status": "healthy"` with database check passing
- [ ] `GET /api/entities?limit=5` returns 5 companies
- [ ] `GET /api/entities/2222.SR` returns Saudi Aramco details
- [ ] `GET /api/news?limit=5` returns news articles
- [ ] `GET /api/reports?limit=5` returns reports
- [ ] `GET /api/announcements?limit=5` returns announcements
- [ ] Vanna chat query "What is the market cap of Aramco?" returns correct SQL and result
- [ ] Chart endpoints (`/api/charts/sector-market-cap`, `/api/charts/top-companies`) return data
- [ ] User registration and JWT login work
- [ ] Query audit log records new queries

---

## 7. Production Readiness Checklist

### 7.1 Before Migration

- [ ] PostgreSQL 16 provisioned (Railway, Docker, or managed)
- [ ] `POSTGRES_PASSWORD` is strong (not `changeme`)
- [ ] `AUTH_JWT_SECRET` is stable and persistent
- [ ] `PG_POOL_MIN` and `PG_POOL_MAX` sized for expected concurrency
- [ ] Backup strategy defined (pg_dump schedule or managed snapshots)
- [ ] `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` configured

### 7.2 During Migration

- [ ] Run `database/migrate_sqlite_to_pg.py --dry-run` first
- [ ] Verify row counts match SQLite source
- [ ] Check sectors and entities tables populated
- [ ] Run `bash scripts/run_pg_tests.sh` to validate

### 7.3 After Migration

- [ ] Switch `DB_BACKEND=postgres` in production
- [ ] Verify health endpoint
- [ ] Monitor connection pool usage
- [ ] Set up pg_dump backups (daily recommended)
- [ ] Configure `log_min_duration_statement = 1000` for slow query logging
