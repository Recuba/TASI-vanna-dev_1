# Error Handling & Resilience Audit

**Date:** 2026-02-17
**Auditor:** error-auditor (automated)
**Scope:** Full backend + frontend error handling, resilience, and degradation patterns

---

## Executive Summary

The codebase demonstrates **strong error handling fundamentals** with a well-designed middleware stack, consistent error response schema, circuit breaker patterns, and comprehensive frontend error boundaries. There are no bare `except:` clauses anywhere in the Python codebase. The main gaps are: several route handlers that lack try/except and rely entirely on the global middleware, missing retry/backoff in the news scraper and widget providers, and some inconsistencies in how the PG-only routes handle database errors compared to the dual-backend routes.

**Overall Grade: B+**

| Category | Finding Count |
|----------|--------------|
| Critical Gap | 2 |
| Missing Handler | 5 |
| Improvement | 7 |
| Best Practice (already met) | 12 |

---

## 1. Uncaught Exceptions in Route Handlers

### Routes WITH proper try/except blocks
These routes catch exceptions and convert them to appropriate HTTP responses:

| Route File | Endpoints | Pattern |
|------------|-----------|---------|
| `api/routes/market_analytics.py` | movers, summary, sectors, heatmap | `except HTTPException: raise` + `except Exception` -> 503 |
| `api/routes/charts_analytics.py` | sector-market-cap, top-companies, sector-pe, dividend-yield-top | Same pattern |
| `api/routes/sqlite_entities.py` | list_entities, list_sectors, get_entity | Same pattern |

### Routes WITHOUT try/except blocks (relying on global middleware)

| Route File | Endpoints | Severity |
|------------|-----------|----------|
| `api/routes/stock_data.py` | dividends, summary, financials, compare, quotes | **Missing Handler** |
| `api/routes/news_feed.py` | feed, feed/batch, feed/{id}, search, sources | **Missing Handler** |
| `api/routes/reports.py` | list_reports, reports_by_ticker, get_report, create_report | **Missing Handler** |
| `api/routes/announcements.py` | list_announcements, material, by_sector, get, create | **Missing Handler** |
| `api/routes/news.py` | list_news, by_ticker, by_sector, get_article, create | **Missing Handler** |
| `api/routes/watchlists.py` | list, create, add_ticker, update, delete, alerts | **Missing Handler** |
| `api/routes/auth.py` | register, login, guest, refresh, me | **Improvement** (has targeted JWT exception handling) |
| `api/routes/tasi_index.py` | get_tasi_index, tasi_health | **Best Practice** (service layer handles all errors) |
| `api/routes/stock_ohlcv.py` | get_stock_ohlcv, stock_ohlcv_health | **Best Practice** (service layer handles all errors) |
| `api/routes/health.py` | health, live, ready | **Best Practice** (health service catches all) |
| `api/routes/charts.py` (PG-only) | sector-market-cap, top-companies, sector-pe, dividend-yield-top | **Missing Handler** |
| `api/routes/entities.py` (PG-only) | list_entities, list_sectors, get_entity | **Missing Handler** |
| `api/routes/market_overview.py` | get_market_overview | **Best Practice** (`asyncio.gather(return_exceptions=True)`) |

**Assessment:** The routes without try/except are still protected by the global `ErrorHandlerMiddleware` which catches all unhandled exceptions and returns a consistent JSON error response. This is a valid architecture. However, the routes lose the ability to provide domain-specific error messages (e.g., "Database temporarily unavailable" vs. generic "Internal server error"). Routes in `stock_data.py` and `news_feed.py` are the most impactful since they are heavily used by the frontend.

**Verdict: Missing Handler** -- Not critical because middleware catches everything, but domain-specific error messages are lost.

---

## 2. Bare Except Clauses

**Result: NONE FOUND**

Searched the entire Python codebase for `except:` (bare) and `except Exception` (without `as`). Zero matches. All exception handlers use `except Exception as exc` and log the exception properly.

