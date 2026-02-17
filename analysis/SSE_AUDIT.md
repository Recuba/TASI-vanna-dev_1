# SSE & Real-time Systems Audit

**Auditor:** sse-auditor
**Date:** 2026-02-17
**Scope:** All SSE endpoints, QuotesHub, providers, frontend EventSource consumers, Vanna chat SSE

---

## Executive Summary

The SSE subsystem is well-structured with proper disconnect detection, error isolation, and graceful degradation (Redis -> in-memory). However, there are several findings ranging from race conditions in the asyncio.Event signaling to missing rate limits on long-lived SSE connections, absent test coverage, and unbounded connection scaling. Six findings are rated HIGH, five MEDIUM, and five LOW.

**Overall Rating: GOOD with targeted improvements needed**

---

## 1. SSE Endpoints

### 1.1 Widget Quotes Stream (`api/routes/widgets_stream.py`)

**Strengths:**
- Correct `text/event-stream` media type (line 48, 54)
- Proper `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive` headers (lines 59-63)
- `request.is_disconnected()` check in both memory (line 83) and Redis (line 120) generator loops
- Redis Pub/Sub path properly unsubscribes and closes in `finally` block (lines 137-142)
- Fast first paint: sends cached snapshot immediately on connect (lines 73-78, 104-112)
- Keepalive comments sent on timeout to prevent proxy disconnects (line 92)

**Findings:**

| ID | Severity | Finding |
|----|----------|---------|
| SSE-01 | **HIGH** | **Race condition in asyncio.Event set/clear** (`quotes_hub.py:100-101`). The hub calls `_snapshot_event.set()` then immediately `_snapshot_event.clear()`. If a coroutine is waiting on `event.wait()` and hasn't woken up by the time `clear()` runs, it will miss the notification entirely. This is a classic race with `asyncio.Event`. The correct pattern is to create a new Event each cycle or use `asyncio.Condition`. |
| SSE-02 | **MEDIUM** | **Memory mode holds `last_sent` string in each generator** (line 70). With large snapshots (~7 quotes x ~200 bytes each = ~1.4KB), this is fine per-connection. But `last_sent` comparison is a full string equality check on every cycle. Consider hashing or using a monotonic version counter for efficiency at scale. |
| SSE-03 | **LOW** | **Redis path blocks event loop with `asyncio.to_thread`** for each `get_message()` call (line 124). While `asyncio.to_thread` is correct for sync Redis, each SSE connection spawns a thread per polling cycle. With 100 connections, this creates significant thread pool pressure. Consider `aioredis` (async Redis client) for the Pub/Sub listener. |

### 1.2 News Stream (`api/routes/news_stream.py`)

