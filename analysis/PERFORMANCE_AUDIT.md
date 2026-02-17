# Performance & Scalability Audit

**Auditor:** perf-auditor
**Date:** 2026-02-17
**Scope:** Full backend + frontend performance review
**Codebase:** Ra'd AI TASI Market Analytics Platform

---

## Executive Summary

The codebase demonstrates generally good async discipline -- most route handlers use `asyncio.to_thread()` for synchronous database calls, and SSE generators check `request.is_disconnected()`. However, several high-impact issues remain: a global `_fetch_lock` in yfinance services serializes all stock OHLCV requests, the news scraper makes sequential HTTP calls with blocking sleeps, auth routes call sync database methods without thread offloading, and `DemoAgentMemory(max_items=10000)` will accumulate unbounded memory in production. The frontend bundles heavy dependencies (plotly.js at ~3.5MB, swagger-ui-react, xlsx) that should be lazy-loaded.

**Critical findings:** 4
**High-impact findings:** 6
**Medium-impact findings:** 7
**Low-impact findings:** 5

---

## 1. Blocking I/O in Async Handlers

### PERF-01: Auth route sync database calls without `asyncio.to_thread()` [HIGH]

**Files:** `api/routes/auth.py:75`, `api/routes/auth.py:109`, `api/routes/auth.py:176`

The `register()`, `login()`, and `refresh_token()` handlers are `async def` but call `service.register()`, `service.login()`, and `service.verify_user_active()` synchronously. These methods (`services/auth_service.py`) open a PostgreSQL connection, execute queries, and close the connection -- all blocking the event loop.

```python
# auth.py:75 -- blocks the event loop
result = service.register(body.email, body.password, body.display_name)

# auth.py:109 -- blocks the event loop
result = service.login(body.email, body.password)
```

**Impact:** Under concurrent load, login/register requests will block the event loop, causing latency spikes for all other async handlers. Password hashing (bcrypt) is particularly CPU-intensive.

**Fix:** Wrap all `AuthService` method calls in `asyncio.to_thread()`:
```python
result = await asyncio.to_thread(service.register, body.email, body.password, body.display_name)
result = await asyncio.to_thread(service.login, body.email, body.password)
```

### PERF-02: `fetch_tasi_index()` and `fetch_stock_ohlcv()` called synchronously from async handlers [HIGH]

**Files:** `api/routes/tasi_index.py:73`, `api/routes/stock_ohlcv.py:82`

Both route handlers call their respective `fetch_*` functions directly without `asyncio.to_thread()`:

```python
# tasi_index.py:73
result = fetch_tasi_index(period=period)

# stock_ohlcv.py:82
result = fetch_stock_ohlcv(ticker=ticker, period=period)
```

These functions make HTTP calls to Yahoo Finance (via `yfinance`), acquire `threading.Lock()`, and perform file I/O -- all blocking operations.

**Impact:** Each yfinance call can take 1-10 seconds. During this time, the event loop is completely blocked, preventing all other requests from being processed.

**Fix:** Wrap in `asyncio.to_thread()`:
```python
result = await asyncio.to_thread(fetch_tasi_index, period=period)
result = await asyncio.to_thread(fetch_stock_ohlcv, ticker=ticker, period=period)
```

### PERF-03: `_get_auth_service()` opens DB connection synchronously on every call [MEDIUM]

**File:** `api/routes/auth.py:33-43`

`_get_auth_service()` is called in several handlers. While the function itself is lightweight, it calls `get_db_connection()` at class construction, which may block.

**Fix:** Make the service a request-scoped dependency and cache it.

---

## 2. N+1 Query Patterns

### PERF-04: No N+1 issues detected [OK]

The codebase does not exhibit classic N+1 patterns. Database queries use JOINs appropriately (e.g., `ENTITY_FULL_DETAIL` joins 7 tables in a single query). The `compare_stocks` endpoint groups metrics by table and executes one query per table, which is efficient.

The `news_store.store_articles()` does execute one INSERT per article in a loop (`news_store.py:121-145`), but uses `INSERT OR IGNORE` which is the correct approach for deduplication in SQLite. Batching would help at scale but is low priority given the small volume (~50 articles per cycle).

---

## 3. Missing Pagination

### PERF-05: `/api/v1/market/heatmap` returns all ~500 stocks without pagination [MEDIUM]

