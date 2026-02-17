# Database & SQL Query Audit V2

**Auditor:** db-auditor (automated)
**Date:** 2026-02-17
**Scope:** All database interactions in the Ra'd AI TASI platform

---

## Executive Summary

The codebase demonstrates a generally strong database layer with proper parameterized queries in most locations, a dual-backend abstraction, and centralized SQL constants. However, several medium-severity issues exist, including f-string SQL in internal tooling (lower risk), a potential SQL injection vector via `datetime_recent`, missing ticker validation on some entity routes, and incomplete query centralization. The migration scripts have no transaction rollback for partial failures.

**Total Findings: 27**
- Critical: 2
- High: 5
- Medium: 10
- Low: 7
- Informational: 3

---

## 1. SQL Injection Analysis

### 1.1 CRITICAL: `datetime_recent()` Uses Unparameterized f-string Interpolation

**Severity:** Critical
**File:** `services/db_compat.py:135-149`
**Issue:** The `datetime_recent(column, interval)` function builds SQL fragments using f-strings with both the `column` and `interval` arguments interpolated directly into SQL. If either argument were to come from user input, this would be a SQL injection vector.

```python
def datetime_recent(column: str, interval: str) -> str:
    if is_postgres():
        return f"{column} > NOW() - INTERVAL '{interval}'"
    return f"{column} > datetime('now', '-{interval}')"
```

**Current Risk:** Low in practice (only called from `health_service.py` with hardcoded values), but the function's API is inherently unsafe and could be misused by future callers.

**Recommendation:** Either:
1. Accept only an enum/literal for `interval` (e.g., `Literal["1 day", "1 hour"]`)
2. Validate `column` against a whitelist and `interval` against a pattern like `^\d+ (day|hour|minute)s?$`
3. Document prominently that this function must never receive user input

### 1.2 CRITICAL: `_normalize_ticker()` Used Without `validate_ticker()` in Entity Routes

**Severity:** Critical
**File:** `api/routes/entities.py:150-160`, `api/routes/sqlite_entities.py:215-225`
**Issue:** The `get_entity()` endpoint in both `entities.py` and `sqlite_entities.py` calls `_normalize_ticker(ticker)` which only strips whitespace and appends `.SR` if numeric. It does NOT validate the ticker format against the `_TICKER_PATTERN` regex. A malicious ticker value (e.g., containing SQL metacharacters) is passed through to a parameterized query, so SQL injection is prevented by the parameterized query -- but the lack of input validation means arbitrary strings reach the database layer, which is a defense-in-depth failure.

In contrast, `api/routes/stock_data.py` correctly calls `validate_ticker(ticker)` before all database queries.

**Recommendation:** Replace `_normalize_ticker()` calls with `validate_ticker()` from `models/validators.py`, which enforces the `^\d{4}(\.SR)?|\^TASI$` pattern.

### 1.3 HIGH: f-string Table Names in `csv_to_sqlite.py` (Lines 753, 773, 810)

**Severity:** High (mitigated by context)
**File:** `csv_to_sqlite.py:753,773,810`
**Issue:** Uses f-string interpolation for table names in `SELECT COUNT(*) FROM {table_name}`. The table names come from hardcoded lists in the same file, so there is no external injection vector. However, this pattern violates secure coding best practices.

```python
count = cur.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
```

**Mitigation:** Values come from `TABLES_ORDERED` constant list. Risk is informational only for this file.

### 1.4 HIGH: f-string Table Names in `migrate_sqlite_to_pg.py` (Lines 95, 118, 163)

**Severity:** High (mitigated by context)
**File:** `database/migrate_sqlite_to_pg.py:95,118,163`
**Issue:** Same f-string pattern for `PRAGMA table_info({table})`, `INSERT INTO {table}`, and `SELECT * FROM {table}`. Table names come from `TABLES_ORDERED` constant.

**Mitigation:** Admin-only migration script with hardcoded table list. Risk is low in practice.

### 1.5 HIGH: f-string in `stock_data.py` Compare Endpoint (Line 355)

**Severity:** High (mitigated by whitelist)
**File:** `api/routes/stock_data.py:355`
**Issue:** Dynamic table and column names interpolated via f-string:

```python
f"SELECT {col_list} FROM {table} WHERE ticker IN ({placeholders})",
```

