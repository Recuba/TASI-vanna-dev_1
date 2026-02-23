# SQL Injection Audit Report

**Tool:** ast-grep + ripgrep
**Date:** 2026-02-17
**Scope:** All Python files in the repository
**Auditor:** ast-grep CLI (`sg.exe`) with supplemental regex searches

---

## Executive Summary

The codebase demonstrates generally good SQL hygiene. Most production services use parameterized queries (`?` for SQLite, `%s` / `%(name)s` for PostgreSQL). However, several findings require attention, primarily around **f-string interpolation of table/column names** into SQL queries. While most are mitigated by whitelist validation or internal-only use, a few in production route handlers warrant closer review.

**Totals:** 16 distinct findings across 9 files
- **CRITICAL:** 0
- **HIGH:** 2
- **MEDIUM:** 5
- **LOW:** 5
- **INFO (tests/scripts/migration):** 4

---

## Methodology

### ast-grep Patterns Executed

```bash
# 1. .execute() calls with f-string arguments (direct SQL injection surface)
sg.exe run --pattern '$A.execute(f"$$$")' --lang python .
sg.exe run --pattern '$A.execute(f"$$$", $$$)' --lang python .
sg.exe run --pattern 'conn.execute(f"$$$")' --lang python .
sg.exe run --pattern 'conn.execute(f"$$$", $$$)' --lang python .

# 2. Wrapper functions with f-string SQL
sg.exe run --pattern 'afetchall(f"$$$", $$$)' --lang python .
sg.exe run --pattern 'afetchone(f"$$$", $$$)' --lang python .
sg.exe run --pattern 'fetchall($A, f"$$$", $$$)' --lang python .

# 3. .format() based SQL construction
sg.exe run --pattern '"$$$SELECT$$$".format($$$)' --lang python .
sg.exe run --pattern '"$$$INSERT$$$".format($$$)' --lang python .
sg.exe run --pattern '"$$$DELETE$$$".format($$$)' --lang python .
sg.exe run --pattern '"$$$UPDATE$$$".format($$$)' --lang python .

# 4. % string formatting with SQL
sg.exe run --pattern '"$$$SELECT$$$" % $$$' --lang python .

# 5. f-string SQL keyword searches (double and single quote variants)
sg.exe run --pattern 'f"$$$SELECT$$$"' --lang python .
sg.exe run --pattern 'f"SELECT $$$"' --lang python .
# (and INSERT, DELETE, UPDATE, WHERE variants)
```

### Supplemental Grep Patterns

```
f["'].*SELECT.*\{       # f-string SELECT with interpolation
f["'].*INSERT.*\{       # f-string INSERT with interpolation
f["'].*UPDATE.*\{       # f-string UPDATE with interpolation
f["'].*DELETE.*\{       # f-string DELETE with interpolation
f["'].*WHERE.*\{        # f-string WHERE with interpolation
execute\(f['"]\s*(TRUNCATE|DROP|ALTER)  # DDL with f-strings
```

---

## Findings

### Finding 1: Table name interpolation in `/api/v1/stocks/{ticker}/financials`

**File:** `api/routes/stock_data.py`, line 283
**Severity:** MEDIUM (mitigated by whitelist)
**Pattern:** `afetchall(f"...", ...)` with f-string table name

```python
# Line 283
rows = await afetchall(
    f"SELECT * FROM {statement} WHERE ticker = ? AND period_type = ? ORDER BY period_index ASC",
    (ticker, period_type),
)
```

**Analysis:** The `statement` variable comes from a query parameter but is validated against a whitelist on line 261:
```python
_STATEMENT_TABLES = {"balance_sheet", "income_statement", "cash_flow"}

if statement not in _STATEMENT_TABLES:
    raise HTTPException(status_code=400, ...)
```

Additionally, `ticker` is validated by `validate_ticker()` (regex: `^\d{4}(\.SR)?|\^TASI$`) and `period_type` is checked against `("annual", "quarterly", "ttm")`.

**Risk:** The whitelist validation is correct and prevents injection. However, the pattern is fragile -- if anyone adds a new code path that bypasses the validation check, the f-string becomes exploitable.