**File:** `api/routes/market_analytics.py:183-205`

The heatmap endpoint returns all stocks with market cap data (up to ~500 rows) in a single response. While this is intentional for the treemap visualization, the payload can be large.

**Fix:** Add optional `limit` parameter with a reasonable default, or consider server-side aggregation for smaller sectors.

### PERF-06: `/api/v1/market/sectors` returns unbounded sector list [LOW]

**File:** `api/routes/market_analytics.py:152-180`

The sector analytics endpoint has no LIMIT clause, but this is acceptable since there are only ~20 sectors on TASI.

### PERF-07: `/api/entities` allows `limit=500` which returns the entire companies table [MEDIUM]

**File:** `api/routes/sqlite_entities.py:130`

```python
limit: int = Query(50, ge=1, le=500),
```

A `limit=500` returns every company with all joined data. The query is a 7-table JOIN (`ENTITY_FULL_DETAIL` pattern in the full detail endpoint), making this potentially expensive.

**Fix:** Reduce `le=500` to `le=100` to match other endpoints.

---

## 4. Cache Effectiveness

### PERF-08: Cache stampede risk on `cache_response` decorator [MEDIUM]

**File:** `services/cache_utils.py:126-158`

When a cached entry expires, multiple concurrent requests will all miss the cache and execute the underlying function simultaneously (thundering herd). There is no locking or request coalescing.

**Impact:** Most visible on the `/api/v1/market-overview` endpoint which fetches 10 instruments from yfinance. After the 60s TTL expires, multiple concurrent requests will each trigger 10 yfinance calls.

**Fix:** Add a simple lock-per-key mechanism or "stale-while-revalidate" pattern:
```python
# Pseudocode: serve stale value while one request refreshes
if cached_but_stale:
    if try_acquire_refresh_lock(key):
        result = await func(...)
        cache.put(key, result)
    else:
        return stale_value
```

### PERF-09: Shared `_fallback_cache` singleton across all `@cache_response` users [LOW]

**File:** `services/cache_utils.py:80`

All functions decorated with `@cache_response` share a single `_fallback_cache` with 1024 max entries. High-cardinality cached functions (e.g., per-ticker stock data) could evict entries from low-cardinality functions (e.g., market overview).

**Fix:** Consider per-function cache instances or increase max entries.

### PERF-10: yfinance cache TTL of 300s (5 min) is appropriate [OK]

Both `tasi_index.py` and `stock_ohlcv.py` use 300s TTL, which is reasonable for market data that changes during trading hours. The circuit breaker (5 failures, 5/15 min timeout) prevents cascading failures.

### PERF-11: `cache_response` key includes `repr()` of all arguments [LOW]

**File:** `services/cache_utils.py:101-108`

The `_make_key` function uses `repr()` for all arguments. For complex objects (e.g., Pydantic models, Request objects), this could produce very long keys or inconsistent hashing.

**Fix:** This is currently fine since cached functions only receive primitives, but document this constraint.

---

## 5. Memory Leaks and Accumulation

### PERF-12: `DemoAgentMemory(max_items=10000)` accumulates in-memory forever [HIGH/CRITICAL]

**File:** `app.py:184`

```python
agent_memory=DemoAgentMemory(max_items=10000),
```

Each Vanna AI chat conversation is stored in memory. With 10,000 max items, and each conversation potentially containing large SQL results and chart data, memory usage can grow to hundreds of MB or more before eviction kicks in.

**Impact:** In production with many concurrent users, this will cause OOM crashes. Memory is never persisted, so restarts lose all conversation history.

**Fix:**
1. Reduce `max_items` to 1000 for immediate relief
2. Implement a persistent memory backend (PostgreSQL or Redis) for production
3. Add memory usage monitoring/alerts

### PERF-13: SSE generators properly check disconnection [OK]

**Files:** `api/routes/widgets_stream.py:83`, `api/routes/news_stream.py:46`

Both SSE generators correctly use `await request.is_disconnected()` to detect client disconnection and break the loop. The Redis pubsub generator also has proper cleanup in a `finally` block (`widgets_stream.py:137-142`).

### PERF-14: QuotesHub `_snapshot_event` race condition [MEDIUM]

**File:** `services/widgets/quotes_hub.py:100-101`