**Mitigation:** Both `table` and `col_list` come from `_METRIC_MAP`, a hardcoded whitelist. The `placeholders` are `?` marks generated from the validated ticker list. Risk is effectively zero because the input data is entirely controlled by the server-side allowlist.

### 1.6 HIGH: f-string in `stock_data.py` Financials Endpoint (Line 283)

**Severity:** High (mitigated by whitelist)
**File:** `api/routes/stock_data.py:283`
**Issue:** Dynamic table name from user input:

```python
f"SELECT * FROM {statement} WHERE ticker = ? AND period_type = ? ORDER BY period_index ASC",
```

**Mitigation:** `statement` is validated against `_STATEMENT_TABLES = {"balance_sheet", "income_statement", "cash_flow"}` whitelist on line 261. This is properly guarded.

### 1.7 LOW: f-string in `csv_to_postgres.py` Truncate (Line 727)

**Severity:** Low
**File:** `database/csv_to_postgres.py:727`
**Issue:** `f"TRUNCATE TABLE {table} CASCADE"` with table from hardcoded list.

### 1.8 SAFE: All User-Facing Queries Use Parameterized Placeholders

The following modules correctly use parameterized queries throughout:
- `database/queries.py` -- all queries use `?` placeholders
- `api/db_helper.py` -- auto-converts `?` to `%s` for PostgreSQL
- `services/news_store.py` -- all `?` parameterized
- `services/news_service.py` -- all `%(name)s` parameterized
- `services/announcement_service.py` -- all `%(name)s` parameterized
- `services/reports_service.py` -- dual-backend with both styles
- `services/audit_service.py` -- all `%(name)s` parameterized
- `services/auth_service.py` -- all `%s` parameterized

---

## 2. Connection Management

### 2.1 GOOD: `api/db_helper.py` Properly Closes Connections

**File:** `api/db_helper.py:124-139`
**Assessment:** Both `_sync_fetchall()` and `_sync_fetchone()` use `try/finally` to ensure `conn.close()` is called.

### 2.2 GOOD: `services/db_compat.py` Documents Close Requirement

**File:** `services/db_compat.py:34-72`
**Assessment:** `get_read_connection()` documents that callers must close connections in a `finally` block. All callers in `health_service.py` comply.

### 2.3 GOOD: All Service Classes Close Connections

All CRUD services (`reports_service.py`, `news_service.py`, `announcement_service.py`, `audit_service.py`, `auth_service.py`) follow the pattern of `conn = self._conn()` + `try/finally: conn.close()`.

### 2.4 MEDIUM: `news_store.py` Per-Thread Connection Caching

**Severity:** Medium
**File:** `services/news_store.py:63-83`
**Issue:** The `NewsStore` class caches one SQLite connection per thread via `threading.local()`. Connections are never explicitly closed except via the `close()` method, which is not called by any route handler. The connections persist for the lifetime of the thread.

**Impact:** For long-running FastAPI workers, this means SQLite connections remain open indefinitely. WAL mode mitigates write contention, but stale connections can accumulate.

**Recommendation:** Consider adding a `__del__` method or using `atexit` to clean up, or closing connections after each operation (similar to the service pattern in other modules).

### 2.5 MEDIUM: `entities.py` and `charts.py` PG Routes Create Direct Connections

**Severity:** Medium
**Files:** `api/routes/entities.py:28-46`, `api/routes/charts.py:24-32`
**Issue:** These PG-only route handlers call `get_db_connection()` directly and manually manage `try/finally/close()`. This bypasses the centralized `db_helper.py` abstraction layer. If the connection pool implementation changes, these routes need manual updates.

**Recommendation:** Migrate to use `afetchall`/`afetchone` from `db_helper.py` for consistency.

---

## 3. Parameterized Queries

### 3.1 GOOD: Consistent `?` Placeholder Convention

All SQLite-targeted queries use `?` placeholders. The `db_helper.py:_convert_sql()` function handles automatic conversion to `%s` for PostgreSQL. This is clean and consistent.

### 3.2 GOOD: LIKE Wildcard Escaping in `news_store.py`

**File:** `services/news_store.py:271-277`
**Assessment:** The `search_articles()` method properly escapes `%` and `_` characters in user search input before using them in LIKE patterns with explicit `ESCAPE '\'`.

### 3.3 MEDIUM: No Wildcard Escaping in Entity/Chart Search