**Recommendation:** Consider using a dict mapping to static SQL strings:
```python
_STATEMENT_QUERIES = {
    "balance_sheet": "SELECT * FROM balance_sheet WHERE ticker = ? AND period_type = ? ORDER BY period_index ASC",
    "income_statement": "SELECT * FROM income_statement WHERE ticker = ? AND period_type = ? ORDER BY period_index ASC",
    "cash_flow": "SELECT * FROM cash_flow WHERE ticker = ? AND period_type = ? ORDER BY period_index ASC",
}
```

---

### Finding 2: Table and column name interpolation in `/api/v1/stocks/compare`

**File:** `api/routes/stock_data.py`, lines 352-356
**Severity:** HIGH (multiple f-string interpolations in production route)
**Pattern:** `fetchall(conn, f"...", ...)` with f-string table name, column list, and placeholders

```python
# Lines 352-356
for table, columns in table_columns.items():
    col_list = ", ".join(["ticker"] + columns)
    rows = fetchall(
        conn,
        f"SELECT {col_list} FROM {table} WHERE ticker IN ({placeholders})",
        tuple(ticker_list),
    )
```

**Analysis:**
- `table` and `columns` are derived from `_METRIC_MAP`, which is a hardcoded dict mapping metric names to `(table, column)` tuples (lines 37-119).
- `metric_list` is validated against `_METRIC_MAP` keys on line 324: `invalid_metrics = [m for m in metric_list if m not in _METRIC_MAP]`.
- `ticker_list` is validated by `validate_ticker_list()`.
- `placeholders` is built safely: `",".join("?" for _ in ticker_list)`.

**Risk:** The values interpolated are derived from a whitelist (`_METRIC_MAP`), so this is not directly exploitable. However, this is the most complex f-string SQL interpolation in the codebase -- it interpolates `{col_list}`, `{table}`, and `{placeholders}` simultaneously. If `_METRIC_MAP` were ever populated from an external source (config file, database, user input), this would become a critical SQL injection vector.

**Recommendation:** Centralize these queries using the same pattern as `database/queries.py`. Alternatively, add a runtime assertion:
```python
assert all(c.isidentifier() for c in columns), "Invalid column names"
assert table.isidentifier(), "Invalid table name"
```

---

### Finding 3: `.format()` placeholder injection in `COMPANY_NAMES_BY_TICKERS`

**File:** `database/queries.py`, line 29-31 + `api/routes/stock_data.py`, line 344
**Severity:** MEDIUM (mitigated by safe placeholder construction)
**Pattern:** `.format(placeholders=...)` on a SQL template

```python
# database/queries.py line 29-31
COMPANY_NAMES_BY_TICKERS = (
    "SELECT ticker, short_name FROM companies WHERE ticker IN ({placeholders})"
)

# api/routes/stock_data.py line 344
COMPANY_NAMES_BY_TICKERS.format(placeholders=placeholders),
```

Where `placeholders = ",".join("?" for _ in ticker_list)`.

**Analysis:** The `placeholders` value is always a sequence of `?` characters joined by commas (e.g., `?,?,?`). It cannot contain SQL injection payloads because it is algorithmically generated from the length of the validated ticker list. However, using `.format()` on SQL strings is an anti-pattern because it opens the door for future misuse.

**Recommendation:** Move to a helper function that takes a list length and returns the formatted query:
```python
def company_names_by_tickers(count: int) -> str:
    placeholders = ",".join("?" for _ in range(count))
    return f"SELECT ticker, short_name FROM companies WHERE ticker IN ({placeholders})"
```

---

### Finding 4: Dynamic WHERE clause construction in `news_store.py`

**File:** `services/news_store.py`, lines 204, 232, 253, 284, 316
**Severity:** MEDIUM (parameterized values, but dynamic clause structure)
**Pattern:** `conn.execute(f"...", params)` with f-string WHERE clause

