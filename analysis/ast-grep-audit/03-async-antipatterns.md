# Async/Await Anti-Pattern Audit Report

**Date:** 2026-02-17
**Tool:** ast-grep + manual code review
**Scope:** All Python files in the FastAPI application runtime (excluding tests, standalone scripts, and ingestion pipelines)

---

## Executive Summary

The codebase demonstrates **strong overall async hygiene**. Most route handlers properly use `asyncio.to_thread()` to wrap synchronous database and yfinance calls. However, **3 HIGH-severity** and **2 MEDIUM-severity** issues were identified that block the FastAPI event loop under specific conditions.

| Severity | Count | Description |
|----------|-------|-------------|
| HIGH     | 3     | Blocking sync calls directly inside `async def` route handlers or dependencies |
| MEDIUM   | 2     | Sync functions called from async route without `to_thread()` wrapping |
| LOW      | 5     | Sync patterns in background threads or standalone scripts (acceptable) |
| INFO     | 3     | Well-structured patterns worth noting for reference |

---

## HIGH Severity Findings

### H-1: `auth/dependencies.py` -- Sync DB query in FastAPI dependency (blocks event loop)

**File:** `auth/dependencies.py`, lines 81-92
**Function:** `get_current_user()` (sync `def`, used as FastAPI `Depends()`)
**Matched patterns:** `cur.execute(...)`, `cur.fetchone()`, `conn.cursor()`, `psycopg2` connection usage

```python
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> Dict[str, Any]:
    # ...
    conn = get_db_connection()           # sync psycopg2 connection
    try:
        with conn.cursor() as cur:
            cur.execute(                  # BLOCKS event loop
                "SELECT id, email, display_name, subscription_tier, "
                "usage_count, is_active, created_at "
                "FROM users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()         # BLOCKS event loop
    finally:
        conn.close()
```

**Why this is HIGH:** This dependency is injected into every authenticated route handler (`watchlists`, `reports POST`, `announcements POST`, `auth /me`, `auth /refresh`). Because it is a sync `def` function used as a FastAPI dependency, FastAPI runs it in the main event loop thread (FastAPI only auto-offloads sync route handlers to a threadpool, NOT sync dependencies). Every authenticated request blocks the event loop during the DB round-trip.

**Impact:** All authenticated endpoints are blocked during user lookup. Under concurrent load, this serializes request processing.

**Recommended fix:** Convert to an `async def` dependency that wraps the DB call in `asyncio.to_thread()`:

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> Dict[str, Any]:
    # ... token validation (CPU-only, fine in async) ...

    def _fetch_user(user_id: str):
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, email, ... FROM users WHERE id = %s",
                    (user_id,),
                )
                return cur.fetchone()
        finally:
            conn.close()

    row = await asyncio.to_thread(_fetch_user, user_id)
    # ... rest of validation ...
```

---

### H-2: `api/routes/auth.py` -- Sync AuthService calls in async route handlers

**File:** `api/routes/auth.py`, lines 75, 109, 176
**Functions:** `register()`, `login()`, `refresh_token()` -- all `async def`
**Matched patterns:** `service.register(...)`, `service.login(...)`, `service.verify_user_active(...)`

```python
@router.post("/register", ...)
async def register(body: UserCreate):
    service = _get_auth_service()
    result = service.register(body.email, body.password, body.display_name)  # BLOCKS
    # ...

@router.post("/login", ...)
async def login(body: UserLogin):
    service = _get_auth_service()
    result = service.login(body.email, body.password)  # BLOCKS
    # ...

@router.post("/refresh", ...)
async def refresh_token(body: TokenRefreshRequest):
    # ...
    result = service.verify_user_active(user_id)  # BLOCKS
```

**Why this is HIGH:** `AuthService.register()`, `.login()`, and `.verify_user_active()` all make synchronous psycopg2 database calls (see `services/auth_service.py` lines 46-66, 75-86, 103-109). These are called directly from `async def` route handlers without `asyncio.to_thread()`, blocking the event loop.

**Impact:** Authentication operations (register, login, refresh) block the event loop. Login is the most impactful since it is called frequently.

**Recommended fix:** Wrap each service call in `asyncio.to_thread()`:

```python
@router.post("/register", ...)
async def register(body: UserCreate):
    service = _get_auth_service()
    result = await asyncio.to_thread(
        service.register, body.email, body.password, body.display_name
    )
    # ...
```

---

### H-3: `api/routes/tasi_index.py` -- Sync yfinance fetch in async route handler

**File:** `api/routes/tasi_index.py`, line 73
**Function:** `get_tasi_index()` -- `async def`
**Matched patterns:** `fetch_tasi_index(period=period)` calls sync yfinance + `time.sleep()`

```python
@router.get("/index", response_model=TASIIndexResponse, responses=STANDARD_ERRORS)
async def get_tasi_index(
    period: str = Query("1y", description="Data period"),
) -> TASIIndexResponse:
    # ...
    result = fetch_tasi_index(period=period)  # BLOCKS - sync yfinance + time.sleep()