**Severity:** Medium
**Files:** `api/routes/sqlite_entities.py:141-147`, `api/routes/entities.py:64-70`, `api/routes/charts_analytics.py:67-69`
**Issue:** The `sector` and `search` parameters are wrapped in `%...%` for LIKE/ILIKE queries but the input itself is not escaped for SQL LIKE metacharacters (`%`, `_`). A user searching for `%` would match everything.

```python
params["sector"] = f"%{sector}%"  # sector could contain % or _
```

**Impact:** Not a security vulnerability (parameterized queries prevent injection), but causes incorrect search results.

**Recommendation:** Escape `%` and `_` in user input before wrapping in wildcards.

---

## 4. Transaction Handling

### 4.1 GOOD: Write Operations Use Commit/Rollback

All write operations in the service layer follow the pattern:
```python
try:
    # execute writes
    conn.commit()
except Exception:
    conn.rollback()
    raise
finally:
    conn.close()
```

This is correctly implemented in:
- `news_store.py:store_articles()`
- `news_store.py:cleanup_old()`
- `reports_service.py:store_report()` and `store_reports()`
- `news_service.py:store_articles()`
- `announcement_service.py:store_announcements()`
- `audit_service.py:log_query()`
- `auth_service.py:register()`

### 4.2 MEDIUM: `migrate_sqlite_to_pg.py` No Per-Table Rollback

**Severity:** Medium
**File:** `database/migrate_sqlite_to_pg.py:375-428`
**Issue:** The migration commits per-table (`pg_conn.commit()` inside `migrate_table`), but there is no outer transaction wrapper. If the migration fails partway through (e.g., after migrating `companies` but before `market_data`), the database is left in a partially migrated state with no automatic rollback.

**Recommendation:** Either wrap the entire migration in a single transaction, or implement a `TRUNCATE ALL` + retry mechanism, or document the partial-migration recovery procedure.

### 4.3 MEDIUM: `csv_to_postgres.py` Truncation Not Atomic With Insert

**Severity:** Medium
**File:** `database/csv_to_postgres.py:723-729`
**Issue:** Tables are truncated in a separate commit from the data insertion. If the insertion fails after truncation, data is lost.

**Recommendation:** Run truncation and insertion within the same transaction, or at minimum use `--skip-truncate` mode as the safe default.

---

## 5. Schema Consistency

### 5.1 GOOD: Schema Matches Code Usage

The 10 original tables (`companies`, `market_data`, `valuation_metrics`, `profitability_metrics`, `dividend_data`, `financial_summary`, `analyst_data`, `balance_sheet`, `income_statement`, `cash_flow`) defined in `database/schema.sql` match the table and column references in:
- `database/queries.py`
- `csv_to_sqlite.py` DDL statements
- `api/routes/stock_data.py` `_METRIC_MAP`
- `api/routes/sqlite_entities.py` queries

### 5.2 LOW: SQLite DDL Lacks Foreign Key Enforcement

**Severity:** Low
**File:** `csv_to_sqlite.py:717-718`
**Issue:** `PRAGMA foreign_keys=ON` is set during CSV import but the SQLite connection in `db_helper.py:65-67` does NOT set this pragma. This means foreign key constraints are declared but never enforced at runtime for SQLite.

```python
# csv_to_sqlite.py sets it:
conn.execute("PRAGMA foreign_keys=ON;")

# db_helper.py does NOT:
conn = sqlite3.connect(_SQLITE_PATH)
conn.row_factory = sqlite3.Row
return conn
```

**Recommendation:** Add `conn.execute("PRAGMA foreign_keys=ON")` to `db_helper.py:get_conn()` for the SQLite path.

### 5.3 LOW: `news_store.py` Creates Its Own Table Schema

**Severity:** Low
**File:** `services/news_store.py:29-52`
**Issue:** `NewsStore` creates a `news_articles` table with a slightly different schema from `database/schema.sql`. The SQLite version uses `TEXT PRIMARY KEY` for `id` and adds a `priority` column that doesn't exist in the PostgreSQL schema. It also lacks the `entities_extracted` JSONB column.

| Column | schema.sql (PG) | news_store.py (SQLite) |
|--------|-----------------|----------------------|
| id | UUID PRIMARY KEY | TEXT PRIMARY KEY |
| priority | not present | INTEGER DEFAULT 3 |
| entities_extracted | JSONB | not present |