```python
# Line 204 (get_latest_news)
rows = conn.execute(
    f"""SELECT * FROM news_articles{where}
        ORDER BY created_at DESC, priority ASC
        LIMIT ? OFFSET ?""",
    params,
).fetchall()

# Line 232 (get_articles_by_ids)
placeholders = ",".join("?" for _ in ids)
rows = conn.execute(
    f"SELECT * FROM news_articles WHERE id IN ({placeholders})"
    " ORDER BY created_at DESC",
    ids,
).fetchall()

# Line 253 (count_articles)
row = conn.execute(
    f"SELECT COUNT(*) FROM news_articles{where}", params
).fetchone()

# Line 284 (search_articles)
rows = conn.execute(
    f"""SELECT * FROM news_articles
        WHERE {where}
        ORDER BY created_at DESC, priority ASC
        LIMIT ? OFFSET ?""",
    params,
).fetchall()

# Line 316 (count_search)
row = conn.execute(
    f"SELECT COUNT(*) FROM news_articles WHERE {where}", params
).fetchone()
```

**Analysis:** All these use the `_build_filters()` method (line 158) which constructs WHERE clauses with `?` placeholders. The actual user-provided values (source name, sentiment label, dates) are passed as parameters, never interpolated into the SQL string. The `{where}` variable only contains static clause text like `"source_name = ?"` and `"sentiment_label = ?"`.

For `get_articles_by_ids()` (line 232), `ids` is a list of strings and `placeholders` is `?,?,?` -- safe construction.

For `search_articles()` (line 272), the search query is properly escaped:
```python
escaped = query.replace("%", "\\%").replace("_", "\\_")
pattern = f"%{escaped}%"
```

**Risk:** Low in current form. The `{where}` fragments are built from fixed strings, not user input. However, a developer adding a new filter without using `?` placeholders could introduce a vulnerability.

**Recommendation:** Add a comment or assertion documenting that `_build_filters` must always use `?` placeholders, never string interpolation.

---

### Finding 5: Dynamic SQL in `reports_service.py`

**File:** `services/reports_service.py`, lines 324, 342, 379, 397, 449, 460
**Severity:** MEDIUM (parameterized values, dynamic clause construction)

```python
# Line 324 (get_reports, SQLite branch)
sql = (
    f"SELECT r.* FROM technical_reports r {where} "
    f"ORDER BY r.published_at DESC {nulls_last} "
    f"LIMIT ? OFFSET ?"
)

# Line 449 (count_reports, SQLite branch)
sql = f"SELECT COUNT(*) FROM technical_reports r {where}"

# Line 460 (count_reports, PG branch)
sql = f"SELECT COUNT(*) FROM technical_reports r {where}"
```

**Analysis:** Same pattern as news_store.py. The `{where}` clauses are built from static strings with parameterized values. The `{nulls_last}` variable is either `""` or `"NULLS LAST"` -- derived from `_nulls_last()` which checks `is_sqlite`. The `{like}` operator is either `"LIKE"` or `"ILIKE"` -- also derived from a static helper.

**Risk:** Low. All interpolated fragments are derived from internal boolean flags, not user input.

**Recommendation:** No immediate action needed, but consider documenting the safety invariant.

---

### Finding 6: Dynamic SQL in `news_service.py`, `announcement_service.py`, `audit_service.py`

**File:** `services/news_service.py`, line 292; `services/announcement_service.py`, line 292; `services/audit_service.py`, line 303
**Severity:** LOW (PostgreSQL named params, internal clause construction)

```python
# news_service.py line 292
sql = f"SELECT COUNT(*) FROM news_articles n {join} {where}"

# announcement_service.py line 292
sql = f"SELECT COUNT(*) FROM announcements a {where}"

# audit_service.py line 303
sql = f"SELECT COUNT(*) FROM query_audit_log q {where}"
```

**Analysis:** All three services follow the same pattern: build WHERE clauses from internal conditions with `%(name)s` parameterized placeholders (PostgreSQL psycopg2 named params). The `{where}` and `{join}` variables only contain static SQL fragments. All user-provided values go through the params dict.

**Risk:** Low. Proper parameterized query pattern with dynamic clause assembly from safe sources.

---

### Finding 7: Dynamic SQL in `user_service.py` (UPDATE with dynamic SET clause)

**File:** `services/user_service.py`, line 321-326
**Severity:** HIGH (dynamic SET clause construction)

```python
# Lines 310-326
sets: List[str] = ["updated_at = NOW()"]
params: Dict[str, Any] = {"id": watchlist_id, "user_id": user_id}

if name is not None:
    sets.append("name = %(name)s")
    params["name"] = name

if tickers is not None:
    sets.append("tickers = %(tickers)s")
    params["tickers"] = tickers

sql = f"""
    UPDATE user_watchlists
    SET {", ".join(sets)}
    WHERE id = %(id)s AND user_id = %(user_id)s
    RETURNING *
"""
```