```python
_snapshot_event.set()
_snapshot_event.clear()
```

The event is set and immediately cleared. If a consumer coroutine is waiting on `event.wait()` but hasn't been scheduled to run between `set()` and `clear()`, it will miss the event entirely. This can cause delayed updates.

**Impact:** SSE clients may miss some snapshot updates, receiving them on the next 5-second timeout keepalive instead.

**Fix:** Use an `asyncio.Condition` or keep the event set and let consumers clear it after reading:
```python
_snapshot_event.set()
# Don't clear -- let consumers handle it
```

### PERF-15: Module-level `_snapshot_event` and `_latest_snapshot` globals [MEDIUM]

**File:** `services/widgets/quotes_hub.py:26-27`

```python
_latest_snapshot: Optional[str] = None
_snapshot_event: asyncio.Event = asyncio.Event()
```

These globals are created at module import time, before any event loop exists. This works with the default event loop in Python 3.10+, but could cause issues in testing or with multiple event loops.

**Impact:** Low in production, but can cause test isolation issues.

---

## 6. Large Payloads

### PERF-16: `SELECT *` in `news_store.py` returns all columns including full article body [MEDIUM]

**Files:** `services/news_store.py:204`, `services/news_store.py:284`

The `get_latest_news()` and `search_articles()` methods use `SELECT *`, returning the full `body` text for every article in list queries. Article bodies can be several KB each.

```python
f"""SELECT * FROM news_articles{where}
    ORDER BY created_at DESC, priority ASC
    LIMIT ? OFFSET ?"""
```

**Impact:** A list of 20 articles with full body text can be 50-100KB. When used by the news feed listing (which shows truncated previews), most of this data is wasted.

**Fix:** Use explicit column selection, or add a separate `body` endpoint:
```python
"SELECT id, ticker, title, source_name, source_url, published_at, sentiment_score, sentiment_label, language, priority, created_at FROM news_articles..."
```
Return `body` only in the single-article endpoint (`get_article_by_id`).

### PERF-17: Market overview returns 90-day historical closes for all 10 instruments [MEDIUM]

**File:** `api/routes/market_overview.py:179`

```python
"historical_closes": [round(c, 4) for c in closes],
```

Each instrument returns ~90 float values in `historical_closes` plus 30 in `sparkline`. For 10 instruments, that is ~1,200 floats per response. The 60s cache mitigates repeated requests.

**Fix:** Consider making `historical_closes` optional via a query parameter, since the frontend may only need sparkline data for the initial view.

### PERF-18: Financial statement endpoint uses `SELECT *` intentionally [OK]

**File:** `api/routes/stock_data.py:282-284`

The `SELECT * FROM {statement}` is documented as intentional because financial statement tables have dynamic columns. The result is filtered per-ticker, so the payload is bounded.

---

## 7. Frontend Bundle Size

### PERF-19: Heavy dependencies that should be lazy-loaded [HIGH]

**File:** `frontend/package.json`

Several large dependencies are included that should use dynamic imports:

| Dependency | Approx Size | Usage | Recommendation |
|---|---|---|---|
| `plotly.js-dist-min` | ~3.5MB | Chart page only | `next/dynamic` with `ssr: false` |
| `swagger-ui-react` | ~2MB | Admin/docs page only | `next/dynamic` with `ssr: false` |
| `xlsx` | ~800KB | Export feature only | `next/dynamic`, load on button click |
| `jspdf` + `jspdf-autotable` | ~500KB | PDF export only | `next/dynamic`, load on button click |
| `react-syntax-highlighter` | ~1.5MB | Chat code blocks only | `next/dynamic` |
| `recharts` | ~500KB | Charts page only | `next/dynamic` |

**Impact:** First-load JS of 126KB (reported in build) suggests Next.js tree-shaking is working, but these libraries will increase chunk sizes and slow down page transitions.

**Fix:** Use `next/dynamic` with `{ ssr: false }` for all chart and export components:
```tsx
const PlotlyChart = dynamic(() => import('react-plotly.js'), { ssr: false });
```

### PERF-20: `@sentry/nextjs` adds ~30KB to every page [LOW]

**File:** `frontend/package.json:19`

Sentry is included as a dependency. If not actively configured, it still adds bundle weight. Verify it is configured and providing value.