**Impact:** Data model divergence between backends. Priority filtering works only on SQLite; entity extraction only on PG.

### 5.4 INFORMATIONAL: New Tables Not Used by Application Code

The following tables defined in `database/schema.sql` are not yet referenced by any route handler:
- `entities` (reference only in migration scripts)
- `sectors` (reference only in migration scripts)
- `filings`
- `xbrl_facts` (only referenced in `ingestion/xbrl_processor.py`)
- `computed_metrics`
- `price_history` (only referenced in `ingestion/price_loader.py`)
- `users` (only referenced in `services/auth_service.py`)
- `user_watchlists`
- `user_alerts`
- `query_audit_log` (only in `services/audit_service.py`)

These are forward-looking schema additions. No issue, but noting for completeness.

---

## 6. queries.py Completeness

### 6.1 MEDIUM: Inline SQL in Route Handlers Not Centralized

The following inline SQL queries exist outside of `database/queries.py`:

| File | Line | Query Description |
|------|------|-------------------|
| `api/routes/sqlite_entities.py` | 153-175 | Entity count + list query |
| `api/routes/entities.py` | 74-94 | Entity list with PG-specific syntax |
| `api/routes/entities.py` | 134-142 | Sector list query |
| `api/routes/entities.py` | 167-188 | Entity detail query |
| `api/routes/charts.py` | 41-48 | Sector market cap (duplicate of queries.py) |
| `api/routes/charts.py` | 73-80 | Top companies by market cap |
| `api/routes/charts.py` | 99-107 | Sector average PE (duplicate) |
| `api/routes/charts.py` | 125-133 | Dividend yield top (duplicate) |
| `api/routes/charts_analytics.py` | 73-80 | Top companies (dynamic WHERE) |
| `api/routes/stock_data.py` | 283 | Financial statement query |
| `api/routes/stock_data.py` | 389-403 | Batch quotes query |
| `api/routes/market_analytics.py` | 111 | Movers with dynamic ORDER BY |

**Total:** 12 inline SQL queries that could be centralized or at least referenced from `queries.py`.

### 6.2 MEDIUM: Duplicate Chart Queries

**Files:** `api/routes/charts.py` and `api/routes/charts_analytics.py`
**Issue:** Both files contain near-identical chart endpoints (`/sector-market-cap`, `/top-companies`, `/sector-pe`, `/dividend-yield-top`). The `charts.py` file uses PG-specific queries while `charts_analytics.py` uses the dual-backend `db_helper.py`. The queries in `charts_analytics.py` correctly reference `database/queries.py` constants, but `charts.py` duplicates them inline.

**Recommendation:** Remove `api/routes/charts.py` (PG-only) in favor of `api/routes/charts_analytics.py` (dual-backend), or ensure only one is registered in `app.py`.

---

## 7. Index Coverage

### 7.1 GOOD: Financial Statement Tables Well-Indexed

All three financial statement tables have indexes on:
- `ticker` (single column)
- `(ticker, period_type, period_date)` (composite)
- `period_type` (single column)

These match the common query patterns in `stock_data.py` financials endpoint.

### 7.2 GOOD: Primary Key Tables Use Ticker as PK

All 7 simple tables use `ticker TEXT PRIMARY KEY`, which means all single-ticker lookups are indexed via the primary key. This covers the majority of API queries.

### 7.3 MEDIUM: Missing Index on `companies.sector` for SQLite

**Severity:** Medium
**File:** `csv_to_sqlite.py:575-585`
**Issue:** The SQLite `INDEX_DDL` list only creates indexes on the financial statement tables. There are no indexes on `companies.sector` or `companies.industry` for SQLite, even though these columns are used in LIKE/ILIKE filters in entity listing and chart queries.

The PostgreSQL schema (`schema.sql:584-586`) correctly defines `idx_companies_sector` and `idx_companies_industry`.

**Recommendation:** Add to `INDEX_DDL` in `csv_to_sqlite.py`:
```sql
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry);
```

### 7.4 LOW: No Index on `market_data.market_cap` for Sorting

**Severity:** Low
**Issue:** Multiple queries sort by `m.market_cap DESC` (entity listing, top companies charts, heatmap). Neither the SQLite nor PG schema has an index on this column.

**Impact:** With only ~500 rows, the performance impact is negligible. Would matter at scale.

### 7.5 LOW: No Index on `market_data.current_price` for Filtering