**Analysis:** The `sets` list is built from hardcoded static strings (`"name = %(name)s"`, `"tickers = %(tickers)s"`, `"updated_at = NOW()"`). User values are passed via the `params` dict. The `{", ".join(sets)}` interpolation only contains these fixed fragments.

**Risk:** Medium-Low. Currently safe because the SET fragments are hardcoded. However, this pattern could become dangerous if extended to allow dynamic column names. Tagged as HIGH because UPDATE statements are inherently more dangerous than SELECTs.

**Recommendation:** Add a defensive check or assertion that all set clause strings match a safe pattern (e.g., `column = %(name)s`).

---

### Finding 8: `TRUNCATE TABLE` with f-string in migration script

**File:** `database/csv_to_postgres.py`, line 727
**Severity:** LOW (CLI-only migration script, not web-accessible)

```python
cur.execute(f"TRUNCATE TABLE {table} CASCADE")
```

**Analysis:** The `table` variable comes from a hardcoded list (`tables_to_truncate`), which is defined locally in the script:
```python
tables_to_truncate = [
    "sectors",
    "companies",
]
```

**Risk:** None in current form -- the variable is a hardcoded list in a CLI migration script. Not reachable from web requests.

---

### Finding 9: `build_insert_sql()` and `build_upsert_sql()` in migration scripts

**File:** `database/csv_to_postgres.py`, lines 435-457; `database/migrate_sqlite_to_pg.py`, lines 114-118
**Severity:** LOW (CLI-only, not web-accessible)

```python
# csv_to_postgres.py line 439
def build_insert_sql(table: str, columns: list) -> str:
    cols_str = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    return f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})"

# csv_to_postgres.py line 451
def build_upsert_sql(table: str, columns: list, pk_columns: list) -> str:
    # ...
    return (
        f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders}) "
        f"ON CONFLICT ({pk_str}) DO UPDATE SET {updates}"
    )
```

**Analysis:** Both functions accept table names and column lists that come from hardcoded mappings in the same script. These are CLI data pipeline tools, not web-accessible endpoints.

**Risk:** None in current usage. These scripts are run manually during deployment/migration.

---

### Finding 10: f-string SQL in `PRAGMA` calls (migration + scripts)

**File:** `database/migrate_sqlite_to_pg.py`, line 95; `scripts/generate_system_prompt.py`, line 47
**Severity:** LOW (CLI scripts, `table` from database metadata)

```python
# migrate_sqlite_to_pg.py line 95
rows = conn.execute(f"PRAGMA table_info({table})").fetchall()

# generate_system_prompt.py line 47
cur.execute(f"PRAGMA table_info({table})")
```

**Analysis:** The `table` values are obtained from `sqlite_master` queries within the same scripts. PRAGMA is a SQLite-specific read-only introspection command. These are CLI tools.

**Risk:** Negligible.

---

### Finding 11: f-string SQL in `test_database.py` (test code)

**File:** `test_database.py`, lines 105, 127, 134, 204, 216-221, 230-235, 245, 259-261, 275-277, 287-290, 330-332, 378-380, 396-398, 407-412
**Severity:** INFO (test code, not production)

```python
# Representative examples:
self.cursor.execute(f"PRAGMA table_info({table})")
self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
self.cursor.execute(f"SELECT DISTINCT ticker FROM {table}")
self.cursor.execute(f"""
    SELECT name FROM sqlite_master
    WHERE type='index' AND tbl_name='{table}'
""")
```

**Analysis:** All `table` and `column` variables in test code are derived from hardcoded lists within the test class. Note line 289 uses direct string interpolation (`'{table}'`) inside a SQL string literal rather than a parameter -- this is technically injectable but only from the test's own hardcoded lists.

**Risk:** None for production. The pattern at line 289 (`tbl_name='{table}'`) is worth noting as a bad practice that could be copy-pasted into production code.

**Recommendation:** Even in tests, prefer parameterized queries to set a good example for the codebase.

---