```

**Why this is HIGH:** `fetch_tasi_index()` in `services/tasi_index.py` (lines 215-360) is a sync function that:
1. Makes synchronous yfinance HTTP calls (`yf.Ticker(symbol).history(...)`)
2. Uses `time.sleep(SYMBOL_RETRY_DELAY)` between retries (line 330)
3. Holds a threading lock (`_fetch_lock`) during the entire fetch

This can block the event loop for several seconds on cache miss.

**Impact:** TASI index requests on cache miss block all concurrent request processing for the duration of the yfinance fetch (typically 2-10 seconds).

**Recommended fix:**

```python
@router.get("/index", ...)
async def get_tasi_index(period: str = Query("1y")) -> TASIIndexResponse:
    # ...
    result = await asyncio.to_thread(fetch_tasi_index, period=period)
```

---

## MEDIUM Severity Findings

### M-1: `api/routes/stock_ohlcv.py` -- Sync yfinance fetch in async route handler

**File:** `api/routes/stock_ohlcv.py`, line 82
**Function:** `get_stock_ohlcv()` -- `async def`
**Matched pattern:** `fetch_stock_ohlcv(ticker=ticker, period=period)`

```python
@router.get("/{ticker}/ohlcv", ...)
async def get_stock_ohlcv(ticker: str, period: str = Query("1y")) -> StockOHLCVResponse:
    # ...
    result = fetch_stock_ohlcv(ticker=ticker, period=period)  # BLOCKS
```

**Why this is MEDIUM (not HIGH):** Same pattern as H-3 -- `fetch_stock_ohlcv()` makes synchronous yfinance calls. However, this is rated MEDIUM because:
- Individual stock data is cached more aggressively (per-ticker + per-period)
- The 5-minute cache TTL means most requests hit the cache (no blocking)
- The route is less critical than the TASI index page

**Impact:** On cache miss, blocks the event loop for 2-10 seconds during yfinance fetch.

**Recommended fix:**

```python
result = await asyncio.to_thread(fetch_stock_ohlcv, ticker=ticker, period=period)
```

---

### M-2: `services/tasi_index.py` -- `time.sleep()` in sync function called from async context

**File:** `services/tasi_index.py`, line 330
**Function:** `fetch_tasi_index()` -- sync `def`
**Matched pattern:** `time.sleep(SYMBOL_RETRY_DELAY)`

```python
# Inside fetch_tasi_index(), after a failed yfinance attempt:
if idx < len(symbols) - 1:
    time.sleep(SYMBOL_RETRY_DELAY)  # 0.5 seconds
    continue
```

**Why this is MEDIUM:** This `time.sleep()` is inside a sync function that is currently called from an `async def` route handler without `to_thread()` (see H-3). When H-3 is fixed by wrapping in `asyncio.to_thread()`, this `time.sleep()` becomes acceptable because it will run in a worker thread. However, until H-3 is fixed, this adds an additional 0.5-second event loop block per retry.

**Impact:** Currently compounds the H-3 blocking issue. Becomes acceptable once H-3 is fixed.

**Recommended fix:** Fix H-3 first. If this function needs to be made fully async in the future, replace with `await asyncio.sleep(SYMBOL_RETRY_DELAY)` in an async version.

---

## LOW Severity Findings (Acceptable Patterns)

### L-1: `services/news_scraper.py` -- `requests.get()` and `time.sleep()` in sync scraper

**File:** `services/news_scraper.py`, lines 30, 460, 1019
**Matched patterns:** `import requests`, `time.sleep(INTER_REQUEST_DELAY)`, `requests.get()`

**Why this is LOW:** The news scraper runs entirely in a background daemon thread (`services/news_scheduler.py` line 50: `threading.Thread(target=self._run_loop, daemon=True)`). It is never called from an async context. The `time.sleep()` and `requests.get()` calls are appropriate for a background thread.

**No fix needed.**

---

### L-2: `services/news_scheduler.py` -- `time.sleep(1)` in background thread

**File:** `services/news_scheduler.py`, line 71
**Function:** `_run_loop()` -- runs in daemon thread

```python
def _run_loop(self) -> None:
    while self._running:
        for _ in range(FETCH_INTERVAL_SECONDS):
            if not self._running:
                return
            time.sleep(1)
```

**Why this is LOW:** This runs in a dedicated daemon thread, not in the async event loop. The 1-second sleep with stop-check pattern is intentional for responsive shutdown.

**No fix needed.**

---

### L-3: `services/health_service.py` -- Sync DB calls in health check functions

**File:** `services/health_service.py`, lines 94-120, 215-217, various
**Functions:** `check_database()`, `_sqlite_query()`, `_scalar_query()`, etc.
**Matched patterns:** `psycopg2.connect()`, `sqlite3.connect()`, `.execute()`, `.fetchall()`

**Why this is LOW:** All health check functions are sync `def` functions that are correctly wrapped in `asyncio.to_thread()` at the route level:

```python
# api/routes/health.py
report = await asyncio.to_thread(get_health)          # line 29
db = await asyncio.to_thread(check_database)           # line 65
```

**No fix needed.**

---

### L-4: `services/news_store.py` -- Sync DB calls in `NewsStore` methods

**File:** `services/news_store.py`, lines 118-348
**Functions:** `store_articles()`, `get_latest_news()`, `search_articles()`, etc.
**Matched patterns:** `conn.execute(...)`, `.fetchall()`, `.fetchone()`

**Why this is LOW:** All sync methods have corresponding `async` wrappers (lines 354-373) that use `asyncio.to_thread()`:

```python
async def aget_latest_news(self, **kwargs) -> List[Dict]:
    return await asyncio.to_thread(self.get_latest_news, **kwargs)