**Strengths:**
- Correct `text/event-stream` media type (line 88)
- `request.is_disconnected()` check in generator loop (line 46)
- Exception handling around the polling query (lines 81-82)
- Proper cleanup headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no` (lines 89-90)
- Source filtering via query parameter (line 29)

**Findings:**

| ID | Severity | Finding |
|----|----------|---------|
| SSE-04 | **MEDIUM** | **Missing `Connection: keep-alive` header** (compare lines 89-90 with widgets_stream.py lines 59-63). The widgets endpoint includes `Connection: keep-alive` but the news stream does not. Some reverse proxies may close the connection prematurely without this header. |
| SSE-05 | **MEDIUM** | **No keepalive comments between 30-second polls** (line 84: `await asyncio.sleep(30)`). If the initial keepalive is sent (line 43) but no new articles arrive, 30 seconds of silence could trigger proxy timeouts. The widgets endpoint sends `: keepalive\n\n` every 5 seconds, but news stream has no equivalent. |
| SSE-06 | **LOW** | **`last_seen_id` based on article position, not timestamp** (lines 56-72). If articles are deleted or reordered between polls, the diff logic could miss articles or send duplicates. This is acceptable for the current use case (SQLite append-only store) but would break with a mutable backing store. |
| SSE-07 | **LOW** | **No named event type** (line 80: `yield f"data: {payload}\n\n"`). The widgets stream uses `event: snapshot` but the news stream sends unnamed `data:` events. This means the frontend must use `es.onmessage` instead of `es.addEventListener('newArticles', ...)`, reducing extensibility. |

---

## 2. QuotesHub (`services/widgets/quotes_hub.py`)

### 2.1 Lifecycle Management

**Strengths:**
- Started as `asyncio.create_task()` in lifespan startup (`app.py:691`)
- Properly cancelled on shutdown with `task.cancel()` + `await task` + `CancelledError` handling (`app.py:722-728`, `quotes_hub.py:121-123`)
- Mode logging on startup (line 84)

**Findings:**

| ID | Severity | Finding |
|----|----------|---------|
| SSE-08 | **HIGH** | **Module-level `asyncio.Event` created at import time** (line 26: `_snapshot_event: asyncio.Event = asyncio.Event()`). If the module is imported before the event loop starts (common in testing or multi-worker setups like gunicorn with `--preload`), the Event is bound to the wrong loop or no loop at all. This can cause `RuntimeError: Event object created in a different loop`. The Event should be created lazily inside the running coroutine or via a factory function. |
| SSE-09 | **HIGH** | **set()/clear() race condition** (lines 100-101). As noted in SSE-01, calling `_snapshot_event.set()` followed by `_snapshot_event.clear()` in immediate succession means waiters may never wake up. The window between set and clear is essentially zero in single-threaded asyncio. The correct pattern: `_snapshot_event.set()` only, and have consumers call `event.clear()` after they read the data. Or use a `Condition` with `notify_all()`. |

### 2.2 Provider Error Isolation

**Strengths:**
- `asyncio.gather(..., return_exceptions=True)` ensures one failing provider does not crash others (line 51)
- Failed results are logged and skipped (lines 56-58)
- Individual provider exceptions are caught and return empty lists

**No findings.** This is well-implemented.

### 2.3 Data Freshness

**Findings:**

| ID | Severity | Finding |
|----|----------|---------|
| SSE-10 | **MEDIUM** | **No stale data detection or staleness indicator**. If all providers fail for multiple cycles, `_latest_snapshot` retains the last successful fetch indefinitely. Clients receive stale data with no indication. Consider adding a `fetched_at` timestamp to the snapshot and having the frontend display a staleness warning if data is older than 2x the fetch interval (60 seconds). |

### 2.4 Concurrent Access

**Findings:**

| ID | Severity | Finding |
|----|----------|---------|
| SSE-11 | **LOW** | **Global mutable state (`_latest_snapshot`) accessed from multiple coroutines** (line 99). In CPython asyncio (single-threaded event loop), this is safe because there's no true concurrency within the loop. However, if the application were ever moved to a multi-threaded or multi-process model, this would need a lock. Current architecture is fine. |

### 2.5 Redis Pub/Sub Fallback

**Strengths:**
- Clean fallback: `if redis_client else "in-memory"` (line 83)
- Redis setex with TTL ensures stale data expires (line 106, TTL=120s)
- Only publishes on change to reduce Pub/Sub traffic (lines 110-113)
- In-memory mode works identically from the SSE endpoint perspective

**No findings.** Well-designed dual-mode operation.

---

## 3. Provider Reliability

### 3.1 Crypto Provider (`providers/crypto.py`)

| Aspect | Status | Detail |
|--------|--------|--------|
| Timeout | OK | `httpx.AsyncClient(timeout=10)` (line 29) |
| Error handling | OK | Try/except returns `[]` (lines 62-64) |
| Data validation | OK | Null checks on `coin_data` and `price` (lines 39-44) |
| Rate limiting | WARN | CoinGecko free tier allows 10-30 req/min. At 30s fetch interval, this is 2 req/min -- well within limits |

### 3.2 Metals Provider (`providers/metals.py`)

| Aspect | Status | Detail |
|--------|--------|--------|
| Timeout | WARN | No explicit yfinance timeout. Uses `ticker.fast_info` which has internal defaults but can hang |
| Error handling | OK | Per-ticker try/except (line 56), outer exception returns `[]` (lines 67-68) |
| Data validation | OK | Null check on `price` (lines 34-35) |
| Rate limiting | **RISK** | yfinance has aggressive rate limiting. 2 tickers every 30s = 4 req/min, likely fine but no backoff |

### 3.3 Oil Provider (`providers/oil.py`)

Same pattern as metals. Same risk profile.

### 3.4 Indices Provider (`providers/indices.py`)

| Aspect | Status | Detail |
|--------|--------|--------|
| Timeout | WARN | No explicit yfinance timeout |
| Error handling | OK | Per-ticker try/except (line 60), outer exception returns `[]` (lines 70-71) |
| Data validation | OK | Null check on `price`, `is_delayed=True` flag set correctly (lines 55-56) |
| Rate limiting | **RISK** | 3 tickers every 30s = 6 req/min. Combined with metals (2) and oil (2), that's 10 yfinance requests per 30s cycle |

**Findings:**

| ID | Severity | Finding |
|----|----------|---------|
| SSE-12 | **MEDIUM** | **No yfinance timeout configuration in widget providers**. The `services/yfinance_base.py` has `YFinanceCache` and `CircuitBreaker` but the widget providers do not use them. Each provider creates fresh `yf.Ticker()` objects without the shared cache or circuit breaker. A hung yfinance call blocks `asyncio.to_thread` and delays the entire fetch cycle. |
| SSE-13 | **LOW** | **httpx client created per-request in crypto provider** (line 29: `async with httpx.AsyncClient(timeout=10) as client`). For a 30-second interval this is acceptable, but a shared client with connection pooling would be slightly more efficient. |

---

## 4. Frontend EventSource Consumers

### 4.1 LiveMarketWidgets (`components/widgets/LiveMarketWidgets.tsx`)

**Strengths:**
- Proper cleanup on unmount: `esRef.current?.close()` + `clearTimeout(timerRef.current)` (lines 138-143)
- Exponential backoff: 1.5s base, 2x multiplier, max 30s (lines 127-128)
- Retry counter reset on successful open (line 92)
- Refs for mutable state to avoid stale closures (lines 53-55)
- Separate skeleton state for loading (lines 147-174)
- ConnectionStatusBadge for user feedback (lines 161, 195)
- `is_delayed` indicator for data freshness (lines 223-234)

**Findings:**

| ID | Severity | Finding |
|----|----------|---------|
| SSE-14 | **HIGH** | **No maximum retry limit**. The `retryRef.current` counter increments indefinitely (line 128). While the delay caps at 30s, the component will retry forever even if the server is permanently down. After ~20 retries (10 minutes), consider stopping and showing an explicit "reconnect" button. This prevents background CPU/network waste on dead connections. |
| SSE-15 | **HIGH** | **`connect` useCallback has empty dependency array** (line 134: `}, []`). The function captures nothing from component state/props, which is correct for the current implementation since it only uses refs. However, if `API_BASE` were ever made dynamic (e.g., from props or context), this would create a stale closure. Minor but worth noting. |

### 4.2 News Page SSE Consumer (`app/news/page.tsx`)

**Strengths:**
- SSE with polling fallback (lines 170-203)
- Proper cleanup: `es?.close()` + `clearInterval(fallbackTimer)` (lines 205-208)
- `document.hidden` check in polling fallback to avoid fetching in background tabs (line 149)
- Dependency array includes filter state for reconnection on filter change (line 209)

**Findings:**

| ID | Severity | Finding |
|----|----------|---------|
| SSE-16 | **HIGH** | **No reconnection on SSE error -- falls directly to polling** (lines 194-198). When SSE fails, it permanently falls back to interval polling with no attempt to re-establish SSE. Other tabs or navigations reset this (via useEffect cleanup/remount), but within a single mount, SSE is never retried. The widgets component has exponential backoff reconnection; the news stream should too. |
| SSE-17 | **LOW** | **SSE URL uses relative path** (line 175: `new EventSource(sseUrl)` where `sseUrl = '/api/v1/news/stream...'`). This works for same-origin but will fail if the frontend is served from a different domain than the API (e.g., Vercel frontend + Railway backend). The widgets component uses `API_BASE` prefix; the news SSE should too. |

### 4.3 Vanna Chat SSE (`lib/use-sse-chat.ts`)

**Strengths:**
- Uses `fetch` + `ReadableStream` instead of `EventSource` for POST SSE (correct pattern for POST requests)
- AbortController for cancellation (lines 362-366)
- Batched event processing with 50ms flush interval to reduce re-renders (lines 277-283, 369)
- Final flush in `finally` block (line 450)
- localStorage quota resilience with fallback trimming (lines 49-53)
- Proper streaming state management (isStreaming flag, lines 354, 453-456)
- Error recovery with retry capability (lines 508-532)

**No critical findings.** This is the most polished SSE consumer in the codebase.

---

## 5. Concurrency & Race Conditions

| ID | Severity | Finding |
|----|----------|---------|
| SSE-01/09 | **HIGH** | **asyncio.Event set/clear race** (repeated from above). This is the most significant concurrency issue. Multiple SSE generator coroutines call `event.wait()`. The hub calls `event.set()` then `event.clear()` on the same tick. Because asyncio is cooperative, the waiters are scheduled to resume but `clear()` runs before they do, so `event.is_set()` is already False when they check. In practice, the 5-second timeout in the SSE generator (line 89) means data eventually gets through, but with up to 5 seconds of unnecessary latency. |
| SSE-18 | **LOW** | **No backpressure mechanism**. If a slow SSE client can't consume events fast enough, the generator yields pile up in Starlette's send buffer. Starlette/uvicorn handles this with TCP backpressure, but there's no application-level protection against a client that connects and never reads. |

---

## 6. Load Testing Considerations (100+ Concurrent SSE Connections)

### Resource Analysis

| Resource | Per Connection | 100 Connections | Risk |
|----------|---------------|-----------------|------|
| Async generator | 1 coroutine | 100 coroutines | LOW - asyncio handles thousands |
| `event.wait()` polling | 5s timeout loop | 100 waiting coroutines | LOW - efficient with asyncio.Event |
| `last_sent` string copy | ~1.4KB | ~140KB | NEGLIGIBLE |
| Redis `get_message` threads | 1 thread per poll | 100 threads (1/sec each) | **HIGH** - default ThreadPoolExecutor has ~40 workers |
| TCP connections | 1 socket | 100 sockets | MEDIUM - check ulimit |

### Bottlenecks

1. **Thread pool exhaustion (Redis mode)**: Each Redis SSE connection calls `asyncio.to_thread(pubsub.get_message, timeout=1.0)` every ~1.5 seconds. With 100 connections, that's ~67 concurrent thread pool tasks. The default `asyncio` thread pool has only ~40 workers (`min(32, os.cpu_count() + 4)`). This will cause queuing and latency spikes.

2. **QuotesHub is single-writer**: The hub fetches every 30 seconds regardless of client count. This is actually a strength -- fetch cost is O(1) not O(N). But the set/clear race means clients may see 5-second delays.

3. **No connection limit**: There's no maximum number of concurrent SSE connections. An attacker could open thousands of connections from different IPs (bypassing per-IP rate limits) to exhaust server resources.

4. **Rate limiter counts SSE connection as 1 request**: The initial HTTP request to establish the SSE connection is rate-limited, but the long-lived connection itself consumes resources indefinitely. The rate limiter path_limits do not include SSE paths (`/api/v1/widgets/quotes/stream`, `/api/v1/news/stream`).

### Recommendations for Scale

| Priority | Recommendation |
|----------|---------------|
| HIGH | Add a maximum concurrent SSE connection limit (e.g., 200) with 503 response when exceeded |
| HIGH | Switch Redis Pub/Sub listener to async Redis (e.g., `redis.asyncio`) to eliminate thread pool pressure |
| MEDIUM | Fix the `asyncio.Event` set/clear race to eliminate the 5-second latency floor |
| MEDIUM | Add SSE-specific rate limiting (e.g., max 5 concurrent connections per IP) |
| LOW | Consider a shared broadcast pattern (one asyncio.Queue per client, hub pushes to all) instead of polling the global snapshot |

---

## 7. Test Coverage

| Component | Unit Tests | Integration Tests | Assessment |
|-----------|-----------|------------------|------------|
| `widgets_stream.py` | 0 | 0 | **NONE** |
| `news_stream.py` | 0 | 0 | **NONE** |
| `quotes_hub.py` | 0 | 0 | **NONE** |
| Providers (4 files) | 0 | 0 | **NONE** |
| `LiveMarketWidgets.tsx` | 0 | 0 | **NONE** |
| `use-sse-chat.ts` | 0 | 0 | **NONE** |
| `ConnectionStatusBadge.tsx` | 0 | 0 | **NONE** |

**Finding SSE-19 (HIGH):** Zero test coverage across the entire SSE subsystem. This is the most significant gap. Recommended minimum test suite:
- Unit tests for `_fetch_all_providers()` with mocked providers (success, partial failure, total failure)
- Unit tests for `normalizeSSEEvent()` covering all Vanna 2.0 event types
- Integration test for `_memory_event_generator` with a mock request
- Frontend test for `LiveMarketWidgets` reconnection behavior
- Frontend test for `useSSEChat` batched event flushing

---

## 8. Summary of Findings

### By Severity

| Severity | Count | IDs |
|----------|-------|-----|
| HIGH | 6 | SSE-01/09, SSE-08, SSE-14, SSE-16, SSE-19 |
| MEDIUM | 5 | SSE-02, SSE-04, SSE-05, SSE-10, SSE-12 |
| LOW | 5 | SSE-03, SSE-06, SSE-07, SSE-11, SSE-13, SSE-17, SSE-18 |

### Top 5 Recommendations (Priority Order)

1. **Fix asyncio.Event set/clear race** (SSE-01/09): Replace `set(); clear()` with a pattern where consumers clear the event after reading, or use `asyncio.Condition.notify_all()`.

2. **Add SSE connection limits** (Load section): Implement a middleware or counter that caps concurrent SSE connections to prevent resource exhaustion.

3. **Add reconnection to news SSE** (SSE-16): Port the exponential backoff pattern from `LiveMarketWidgets` to the news page SSE consumer.

4. **Fix module-level asyncio.Event** (SSE-08): Create the Event lazily inside `run_quotes_hub()` or use a factory that checks for a running loop.

5. **Add test coverage** (SSE-19): Write at least unit tests for the hub, providers, and SSE event normalization. These are critical paths with zero coverage.

---

## Appendix: File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `api/routes/widgets_stream.py` | 143 | Widget quotes SSE endpoint (Redis + memory modes) |
| `api/routes/news_stream.py` | 93 | News article notification SSE endpoint |
| `services/widgets/quotes_hub.py` | 128 | Background quote fetcher + broadcaster |
| `services/widgets/providers/crypto.py` | 64 | CoinGecko BTC/ETH fetcher |
| `services/widgets/providers/metals.py` | 68 | yfinance Gold/Silver fetcher |
| `services/widgets/providers/oil.py` | 68 | yfinance Brent/WTI fetcher |
| `services/widgets/providers/indices.py` | 71 | yfinance S&P/DJI/Nasdaq fetcher |
| `api/models/widgets.py` | 23 | QuoteItem Pydantic model |
| `frontend/src/components/widgets/LiveMarketWidgets.tsx` | 260 | SSE consumer + quote display |
| `frontend/src/components/common/ConnectionStatusBadge.tsx` | 29 | Live/reconnecting/offline indicator |
| `frontend/src/app/news/page.tsx` | 130-209 | News SSE consumer with polling fallback |
| `frontend/src/lib/use-sse-chat.ts` | 536 | Vanna chat SSE consumer (fetch + ReadableStream) |
| `app.py` | 577-769 | Lifespan: hub startup/shutdown, scheduler |
| `middleware/rate_limit.py` | 139 | Rate limiter (no SSE-specific limits) |