**Severity:** Low
**Issue:** The `WHERE m.current_price IS NOT NULL` filter appears in most market queries. No index exists on this column.

---

## 8. SQLite/PostgreSQL Compatibility

### 8.1 GOOD: `db_helper.py` Auto-Converts Placeholders

The `_convert_sql()` function transparently converts `?` to `%s` for PostgreSQL, allowing a single query style.

### 8.2 GOOD: `db_compat.py` Provides Backend-Aware Utilities

`table_exists()`, `datetime_recent()`, `fetchall_compat()`, `fetchone_compat()`, `scalar_compat()` all handle both backends.

### 8.3 MEDIUM: `reports_service.py` Duplicates Query Logic Per Backend

**Severity:** Medium
**File:** `services/reports_service.py:296-401`
**Issue:** Every method in `TechnicalReportsService` has parallel `if is_sqlite: ... else: ...` branches that duplicate query construction logic. The SQLite branch uses `?` placeholders and list params; the PG branch uses `%(name)s` and dict params. This is error-prone and hard to maintain.

**Recommendation:** Consolidate to a single query style (using `?` placeholders) and delegate backend conversion to `db_helper.py`.

### 8.4 LOW: SQLite LIKE vs PostgreSQL ILIKE

**Severity:** Low
**File:** `services/reports_service.py:192-195`
**Issue:** `_like_op()` returns `LIKE` for SQLite and `ILIKE` for PostgreSQL. SQLite LIKE is case-insensitive for ASCII only, not for Unicode characters. Arabic text comparisons would differ between backends.

**Impact:** Minimal -- recommendation fields typically use ASCII values like "buy", "hold", "sell".

### 8.5 INFORMATIONAL: `?` to `%s` Conversion Could Break Edge Cases

**File:** `api/db_helper.py:76-79`
**Issue:** `sql.replace("?", "%s")` is a naive string replacement that would break if a `?` appears inside a quoted string literal in the SQL. No current queries contain literal `?` in strings, so this is safe today.

---

## 9. Data Integrity

### 9.1 MEDIUM: SQLite Foreign Keys Not Enforced at Runtime

**Severity:** Medium
**File:** `api/db_helper.py:65-67`
**Issue:** As noted in 5.2, the SQLite connections opened by `db_helper.py` do not execute `PRAGMA foreign_keys=ON`. SQLite defaults to `OFF` for foreign key enforcement. This means invalid ticker references in financial statement tables would not be caught.

### 9.2 LOW: No NOT NULL on Most Columns

**Severity:** Low
**Files:** `database/schema.sql`, `csv_to_sqlite.py`
**Issue:** Only `companies.ticker` (via PRIMARY KEY) and a few columns in new tables have NOT NULL constraints. All financial data columns allow NULL, which is intentional (many companies lack certain data points), but there are no CHECK constraints to prevent obviously invalid data (e.g., negative market cap, PE ratio of 0).

### 9.3 LOW: No UNIQUE Constraint on Financial Statement Rows in SQLite

**Severity:** Low
**File:** `csv_to_sqlite.py:434-483`
**Issue:** The SQLite DDL for `balance_sheet`, `income_statement`, and `cash_flow` tables has no UNIQUE constraint on `(ticker, period_type, period_index)`. Running `csv_to_sqlite.py` twice would insert duplicate rows. The PostgreSQL schema uses the `id SERIAL PRIMARY KEY` but also lacks a composite unique constraint.

**Impact:** The script removes the existing database before insertion, but if the logic were changed to upsert mode, duplicates would accumulate.

**Recommendation:** Add `UNIQUE(ticker, period_type, period_index)` to the financial statement DDL.

---

## 10. Migration Safety

### 10.1 HIGH: No Pre-Migration Backup

**Severity:** High
**File:** `database/migrate_sqlite_to_pg.py`
**Issue:** The migration script does not create a backup of the PostgreSQL database before migrating. If the migration corrupts data, there is no recovery path.

**Recommendation:** Add a `pg_dump` step before migration, or document the backup procedure in the migration script header.

### 10.2 MEDIUM: Partial Migration Not Recoverable

**Severity:** Medium
**File:** `database/migrate_sqlite_to_pg.py:375-428`
**Issue:** As noted in 4.2, per-table commits mean a failed migration leaves the database in an inconsistent state. The `--skip-schema` flag exists, but there is no `--resume-from-table` option to restart from the point of failure.