---

## 8. Database Queries

### PERF-21: `HEATMAP` query has no LIMIT clause [MEDIUM]

**File:** `database/queries.py:83-97`

```sql
SELECT c.ticker, c.short_name AS name, c.sector, m.market_cap,
    CASE WHEN m.previous_close > 0 ... END AS change_pct
FROM companies c
JOIN market_data m ON m.ticker = c.ticker
WHERE m.current_price IS NOT NULL AND m.market_cap IS NOT NULL
ORDER BY m.market_cap DESC
```

Returns all ~500 stocks. No LIMIT clause, and the route handler also does not add one.

**Fix:** Add a configurable limit parameter to the heatmap endpoint.

### PERF-22: `ENTITY_FULL_DETAIL` is a 7-table LEFT JOIN [LOW]

**File:** `database/queries.py:145-174`

This query joins `companies`, `market_data`, `valuation_metrics`, `profitability_metrics`, `dividend_data`, `financial_summary`, and `analyst_data`. With ~500 companies and each table having one row per ticker, this is acceptable for single-ticker lookups. The `WHERE c.ticker = ?` clause ensures the query uses the primary key index.

**Impact:** Low -- single-row lookups on indexed columns are fast.

### PERF-23: News search uses LIKE with leading wildcard [MEDIUM]

**File:** `services/news_store.py:277`

```python
where = "(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')"
```

With `pattern = f"%{escaped}%"`, the leading `%` prevents index usage. SQLite must do a full table scan for each search query.

**Impact:** With thousands of articles, search queries will degrade. Currently mitigated by the `LIMIT` clause and relatively small dataset.

**Fix:** For SQLite, consider using FTS5 (Full-Text Search) for the `title` and `body` columns:
```sql
CREATE VIRTUAL TABLE news_fts USING fts5(title, body, content=news_articles);
```

---

## 9. Startup Time

### PERF-24: Template HTML read at module import time [LOW]

**File:** `app.py:549`

```python
_TEMPLATE_RAW = (_HERE / "templates" / "index.html").read_text(encoding="utf-8")
```

This reads the template file synchronously during module import. This is fine -- the file is small and reads once.

### PERF-25: News scraper ticker map loads from SQLite at module import [LOW]

**File:** `services/news_scraper.py:247`

```python
COMPANY_TICKER_MAP: Dict[str, str] = _init_ticker_map()
```

Reads `companies` table from SQLite at module import time. This is a one-time cost (~10ms) and is acceptable.

### PERF-26: yfinance reachability check during startup is non-blocking [OK]

**File:** `app.py:700-717`

The yfinance check runs in a daemon thread, so it does not block startup. Good practice.

### PERF-27: News scheduler starts and immediately fetches on startup [MEDIUM]

**File:** `services/news_scheduler.py:64`

```python
def _run_loop(self) -> None:
    self._fetch_cycle()  # Fetch immediately on start
```

The first `_fetch_cycle()` scrapes all 5 news sources synchronously in a background thread. Each source has a 10-second timeout and 1.5-second inter-request delay. Total worst case: 5 sources * (10s timeout + 1.5s delay + 5 article fetches * (8s + 1.5s)) = ~300 seconds.

**Impact:** While this runs in a daemon thread and does not block the event loop, it consumes a thread pool slot during this period. More importantly, the sequential nature means first news data may not be available for several minutes.

**Fix:** Consider staggering source fetches or parallelizing them.

---

## 10. Concurrency Issues

### PERF-28: Global `_fetch_lock` serializes ALL stock OHLCV requests [CRITICAL]

**File:** `services/stock_ohlcv.py:24`, `services/stock_ohlcv.py:197`

```python
_fetch_lock = threading.Lock()

# In fetch_stock_ohlcv():
with _fetch_lock:
    # ALL stock ticker requests are serialized here
```

A single global `threading.Lock()` is used for all stock OHLCV requests. If 10 users request OHLCV data for 10 different tickers simultaneously (all cache misses), they are processed one at a time. Each yfinance call takes 1-5 seconds, so the 10th user waits 10-50 seconds.

**Impact:** Under moderate concurrent load, response times degrade linearly with concurrency. This is the most significant performance bottleneck in the codebase.