### Finding 12: f-string SQL in `tests/integration/test_pg_path.py`

**File:** `tests/integration/test_pg_path.py`, lines 101-109, 115, 150-152, 173-226
**Severity:** INFO (test code, not production)

```python
# Line 152 -- direct string interpolation in WHERE clause (not parameterized)
cur.execute(
    f"SELECT column_name, data_type FROM information_schema.columns "
    f"WHERE table_name = '{temp_table}' ORDER BY ordinal_position"
)
```

**Analysis:** `temp_table` is a hardcoded test fixture name. However, line 152 uses direct f-string interpolation in a WHERE clause value (not parameterized) -- this is a bad practice even in tests.

---

### Finding 13: Dynamic `SELECT * FROM {table}` in migration script

**File:** `database/migrate_sqlite_to_pg.py`, line 163
**Severity:** LOW (CLI migration tool)

```python
rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
```

**Analysis:** `table` comes from an iteration over known tables in the migration function. CLI-only.

---

### Finding 14: INSERT SQL with f-string in `ingestion/price_loader.py`

**File:** `ingestion/price_loader.py`, lines 113-117
**Severity:** LOW (module-level constant, not dynamic)

```python
INSERT_SQL = (
    f"INSERT INTO price_history ({', '.join(INSERT_COLUMNS)}) "
    f"VALUES ({', '.join(['%s'] * len(INSERT_COLUMNS))}) "
    f"ON CONFLICT (ticker, trade_date) DO NOTHING"
)
```

**Analysis:** This is a module-level constant. `INSERT_COLUMNS` is a hardcoded list defined on lines 101-111. The f-string is evaluated once at import time, producing a static SQL string. Not exploitable.

---

### Finding 15: INSERT SQL with f-string in `ingestion/xbrl_processor.py`

**File:** `ingestion/xbrl_processor.py`, line 177
**Severity:** LOW (module-level constant)

```python
f"INSERT INTO xbrl_facts ({', '.join(XBRL_INSERT_COLUMNS)}) "
```

**Analysis:** Same pattern as Finding 14. Module-level constant from hardcoded column list.

---

### Finding 16: INSERT SQL with f-string in `reports_service.py`

**File:** `services/reports_service.py`, lines 220, 231
**Severity:** LOW (built from hardcoded column list)

```python
# Line 220 (SQLite branch)
f"INSERT OR IGNORE INTO technical_reports ({cols}) "
f"VALUES ({placeholders})"

# Line 231 (PG branch)
f"INSERT INTO technical_reports ({cols}) "
f"VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
```

**Analysis:** `cols` is a hardcoded string constant defined on line 212-215. `placeholders` is generated from the column count. Safe construction.

---

## Existing Protections

The codebase has several layers of defense already in place:

1. **Ticker validation** (`models/validators.py`): Regex `^\d{4}(\.SR)?|\^TASI$` prevents arbitrary strings in ticker parameters across 7+ endpoints.

2. **Table name whitelists** (`api/routes/stock_data.py`): `_STATEMENT_TABLES` set and `_METRIC_MAP` dict ensure only known table/column names are used.

3. **SQL query validator** (`backend/security/sql_validator.py`): Comprehensive sqlparse-based validator for AI-generated queries that blocks forbidden operations (INSERT, UPDATE, DELETE, DROP, etc.), detects injection patterns, and checks for schema probing.

4. **Parameterized queries throughout**: All user-provided values (tickers, source names, dates, search strings, IDs) flow through `?` (SQLite) or `%(name)s` / `%s` (PostgreSQL) parameterized query placeholders.

5. **LIKE escape handling** (`services/news_store.py`, line 272): Search queries properly escape `%` and `_` wildcards.

6. **Pagination bounds** (`le=100` on limit parameters): Prevents abuse via large LIMIT values.

---

## Risk Summary Matrix