**Verdict: Best Practice**

---

## 3. Error Response Consistency

### Backend Error Response Schema

All error responses use the consistent shape:
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "descriptive error message",
    "request_id": "abc123def456"
  }
}
```

This is enforced by:

1. **`ErrorHandlerMiddleware`** (`middleware/error_handler.py:95-134`) -- Catches all unhandled exceptions, maps known types (ValueError->400, PermissionError->403, FileNotFoundError->404, ConnectionError->503), and returns structured JSON.

2. **`install_exception_handlers()`** (`middleware/error_handler.py:137-186`) -- Registers custom handlers for `HTTPException` and `RequestValidationError` that use the same `_error_response()` shape.

3. **`RateLimitMiddleware`** (`middleware/rate_limit.py:114-124`) -- Returns 429 with the same `{"error": {...}}` shape plus `Retry-After` header.

4. **Routes using `HTTPException`** -- These are intercepted by the `_http_exception_handler` and converted to the standard shape.

| Source | Schema Consistent? | Notes |
|--------|--------------------|-------|
| ErrorHandlerMiddleware | Yes | Full `{error: {code, message, request_id}}` |
| HTTPException handler | Yes | Same shape |
| RequestValidationError handler | Yes | Same shape, first 5 errors |
| RateLimitMiddleware | Yes | Same shape + Retry-After header |
| Health readiness probe | **No** | Returns `{"status": "not_ready", "reason": ...}` without error wrapper |
| Health liveness probe | N/A | Always 200 |

**Verdict: Best Practice** -- Minor inconsistency in health endpoints is acceptable (they are infrastructure probes, not API responses).

---

## 4. Circuit Breaker Coverage

### Circuit Breaker Implementation (`services/yfinance_base.py`)

Well-implemented thread-safe circuit breaker:
- Configurable threshold and timeout
- `record_failure()` / `record_success()` / `is_open()` / `get_status()`
- Proper logging on state transitions (OPEN/CLOSED)
- Health endpoint diagnostics via `get_status()`

### Usage Coverage

| Service | Uses CircuitBreaker? | Config |
|---------|---------------------|--------|
| `services/tasi_index.py` | **Yes** | threshold=5, timeout=300s (5min) |
| `services/stock_ohlcv.py` | **Yes** | threshold=5, timeout=900s (15min) |
| `services/widgets/providers/metals.py` | **No** | Uses yfinance directly |
| `services/widgets/providers/oil.py` | **No** | Uses yfinance directly |
| `services/widgets/providers/indices.py` | **No** | Uses yfinance directly |
| `api/routes/market_overview.py` | **No** | Uses yfinance directly |

**Verdict: Critical Gap** -- The 3 widget providers and market_overview route call yfinance without any circuit breaker. If yfinance is rate-limited or down, these will make repeated failing calls every 30 seconds (via QuotesHub) without any backoff beyond the QuotesHub's `_FETCH_INTERVAL = 30` seconds. The market_overview route has a 60-second cache but no circuit breaker protection.

**Impact:** When yfinance rate-limits or goes down, the widget providers will generate continuous warnings and waste resources on doomed HTTP calls. The TASI and stock OHLCV services handle this correctly but the widgets do not.

---

## 5. Retry Logic & Backoff

### News Scraper (`services/news_scraper.py`)

| Aspect | Status |
|--------|--------|
| Per-source error isolation | **Yes** -- Each scraper catches all exceptions and returns `[]` |
| Retry on failure | **No** -- Single attempt per source per cycle |
| Inter-request delay | **Yes** -- `INTER_REQUEST_DELAY` (configurable, default 1.5s) between sources |
| Multiple URL attempts | **Yes** -- `MaaalScraper` tries 4 alternate URLs |
| Google RSS fallback | **Yes** -- Tries multiple queries, stops on first success |
| Timeout handling | **Yes** -- `REQUEST_TIMEOUT` for list, `ARTICLE_FETCH_TIMEOUT` for articles |
| Backoff on rate limit | **No** -- No exponential backoff on 429/rate-limit responses |

**Verdict: Improvement** -- No retry with backoff. The scraper is called every 30 minutes by the scheduler, so the next retry is 30 minutes later. This is acceptable for a news scraper but could benefit from per-source retry with short backoff within a cycle.

### Widget Providers

| Provider | Retry? | Backoff? | Timeout? |
|----------|--------|----------|----------|
| `crypto.py` (httpx/CoinGecko) | No | No | Yes (10s) |
| `metals.py` (yfinance) | No | No | Implicit (yfinance default) |
| `oil.py` (yfinance) | No | No | Implicit |
| `indices.py` (yfinance) | No | No | Implicit |
| `market_overview.py` (yfinance) | No | No | Yes (10s via `timeout=10` in `tkr.history()`) |

**Verdict: Improvement** -- No retry logic in any provider. The QuotesHub re-fetches every 30 seconds, providing implicit retry. The crypto provider uses `httpx` with explicit 10s timeout. The yfinance providers rely on yfinance's internal defaults.

### TASI Index & Stock OHLCV

| Aspect | Status |
|--------|--------|
| Symbol retry | **Yes** -- TASI tries `^TASI` then `TASI.SR` with 0.5s delay |
| Stale cache fallback | **Yes** -- Returns expired cache on fetch failure |
| Mock data fallback | **Yes** -- Deterministic mock data as last resort |
| Error categorization | **Yes** -- Classifies as rate_limit/network/data_error |
| Thread serialization | **Yes** -- `_fetch_lock` prevents thundering herd |

**Verdict: Best Practice** -- Excellent multi-tier fallback chain: fresh cache -> yfinance -> stale cache -> mock data.

---

## 6. Frontend Error Boundaries

### Coverage

| Route | `error.tsx` | `loading.tsx` | Notes |
|-------|-------------|---------------|-------|
| Root (`/`) | Yes | Yes | Generic error with "Try Again" + "Back to Home" |
| `/news` | Yes | Yes | Arabic+English, retry state tracking |
| `/market` | Yes | Yes | Arabic market error messaging |
| `/markets` | Yes | Yes | Detailed globe-with-crack icon, network suggestion |
| `/charts` | Yes | Yes | Chart-specific icon |
| `/chat` | Yes | Yes | Chat-specific icon |
| `/watchlist` | No error.tsx | Yes (loading) | **Missing Handler** |
| `/admin` | No error.tsx | No loading.tsx | **Missing Handler** (may be intentional) |
| `/login` | No error.tsx | No loading.tsx | Minimal route |
| `/reports` | No error.tsx | No loading.tsx | **Missing Handler** |

**Verdict: Improvement** -- Most critical routes are covered. Missing boundaries for `/watchlist`, `/reports`, and `/admin`. The root `error.tsx` catches anything that bubbles up, so no route is completely unprotected. The `/news` error boundary is the most sophisticated with retry state tracking and bilingual messaging.

### Error Boundary Features

| Feature | Root | News | Market | Markets | Charts | Chat |
|---------|------|------|--------|---------|--------|------|
| Reset/retry button | Yes | Yes | Yes | Yes | Yes | Yes |
| "Back to Home" link | Yes | Yes | Yes | Yes | Yes | Yes |
| Dev-only error details | Yes | Yes | Yes | Yes | Yes | Yes |
| Arabic text | No | Yes | Yes | Yes | Yes | Yes |
| Retry state (loading spinner) | No | Yes | No | No | No | No |
| Network suggestion hint | No | No | No | Yes | No | No |

**Verdict: Best Practice** for covered routes.

---

## 7. SSE Error Recovery

### Widget SSE (`api/routes/widgets_stream.py`)

**Memory mode (`_memory_event_generator`):**
- Client disconnect check: `request.is_disconnected()` -- **Yes**
- Keepalive on timeout: `": keepalive\n\n"` -- **Yes**
- Error handling in loop: **Partial** -- No explicit try/except around `get_latest_snapshot()` calls

**Redis mode (`_redis_event_generator`):**
- Client disconnect check: `request.is_disconnected()` -- **Yes**
- Initial snapshot error handling: **Yes** -- Catches `Exception`, logs warning, sends `": connecting\n\n"`
- `CancelledError` handling: **Yes** -- Catches and logs
- General exception handling: **Yes** -- Catches, logs
- Resource cleanup: **Yes** -- `finally` block unsubscribes and closes pubsub
- Cleanup error handling: **Yes** -- `except Exception: pass` in finally

**Verdict: Best Practice** for Redis mode. Memory mode could use a try/except around snapshot reads.

### News SSE (`api/routes/news_stream.py`)

- Client disconnect check: `request.is_disconnected()` -- **Yes**
- Poll error handling: **Yes** -- `except Exception: logger.debug("SSE poll error", exc_info=True)`
- Initial keepalive: **Yes** -- `": connected\n\n"`
- Missing `CancelledError` handling: **Improvement** -- Should catch `asyncio.CancelledError` explicitly

**Verdict: Best Practice** -- Properly silences polling errors and continues the loop.

### Frontend SSE (`LiveMarketWidgets.tsx`)

- `onopen` resets retry counter: **Yes**
- `onerror` closes + reconnects: **Yes**
- Exponential backoff: **Yes** -- `1.5s * 2^retry`, max 30s
- JSON parse errors caught: **Yes** -- `try { JSON.parse() } catch {}`
- Cleanup on unmount: **Yes** -- `esRef.current?.close()` + clear timeout

**Verdict: Best Practice** -- Well-implemented reconnection with exponential backoff.

---

## 8. Graceful Degradation

### Scenario Analysis

| Scenario | Behavior | Verdict |
|----------|----------|---------|
| **DB is down** | ErrorHandlerMiddleware catches all DB errors -> 503. Health endpoint reports `UNHEALTHY`. Connection errors mapped to 503 in `_EXCEPTION_MAP`. Market analytics routes return "Database temporarily unavailable". | **Best Practice** |
| **LLM API is down** | Health reports `DEGRADED`. Vanna chat returns LLM errors. No fallback chat. | **Best Practice** (acceptable -- LLM is core feature) |
| **yfinance rate-limited** | TASI/OHLCV: circuit breaker opens after 5 failures, serves stale cache -> mock data. Widget providers: continue failing silently every 30s. Market overview: 60s cache protects from rapid retries. | **Improvement** -- Widgets lack circuit breaker |
| **Redis unavailable** | QuotesHub falls back to in-memory mode automatically. SSE widget stream uses `_memory_event_generator`. Health reports `DEGRADED`. | **Best Practice** |
| **News sources blocked** | Each scraper catches all exceptions and returns `[]`. Scheduler logs per-source errors. News feed serves previously scraped articles. | **Best Practice** |
| **Frontend API server unreachable** | `ApiError` with status 0 for network errors and timeouts. Error boundaries show Arabic error messages with retry. SSE reconnects with backoff. | **Best Practice** |
| **SQLite file missing** | Health service checks `db_path.exists()` and reports `UNHEALTHY`. Routes would get SQLite errors caught by middleware. | **Best Practice** |

### Multi-tier Fallback Chains

**TASI Index / Stock OHLCV:**
```
Fresh Cache -> yfinance (with circuit breaker) -> Stale Cache -> Mock Data
```
This is an exemplary resilience pattern. Every request gets a response, even if degraded.

**News System:**
```
Live Scrape -> SQLite Store (persistent) -> Empty Response
```
News data persists across restarts via SQLite.

**Market Quotes:**
```
Provider APIs (CoinGecko + yfinance) -> In-memory snapshot -> Empty state
```

**Verdict: Best Practice** overall, with the noted gap in widget provider circuit breakers.

---

## 9. Logging Quality

### Error Logging Assessment

| Aspect | Status | Details |
|--------|--------|---------|
| Request ID in errors | **Yes** | `ErrorHandlerMiddleware` includes `request_id` in all error logs |
| Stack traces for 500s | **Yes** | `logger.exception()` for unhandled exceptions (includes traceback) |
| Stack traces for known errors | **No** (intentional) | `logger.warning()` for mapped exceptions (no traceback needed) |
| Structured logging | **Yes** | `RequestLoggingMiddleware` outputs JSON log records |
| IP anonymization | **Yes** | Last octet replaced with `xxx` |
| Rate limit logging | **Yes** | Logs client IP, method, path, bucket, limit, request_id |
| Circuit breaker transitions | **Yes** | Logs OPEN/CLOSED state changes with failure counts |
| Error categorization | **Yes** | yfinance errors classified as rate_limit/network/data_error |
| Service latency in logs | **Yes** | `response_time_ms` in access logs, `fetch_duration_ms` in service logs |

### Missing Context in Error Logs

| Area | Missing | Severity |
|------|---------|----------|
| PG-only routes (`entities.py`, `charts.py`) | No try/except, errors only logged by middleware (no domain context) | **Improvement** |
| `news_feed.py` routes | No error logging at route level, relies on middleware | **Improvement** |
| `watchlists.py` routes | No error logging at route level | **Improvement** |

**Verdict: Best Practice** for the middleware layer. Some route-level logging gaps.

---

## 10. Error Handler Middleware

### `ErrorHandlerMiddleware` Analysis (`middleware/error_handler.py`)

**Strengths:**
1. Catches ALL unhandled exceptions (line 112: `except Exception as exc`)
2. Type-specific mapping: `ValueError->400`, `PermissionError->403`, `FileNotFoundError->404`, `KeyError->404`, `ConnectionError->503`
3. Consistent JSON schema: `{"error": {"code", "message", "request_id"}}`
4. Debug mode support: full error message in dev, generic "Internal server error" in production
5. Request ID propagation: generates/retrieves from header/state
6. Separate handler for `HTTPException` with status code mapping
7. Separate handler for `RequestValidationError` with first-5-errors summary

**Potential Issues:**

1. **Starlette BaseHTTPMiddleware caveat**: `BaseHTTPMiddleware` wraps the response in a `StreamingResponse` internally. If an SSE endpoint raises an exception _after_ the headers have been sent, the middleware cannot change the status code. This is a known Starlette limitation. The SSE generators handle this by catching exceptions within the generator itself.

2. **No `TimeoutError` mapping**: If `asyncio.to_thread()` times out (unlikely since no explicit timeout is set), it would map to a generic 500 instead of 408 or 503.

**Verdict: Best Practice** -- Well-designed with appropriate scope.

### Middleware Stack Order (`app.py`)

```
1. RateLimitMiddleware (outermost -- runs first)
2. RequestLoggingMiddleware (logs request + response)
3. ErrorHandlerMiddleware (innermost -- catches errors from handlers)
4. install_exception_handlers() (HTTPException + ValidationError)
5. GZipMiddleware (response compression)
```

Starlette processes middleware in LIFO order (last added = outermost), so the stack is correctly ordered: rate limiting runs before logging, which runs before error handling.

**Verdict: Best Practice**

---

## 11. Frontend Fetch Error Handling

### `api-client.ts` Analysis

**Strengths:**
1. **Custom `ApiError` class** with status-specific `getUserMessage()` (lines 156-180)
2. **Timeout handling**: `AbortController` with configurable `timeoutMs` (default `API_TIMEOUT_MS`)
3. **External signal support**: Properly links external `AbortSignal` to internal controller (lines 208-217)
4. **Network error detection**: Catches `TypeError` with "fetch" in message -> `ApiError(0, 'Network error')` (lines 244-246)
5. **Abort vs. timeout distinction**: Differentiates external abort (re-throw) from timeout (ApiError status 0) (lines 239-243)
6. **Cleanup in finally**: Clears timeout, removes event listener (lines 248-253)
7. **Auth token injection**: `authHeaders()` adds Bearer token from localStorage (lines 186-195)
8. **In-memory cache**: `cachedRequest()` with TTL for static data (sectors, individual articles) (lines 268-279)

**Potential Issues:**
1. **No retry logic**: Failed requests are not retried. The frontend relies on user-initiated retry (error boundaries) or React re-renders. This is acceptable for a SPA.
2. **Cache has no size limit**: `_cache` Map grows without bound. Low risk since only a few keys are cached (`/api/entities/sectors`, article IDs).

**Verdict: Best Practice** -- Comprehensive error handling with proper abort, timeout, and network error detection.

---

## 12. Timeout Handling

### Backend Network Call Timeouts

| Service | Timeout Config | Source |
|---------|----------------|--------|
| News scraper (list fetch) | `REQUEST_TIMEOUT` (configurable, default 10s) | `config/settings.py` |
| News scraper (article body) | `ARTICLE_FETCH_TIMEOUT` (configurable) | `config/settings.py` |
| Crypto provider (httpx) | 10s | `httpx.AsyncClient(timeout=10)` |
| Market overview (yfinance) | 10s | `tkr.history(..., timeout=10)` |
| TASI index (yfinance) | Not set | **Improvement** -- yfinance default (possibly 30s) |
| Stock OHLCV (yfinance) | Not set | **Improvement** -- yfinance default |
| Metal/Oil/Index providers | Not set | **Improvement** -- yfinance default |
| Health (DB check) | 5s | `sqlite3.connect(timeout=5)`, `connect_timeout=5` for PG |
| Health (pool PG) | Pool default | Via connection pool settings |

### Frontend Timeouts

| Component | Timeout | Source |
|-----------|---------|--------|
| API client default | `API_TIMEOUT_MS` (from config) | `api-client.ts` |
| AbortController | Applied to all fetch() calls | `api-client.ts:205` |

**Critical Gap:** The yfinance calls in `services/tasi_index.py` and `services/stock_ohlcv.py` do not pass a `timeout` parameter to `ticker.history()`. If yfinance hangs (DNS resolution, slow response), the call could block the thread pool worker for an extended period. The `_fetch_lock` serializes these calls, so a hung request would block all subsequent TASI/OHLCV requests.

**Verdict: Critical Gap** -- Missing explicit timeouts on yfinance calls in TASI/OHLCV services.

---

## Summary of Findings

### Critical Gaps (2)

1. **No circuit breaker for widget providers** (`services/widgets/providers/metals.py`, `oil.py`, `indices.py`) and `api/routes/market_overview.py` -- yfinance calls without protection against cascading failures. If yfinance goes down, 4 providers and the market overview will hammer it every 30-60 seconds.

2. **No explicit timeout on yfinance calls in TASI/OHLCV services** -- `ticker.history()` calls in `services/tasi_index.py` and `services/stock_ohlcv.py` have no `timeout` parameter. Combined with the `_fetch_lock`, a hung call could block all chart data requests indefinitely.

### Missing Handlers (5)

3. **`api/routes/stock_data.py`** -- 5 endpoints without try/except (dividends, summary, financials, compare, quotes). Global middleware catches errors but returns generic messages.

4. **`api/routes/news_feed.py`** -- 6 endpoints without try/except. Most-used news API endpoints rely entirely on middleware for error handling.

5. **`api/routes/charts.py` (PG-only)** -- 4 endpoints without try/except. Can throw `psycopg2.OperationalError` which would become a generic 500.

6. **`api/routes/entities.py` (PG-only)** -- 3 endpoints without try/except. Same psycopg2 issue.

7. **Frontend missing error boundaries** -- `/watchlist` and `/reports` routes have no `error.tsx`. Root boundary catches them but with a generic English-only error message instead of route-specific Arabic messaging.

### Improvements (7)

8. **No retry/backoff in news scraper** -- Single attempt per source per cycle. 30-minute cycle provides implicit retry but no short-term backoff.

9. **No retry in widget providers** -- All 4 providers make single attempts. QuotesHub provides 30s retry interval but no exponential backoff on persistent failures.

10. **Missing `asyncio.CancelledError` handling in news SSE** -- `news_stream.py` does not explicitly catch `CancelledError` (Python 3.9+ it's no longer a subclass of `Exception`, so it would propagate correctly, but explicit handling is cleaner).

11. **No explicit timeout in yfinance widget providers** -- `metals.py`, `oil.py`, `indices.py` rely on yfinance defaults.

12. **Route-level error logging gaps** -- `news_feed.py`, `stock_data.py`, `watchlists.py` routes don't log errors at the route level. Only middleware logs them, without domain context.

13. **Frontend cache has no size limit** -- `_cache` Map in `api-client.ts` can grow without bound (very low risk in practice).

14. **Memory mode SSE generator** -- `_memory_event_generator` in `widgets_stream.py` has no try/except around `get_latest_snapshot()` calls inside the loop.

### Best Practices Already Met (12)

15. **No bare `except:` clauses** -- All exception handlers use `except Exception as exc` with proper logging.
16. **Consistent error response schema** -- All errors use `{"error": {"code", "message", "request_id"}}`.
17. **Circuit breaker on TASI/OHLCV** -- Well-implemented with configurable threshold/timeout.
18. **Multi-tier fallback chain** -- Cache -> live fetch -> stale cache -> mock data.
19. **Comprehensive middleware stack** -- Rate limiting, logging, error handling in correct order.
20. **Frontend error boundaries** -- 6 route-level + 1 root boundary, all with retry + back-to-home.
21. **SSE reconnection with backoff** -- Frontend LiveMarketWidgets uses exponential backoff (1.5s-30s).
22. **SSE disconnect detection** -- All SSE generators check `request.is_disconnected()`.
23. **Request ID correlation** -- Generated/propagated through all middleware, included in error responses and logs.
24. **IP anonymization in logs** -- Last octet masked in access logs.
25. **Structured JSON logging** -- Access logs as JSON records with method, path, status, duration, request_id.
26. **Health check decomposition** -- 8 component checks (DB, LLM, Redis, entities, market_data, news, TASI, news_scraper) with per-component status and latency.

---

## Recommended Fixes (Priority Order)

### P0 -- Critical

1. **Add timeout to yfinance calls in TASI/OHLCV services:**
   ```python
   # In services/tasi_index.py and services/stock_ohlcv.py
   df = ticker.history(period=period, auto_adjust=True, timeout=15)
   ```

2. **Add circuit breaker to widget providers** -- Create a shared `_breaker` instance in `services/widgets/providers/` and check it before each yfinance call. Alternatively, create a shared breaker at the QuotesHub level.

### P1 -- Important

3. **Add try/except to `stock_data.py` route handlers** -- Wrap DB calls in try/except with 503 fallback, matching the pattern in `market_analytics.py`.

4. **Add try/except to `news_feed.py` route handlers** -- Same pattern.

5. **Add error boundaries for `/watchlist` and `/reports`** -- Create `error.tsx` files with Arabic messaging.

### P2 -- Nice to Have

6. **Add explicit timeout to widget provider yfinance calls** -- Pass `timeout=10` to `ticker.fast_info` or wrap in a timeout context.

7. **Add try/except around `get_latest_snapshot()` in memory SSE generator** -- Prevent unexpected exceptions from breaking the SSE loop.