**Fix:** Replace the global lock with a per-ticker lock:
```python
_fetch_locks: Dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()

def _get_ticker_lock(key: str) -> threading.Lock:
    with _locks_lock:
        if key not in _fetch_locks:
            _fetch_locks[key] = threading.Lock()
        return _fetch_locks[key]
```

The same issue exists in `tasi_index.py:24` but is less severe since there is only one TASI index (the lock prevents duplicate concurrent fetches for the same data, which is the intended behavior).

### PERF-29: `NewsStore` per-thread connection caching is correct [OK]

**File:** `services/news_store.py:63-83`

The `NewsStore` uses `threading.local()` for per-thread connection caching, which is correct for SQLite's threading model. Each thread gets its own connection, avoiding cross-thread contention.

### PERF-30: `NewsScheduler._source_errors` protected by lock [OK]

**File:** `services/news_scheduler.py:40-41`

```python
self._source_errors: dict[str, int] = {}
self._source_errors_lock = threading.Lock()
```

The error counters are properly protected by a lock. Since the scheduler runs in a single thread, this is conservative but correct.

### PERF-31: `tasi_index.py` module-level circuit breaker state duplication [LOW]

**File:** `services/tasi_index.py:40-42`, `services/tasi_index.py:97-125`

The module maintains both a `CircuitBreaker` instance and module-level `_consecutive_failures` / `_circuit_open_until` variables that are manually synced. This dual-state pattern is error-prone and adds unnecessary complexity.

**Impact:** Functional but confusing. The `_sync_to_breaker()` calls add overhead on every request.

**Fix:** Remove the module-level state and use only the `CircuitBreaker` instance. Update test fixtures to reset the breaker directly.

---

## 11. Network Calls

### PERF-32: News scraper fetches all 5 sources sequentially [HIGH]

**File:** `services/news_scraper.py:1006-1064` (`fetch_all_news()`), `services/news_scheduler.py:91-106`

```python
for scraper_cls in ALL_SCRAPERS:
    scraper = scraper_cls()
    articles = scraper.fetch_articles()
    all_articles.extend(articles)
    if articles:
        time.sleep(INTER_REQUEST_DELAY)
```

All 5 news sources are scraped sequentially. Each source can take up to 10 seconds (timeout) plus additional time for article body enrichment. The `_enrich_bodies()` method also fetches individual article URLs sequentially with 1.5-second delays.

**Total worst-case time:** 5 * (10s + 5 * (8s + 1.5s)) + 5 * 1.5s = ~300 seconds per cycle.

**Impact:** Fresh news is delayed significantly. While this runs in a background thread, it also means the thread pool slot is occupied for a long time.

**Fix:** Parallelize source fetching using `concurrent.futures.ThreadPoolExecutor`:
```python
from concurrent.futures import ThreadPoolExecutor, as_completed

with ThreadPoolExecutor(max_workers=5) as pool:
    futures = {pool.submit(scraper_cls().fetch_articles): scraper_cls
               for scraper_cls in ALL_SCRAPERS}
    for future in as_completed(futures):
        articles = future.result()
        all_articles.extend(articles)
```

### PERF-33: Market overview correctly parallelizes yfinance calls [OK]

**File:** `api/routes/market_overview.py:217-221`

```python
tasks = [
    asyncio.to_thread(_fetch_instrument_sync, symbol, info)
    for symbol, info in INSTRUMENTS.items()
]
results = await asyncio.gather(*tasks, return_exceptions=True)
```

The market overview endpoint correctly uses `asyncio.gather()` to fetch all 10 instruments concurrently. This is the correct pattern.

### PERF-34: QuotesHub correctly parallelizes provider fetches [OK]

**File:** `services/widgets/quotes_hub.py:46-51`

```python
results = await asyncio.gather(
    fetch_crypto(),
    fetch_metals(),
    fetch_oil(),
    fetch_indices(),
    return_exceptions=True,
)
```

All 4 providers are fetched concurrently. This is the correct pattern.

---

## 12. Additional Findings

### PERF-35: `db_helper.py` opens/closes a new SQLite connection per query [MEDIUM]

**File:** `api/db_helper.py:124-139`

```python
def _sync_fetchall(sql, params=None):
    conn = get_conn()
    try:
        return fetchall(conn, sql, params)
    finally:
        conn.close()
```