| # | File | Line(s) | Interpolated Value | Source | Validation | Severity |
|---|------|---------|-------------------|--------|------------|----------|
| 1 | `api/routes/stock_data.py` | 283 | `{statement}` (table name) | Query param | Whitelist check | MEDIUM |
| 2 | `api/routes/stock_data.py` | 355 | `{col_list}`, `{table}`, `{placeholders}` | Derived from `_METRIC_MAP` | Whitelist check | HIGH |
| 3 | `database/queries.py` + `stock_data.py` | 30, 344 | `.format(placeholders=...)` | Generated `?` sequence | Safe construction | MEDIUM |
| 4 | `services/news_store.py` | 204,232,253,284,316 | `{where}`, `{placeholders}` | Internal clause builder | `?` params | MEDIUM |
| 5 | `services/reports_service.py` | 324,342,379,397,449,460 | `{where}`, `{nulls_last}`, `{like}` | Internal builders | Parameterized | MEDIUM |
| 6 | `services/news_service.py` et al. | 292 | `{join}`, `{where}` | Internal builders | `%(name)s` params | LOW |
| 7 | `services/user_service.py` | 321-326 | `{", ".join(sets)}` | Hardcoded set fragments | `%(name)s` params | HIGH |
| 8 | `database/csv_to_postgres.py` | 727 | `{table}` | Hardcoded list | CLI script | LOW |
| 9 | `database/csv_to_postgres.py` | 435-457 | `{table}`, `{cols_str}` | Hardcoded mappings | CLI script | LOW |
| 10 | Migration/script files | various | `{table}` in PRAGMA | DB metadata | CLI script | LOW |
| 11 | `test_database.py` | various | `{table}`, `{column}`, `'{table}'` | Hardcoded test lists | Test code | INFO |
| 12 | `tests/integration/test_pg_path.py` | 152 | `'{temp_table}'` | Hardcoded fixture | Test code | INFO |
| 13 | `database/migrate_sqlite_to_pg.py` | 163 | `{table}` | Known tables | CLI script | LOW |
| 14 | `ingestion/price_loader.py` | 113-117 | `{INSERT_COLUMNS}` | Module constant | Import-time eval | LOW |
| 15 | `ingestion/xbrl_processor.py` | 177 | `{XBRL_INSERT_COLUMNS}` | Module constant | Import-time eval | LOW |
| 16 | `services/reports_service.py` | 220, 231 | `{cols}`, `{placeholders}` | Hardcoded string | Internal builder | LOW |

---

## Recommendations

### Priority 1 (HIGH findings -- harden now)

1. **Finding 2 (`stock_data.py` compare endpoint):** Replace the dynamic `f"SELECT {col_list} FROM {table} ..."` pattern with pre-built query templates keyed by table name. Even though `_METRIC_MAP` is currently hardcoded, this is the most complex dynamic SQL construction in any route handler.

2. **Finding 7 (`user_service.py` UPDATE):** Add a runtime assertion validating that all fragments in the `sets` list match a safe pattern before interpolation. Consider using a builder pattern that only accepts known column names.

### Priority 2 (MEDIUM findings -- improve resilience)

3. **Finding 1 (`stock_data.py` financials endpoint):** Replace the f-string table name with a dict-lookup to static SQL strings, eliminating the interpolation entirely.

4. **Finding 3 (`queries.py` `.format()`):** Replace `.format(placeholders=...)` with a function that generates the complete SQL string. Avoid `.format()` on SQL strings as a general rule.

5. **Findings 4-5 (news_store, reports_service):** Add inline documentation or assertions to the `_build_filters()` / clause-builder methods mandating that all clause fragments use `?` / `%(name)s` placeholders.

### Priority 3 (LOW/INFO -- best practices)

6. **Test code (Findings 11-12):** Fix the `'{table}'` direct interpolation in `test_database.py` line 289 and `test_pg_path.py` line 152 to use parameterized queries. Tests serve as examples for developers.

7. **CLI scripts (Findings 8-10, 13-15):** No immediate action needed, but consider adding input validation if any of these scripts ever accept user-provided table names via CLI arguments.

---

## Conclusion

No **CRITICAL** SQL injection vulnerabilities were found. The codebase consistently uses parameterized queries for user-provided values. The two **HIGH** findings involve dynamic SQL construction in production route handlers where table names and column names are interpolated via f-strings. While both are currently protected by hardcoded whitelist validation, the patterns are fragile and should be hardened to eliminate the f-string interpolation entirely. The existing `SqlQueryValidator` in `backend/security/sql_validator.py` provides strong protection for AI-generated queries but does not cover the application's own dynamic SQL construction patterns identified in this audit.