```

The route handlers in `api/routes/news_feed.py` correctly use only the `aget_*` async wrappers.

**No fix needed.**

---

### L-5: `ingestion/` and standalone scripts -- Sync patterns throughout

**Files:** `ingestion/price_loader.py`, `ingestion/xbrl_processor.py`, `csv_to_sqlite.py`, `database/migrate_sqlite_to_pg.py`, `database/csv_to_postgres.py`, `scripts/generate_system_prompt.py`
**Matched patterns:** `time.sleep()`, `requests.get()`, `psycopg2.connect()`, `.execute()`, `.fetchall()`

**Why this is LOW:** These are CLI scripts and data pipelines that are never imported or called from the FastAPI server. They run as standalone processes.

**No fix needed.**

---

## INFO: Well-Structured Patterns (Reference)

### I-1: Proper `asyncio.to_thread()` wrapping in route handlers

The following routes correctly wrap sync service calls:

| Route File | Service | Pattern |
|-----------|---------|---------|
| `api/routes/reports.py` | `TechnicalReportsService` | `await asyncio.to_thread(svc.get_reports, ...)` |
| `api/routes/announcements.py` | `AnnouncementService` | `await asyncio.to_thread(svc.get_announcements, ...)` |
| `api/routes/news.py` | `NewsAggregationService` | `await asyncio.to_thread(svc.get_latest_news, ...)` |
| `api/routes/watchlists.py` | `UserService` | `await asyncio.to_thread(svc.get_watchlists, ...)` |
| `api/routes/health.py` | `health_service` | `await asyncio.to_thread(get_health)` |
| `api/routes/entities.py` (PG) | direct SQL | `await asyncio.to_thread(_sync_query)` |
| `api/routes/charts.py` (PG) | direct SQL | `await asyncio.to_thread(_pg_fetchall, sql)` |
| `api/routes/market_overview.py` | yfinance | `await asyncio.to_thread(_fetch_instrument_sync, ...)` |

### I-2: Proper async helpers in `api/db_helper.py`

The `afetchall()` and `afetchone()` async wrappers correctly delegate to `asyncio.to_thread()`:

```python
async def afetchall(sql, params=None):
    return await asyncio.to_thread(_sync_fetchall, sql, params)
```

These are used by: `sqlite_entities.py`, `charts_analytics.py`, `market_analytics.py`, `stock_data.py`.

### I-3: Widget providers -- correct async patterns

- `crypto.py`: Uses `httpx.AsyncClient` (fully async HTTP)
- `metals.py`, `oil.py`, `indices.py`: Use `asyncio.to_thread()` to wrap sync yfinance calls
- `widgets_stream.py`: Uses `asyncio.to_thread()` for Redis pub/sub operations

---

## Summary of Required Fixes

| ID | File | Fix | Effort |
|----|------|-----|--------|
| **H-1** | `auth/dependencies.py` | Convert `get_current_user` to `async def` + `to_thread()` | Small |
| **H-2** | `api/routes/auth.py` | Wrap `service.register/login/verify_user_active` in `to_thread()` | Small |
| **H-3** | `api/routes/tasi_index.py` | Wrap `fetch_tasi_index()` in `to_thread()` | Trivial (1 line) |
| **M-1** | `api/routes/stock_ohlcv.py` | Wrap `fetch_stock_ohlcv()` in `to_thread()` | Trivial (1 line) |
| **M-2** | `services/tasi_index.py` | No action needed once H-3 is fixed | N/A |

**Total estimated fix effort:** ~30 minutes of development + testing.

---

## Methodology

1. **ast-grep pattern matching** was used to find all instances of:
   - `time.sleep($$$)` -- 6 matches
   - `requests.get($$$)` -- 1 match (ingestion script only)
   - `requests.post($$$)` -- 0 matches
   - `$CONN.execute($$$)` -- 100+ matches
   - `$CURSOR.fetchall()` -- 60+ matches
   - `$CURSOR.fetchone()` -- 50+ matches
   - `psycopg2.connect($$$)` -- 20+ matches

2. **Manual code review** was performed on each match to determine:
   - Whether the call is inside an `async def` function (problem) or sync `def` function
   - Whether sync functions are properly wrapped in `asyncio.to_thread()` at the call site
   - Whether the code runs in the FastAPI event loop, a background thread, or a standalone script

3. **Classification criteria:**
   - **HIGH**: Blocking call inside `async def` route handler or FastAPI dependency, affecting common request paths
   - **MEDIUM**: Blocking call in less-critical path, or with caching that limits real-world impact
   - **LOW**: Blocking call in background thread or standalone script (not in event loop)