Every `afetchall()` / `afetchone()` call opens a new SQLite connection and closes it. For SQLite, connection pooling is less critical than for PostgreSQL, but the overhead of opening/closing connections (file locks, PRAGMA execution) adds latency.

**Impact:** ~0.5-1ms overhead per query. With the `market_summary` endpoint making 3 sequential queries, this adds ~2-3ms.

**Fix:** Consider a per-thread connection pool similar to `NewsStore._connect()`, or use Python's `sqlite3` with `check_same_thread=False` and a thread-local wrapper.

### PERF-36: `_deduplicate()` in news scraper has O(n^2) complexity [LOW]

**File:** `services/news_scraper.py:967-1000`

```python
for article in articles:
    for existing in unique:
        seq_similarity = SequenceMatcher(None, article["title"], existing["title"]).ratio()
```

The deduplication checks each new article against all existing unique articles using `SequenceMatcher`, which is O(n*m) per pair. With ~50 articles total, this is fast, but would degrade with larger datasets.

**Impact:** Negligible with current volumes (~50 articles per cycle).

### PERF-37: `store_articles()` checks `SELECT changes()` after every INSERT [LOW]

**File:** `services/news_store.py:144`

```python
if conn.execute("SELECT changes()").fetchone()[0] > 0:
    inserted += 1
```

An extra query per article to count insertions. With `INSERT OR IGNORE`, checking `changes()` is the standard SQLite pattern and adds minimal overhead.

---

## Summary Table

| ID | Category | Impact | Finding |
|---|---|---|---|
| PERF-01 | Blocking I/O | HIGH | Auth routes call sync DB without `to_thread()` |
| PERF-02 | Blocking I/O | HIGH | yfinance fetch called sync from async handlers |
| PERF-05 | Pagination | MEDIUM | Heatmap returns all ~500 stocks unbounded |
| PERF-07 | Pagination | MEDIUM | Entity list allows `limit=500` |
| PERF-08 | Cache | MEDIUM | Cache stampede risk on TTL expiry |
| PERF-12 | Memory | CRITICAL | `DemoAgentMemory(10000)` grows unbounded |
| PERF-14 | Concurrency | MEDIUM | QuotesHub event set/clear race condition |
| PERF-16 | Payload | MEDIUM | `SELECT *` returns full article body in list queries |
| PERF-17 | Payload | MEDIUM | Market overview returns 90-day data for all instruments |
| PERF-19 | Frontend | HIGH | Heavy deps (plotly 3.5MB, swagger-ui 2MB) not lazy-loaded |
| PERF-21 | Database | MEDIUM | Heatmap query has no LIMIT clause |
| PERF-23 | Database | MEDIUM | News search uses LIKE with leading wildcard |
| PERF-27 | Startup | MEDIUM | Sequential news fetch on startup can take minutes |
| PERF-28 | Concurrency | CRITICAL | Global `_fetch_lock` serializes ALL stock requests |
| PERF-32 | Network | HIGH | News scraper fetches 5 sources sequentially |
| PERF-35 | Database | MEDIUM | New SQLite connection opened per query |

---

## Priority Fix Order

### Immediate (before next production deploy)

1. **PERF-28**: Replace global `_fetch_lock` with per-ticker locks in `stock_ohlcv.py`
2. **PERF-02**: Wrap `fetch_tasi_index()` and `fetch_stock_ohlcv()` in `asyncio.to_thread()`
3. **PERF-01**: Wrap `AuthService` calls in `asyncio.to_thread()`
4. **PERF-12**: Reduce `DemoAgentMemory` to 1000 items, plan persistent backend

### Short-term (next sprint)

5. **PERF-32**: Parallelize news scraper with `ThreadPoolExecutor`
6. **PERF-19**: Lazy-load plotly.js, swagger-ui-react, xlsx, jspdf via `next/dynamic`
7. **PERF-16**: Replace `SELECT *` with explicit column lists in `news_store.py`
8. **PERF-08**: Add stale-while-revalidate to `cache_response` decorator

### Medium-term (technical debt)

9. **PERF-35**: Implement connection pooling for SQLite in `db_helper.py`
10. **PERF-23**: Add FTS5 for news article search
11. **PERF-14**: Fix QuotesHub event race condition
12. **PERF-05/21**: Add pagination to heatmap endpoint