### 10.3 GOOD: NaN/Inf Handling

**File:** `database/migrate_sqlite_to_pg.py:99-111`
**Assessment:** The `clean_value()` function correctly converts `NaN` and `Infinity` float values to `None` (NULL) for PostgreSQL compatibility. This prevents insertion errors.

### 10.4 GOOD: Batch Processing With Configurable Size

**File:** `database/migrate_sqlite_to_pg.py:185-198`
**Assessment:** Data is inserted in configurable batches (default 250 rows) using `psycopg2.extras.execute_batch()` for performance.

### 10.5 LOW: `PRAGMA table_info()` Used for Column Discovery

**Severity:** Low
**File:** `database/migrate_sqlite_to_pg.py:93-96`
**Issue:** `get_sqlite_columns()` uses `PRAGMA table_info({table})` with an f-string. The table name comes from the hardcoded `TABLES_ORDERED` list, so this is safe.

---

## Summary of Recommendations (Priority Order)

### Must Fix (Critical/High)

1. **Add `validate_ticker()` to entity routes** -- Replace `_normalize_ticker()` with `validate_ticker()` from `models/validators.py` in `api/routes/entities.py:166` and `api/routes/sqlite_entities.py:231`.

2. **Secure `datetime_recent()` function** -- Add input validation (pattern match on `interval`, column name whitelist) or convert to accept only enum values.

3. **Enable SQLite foreign keys at runtime** -- Add `conn.execute("PRAGMA foreign_keys=ON")` to `db_helper.py:get_conn()`.

4. **Add pre-migration backup** -- Document or automate `pg_dump` before running migration scripts.

5. **Deduplicate chart routes** -- Remove `api/routes/charts.py` in favor of `api/routes/charts_analytics.py`.

### Should Fix (Medium)

6. **Escape LIKE wildcards** in entity search and chart sector filter parameters.
7. **Add SQLite indexes** for `companies.sector` and `companies.industry`.
8. **Add UNIQUE constraint** on `(ticker, period_type, period_index)` in financial statement table DDL.
9. **Wrap migration in single transaction** or add resume capability.
10. **Consolidate `reports_service.py`** to use single query style.
11. **Centralize remaining inline SQL** into `database/queries.py`.
12. **Address `news_store.py` connection lifecycle** (cached connections never closed).
13. **Make truncation atomic with insertion** in `csv_to_postgres.py`.

### Nice to Have (Low/Informational)

14. Add indexes on `market_data.market_cap` and `market_data.current_price`.
15. Add `NOT NULL` or `CHECK` constraints on critical financial columns.
16. Harmonize `news_articles` schema between SQLite and PostgreSQL.
17. Validate that `?` to `%s` replacement handles edge cases.

---

## Appendix: Files Audited

| File | Lines | Category |
|------|-------|----------|
| `database/queries.py` | 175 | Centralized SQL |
| `database/schema.sql` | 796 | PostgreSQL DDL |
| `database/migrate_sqlite_to_pg.py` | 434 | Migration |
| `database/csv_to_postgres.py` | 815 | Data pipeline |
| `csv_to_sqlite.py` | 823 | Data pipeline |
| `api/db_helper.py` | 150 | DB abstraction |
| `services/db_compat.py` | 150 | DB compatibility |
| `services/news_store.py` | 374 | SQLite news CRUD |
| `services/news_service.py` | 301 | PG news CRUD |
| `services/announcement_service.py` | 301 | PG announcements |
| `services/reports_service.py` | 467 | Dual-backend reports |
| `services/audit_service.py` | 312 | PG audit log |
| `services/auth_service.py` | 100 | PG auth |
| `services/health_service.py` | 670 | Health checks |
| `api/routes/stock_data.py` | 420 | Stock data API |
| `api/routes/sqlite_entities.py` | 312 | Entity API (dual) |
| `api/routes/entities.py` | 248 | Entity API (PG) |
| `api/routes/market_analytics.py` | 206 | Market API |
| `api/routes/charts_analytics.py` | 149 | Charts API (dual) |
| `api/routes/charts.py` | 146 | Charts API (PG) |
| `models/validators.py` | 87 | Input validation |
| `ingestion/xbrl_processor.py` | ~400 | XBRL ingestion |
| `ingestion/price_loader.py` | ~300 | Price ingestion |
