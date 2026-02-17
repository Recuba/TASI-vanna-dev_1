# Backend Code Quality Audit

**Date**: 2026-02-17
**Scope**: All Python backend code (`services/`, `api/`, `config/`, `middleware/`, `database/`, `app.py`)
**Files Reviewed**: 55+ Python source files

---

## Executive Summary

The backend codebase is well-organized with clear separation of concerns, consistent patterns, and solid infrastructure. The code is production-ready overall, with a few areas that would benefit from improvement. The most significant findings are: (1) heavy code duplication between `tasi_index.py` and `stock_ohlcv.py`, (2) inconsistent type hint coverage on several service constructors, (3) deprecated `datetime.utcnow()` usage, and (4) backward-compatibility shims in `tasi_index.py` that increase complexity without clear need going forward.

**Severity Legend**: CRITICAL = production risk, HIGH = should fix, MEDIUM = quality concern, LOW = minor improvement

---

## 1. Type Hints Coverage

**Overall**: Good. Most public functions have proper return type annotations. Gaps exist in service constructors and some internal helpers.

### Missing or Incomplete Type Hints

| File | Location | Issue | Severity |
|------|----------|-------|----------|
| `services/audit_service.py:69` | `__init__(self, get_conn)` | `get_conn` parameter untyped | MEDIUM |
| `services/announcement_service.py:71` | `__init__(self, get_conn)` | `get_conn` parameter untyped | MEDIUM |
| `services/news_service.py:70` | `__init__(self, get_conn)` | `get_conn` parameter untyped | MEDIUM |
| `services/user_service.py:84` | `__init__(self, get_conn)` | `get_conn` parameter untyped | MEDIUM |
| `services/reports_service.py:94` | `__init__(self, get_conn)` | `get_conn` parameter untyped | MEDIUM |
| `services/reports_service.py:139` | `_scalar(conn, sql, params)` | Return type untyped | LOW |
| `services/reports_service.py:150` | `_execute(conn, sql, params)` | Return type untyped | LOW |
| `services/reports_service.py:236` | `_to_insert_params(...)` | Return type untyped | LOW |
| `services/db_compat.py:34` | `get_read_connection()` | Return type not annotated (returns Union[sqlite3.Connection, psycopg2 connection]) | MEDIUM |
| `services/health_service.py:212` | `_sqlite_query(sql, db_path)` | Return type not annotated | LOW |
| `api/db_helper.py:43` | `get_conn()` | Return type not annotated | MEDIUM |

**Recommendation**: Add `Callable[[], Any]` (or a protocol type) for all `get_conn` parameters. The `AuthService` at `services/auth_service.py:33` correctly types it as `Callable` -- the other 5 services should follow suit.

---

## 2. Code Duplication

### CRITICAL: `tasi_index.py` / `stock_ohlcv.py` Near-Identical Logic

**Severity**: HIGH

These two files share approximately 70% identical code patterns:

1. **Mock data generation** (`_generate_mock_data`): Both files have nearly identical deterministic mock generators with the same structure (Tadawul weekend skip, random price walk, identical field names). Only the seed strategy differs.
   - `services/tasi_index.py:139-188` (50 lines)
   - `services/stock_ohlcv.py:102-159` (58 lines)

2. **Main fetcher functions** (`fetch_tasi_index` / `fetch_stock_ohlcv`): Same pattern -- cache check, lock, double-check cache, circuit breaker check, yfinance fetch, stale cache fallback, mock fallback.
   - `services/tasi_index.py:196-365` (170 lines)
   - `services/stock_ohlcv.py:167-333` (167 lines)

3. **DataFrame processing**: Identical row-by-row iteration with the same field extraction (time, open, high, low, close, volume).
   - `services/tasi_index.py:256-275`
   - `services/stock_ohlcv.py:229-248`

4. **Error classification**: Identical error_category classification logic (rate_limit, network, data_error).
   - `services/tasi_index.py:306-315`
   - `services/stock_ohlcv.py:277-286`

5. **`get_cache_status()`**: Nearly identical cache status functions.
   - `services/tasi_index.py:372-393`
   - `services/stock_ohlcv.py:340-364`

**Recommendation**: Extract a shared `YFinanceFetcher` class or utility functions into `services/yfinance_base.py` (which already exists but only contains `YFinanceCache` and `CircuitBreaker`). A ~100-line refactor could eliminate ~200 lines of duplication.

### MEDIUM: Dual-Backend Query Pattern Duplication in `reports_service.py`

The `reports_service.py` file contains its own copies of `_fetchall`, `_fetchone`, and `_scalar` (lines 116-147) that duplicate the same patterns in `services/db_compat.py` and `api/db_helper.py`. This is partly justified because `reports_service.py` detects the backend from the connection type at runtime rather than from config, but the actual logic is identical.

### MEDIUM: `db_compat.py` vs `api/db_helper.py` Overlapping Responsibility

Both modules provide dual-backend query execution:
- `services/db_compat.py`: `fetchall_compat`, `fetchone_compat`, `scalar_compat`
- `api/db_helper.py`: `fetchall`, `fetchone`, `afetchall`, `afetchone`

The helper in `api/db_helper.py` additionally provides async wrappers and `?` -> `%s` placeholder conversion. The service-layer file `db_compat.py` is used by `health_service.py`. These could potentially be unified.

---

## 3. Circular Import Risk Analysis

**Status**: No circular imports detected.

The import graph is clean and well-layered:
- `config/` -> no local imports (leaf)
- `services/` -> imports from `config/`, `api/models/` (for QuoteItem), `database/`
- `api/routes/` -> imports from `services/`, `api/db_helper`, `database/queries`, `models/`
- `app.py` -> imports from all layers

**Notable patterns that avoid problems**:
- `app.py` uses lazy imports inside `try/except` blocks for optional modules
- `services/news_scheduler.py:84` imports `news_scraper` inside `_fetch_cycle()` to avoid import-time side effects
- `middleware/error_handler.py:34` uses `TYPE_CHECKING` guard for `FastAPI` type
- `app.py:19` uses `TYPE_CHECKING` guard for `ToolSchema`

---

## 4. Async/Await Correctness

**Overall**: Good. The project has a consistent pattern of wrapping sync I/O in `asyncio.to_thread()`.

### Correct Patterns (confirmed working)

- `api/db_helper.py:142-148`: `afetchall` and `afetchone` properly use `asyncio.to_thread`
- `services/news_store.py:354-373`: All `aget_*` methods properly delegate to `asyncio.to_thread`
- `api/routes/stock_data.py:364`: `compare_stocks` properly uses `asyncio.to_thread(_sync_compare)`
- `api/routes/tasi_index.py`: Uses `asyncio.to_thread` for `fetch_tasi_index`
- `services/widgets/quotes_hub.py:105-112`: Redis calls properly wrapped in `asyncio.to_thread`

### Observations

| File | Issue | Severity |
|------|-------|----------|
| `services/widgets/quotes_hub.py:100-101` | `_snapshot_event.set()` immediately followed by `_snapshot_event.clear()` creates a race condition -- waiters may miss the event if they are not already waiting | MEDIUM |
| `services/news_scraper.py` | All sync (uses `requests` library). This is fine since it runs in background threads via `news_scheduler.py` | -- |
| `services/widgets/providers/crypto.py` | Uses `httpx.AsyncClient` correctly for async HTTP | -- |

**`_snapshot_event` Race Condition Detail** (`services/widgets/quotes_hub.py:100-101`):
```python
_snapshot_event.set()
_snapshot_event.clear()
```
If no consumer is currently awaiting the event, the `set()` followed immediately by `clear()` means the notification is lost. The `_memory_event_generator` in `widgets_stream.py` handles this by using `wait_for` with a timeout, so it will eventually poll, but there's a window where updates are delayed up to 5 seconds.

---

## 5. Logging Consistency

**Overall**: Excellent. All modules use the standard `logging.getLogger(__name__)` pattern.

### Verified Consistent Pattern

Every service, route, and middleware file follows:
```python
import logging
logger = logging.getLogger(__name__)
```

- `config/logging_config.py` provides centralized logging setup (JSON for prod, pretty for dev)
- `config/settings.py` uses `_log` alias (minor inconsistency but internal only)
- No raw `print()` calls found in any service file
- Structured log messages include relevant context (request_id, source name, duration_ms, etc.)

### Minor Inconsistency

| File | Issue | Severity |
|------|-------|----------|
| `config/settings.py:7` | Uses `_log = logging.getLogger(__name__)` instead of `logger` | LOW |

---

## 6. Dead Code

### Unused or Potentially Dead Code

| File | Location | Issue | Severity |
|------|----------|-------|----------|
| `services/tasi_index.py:40-42` | Module-level `_consecutive_failures` and `_circuit_open_until` | Backward-compatibility shims that duplicate state already managed by `_breaker`. The `_sync_to_breaker()` pattern adds complexity. | MEDIUM |
| `services/tasi_index.py:38-39` | `CIRCUIT_BREAKER_THRESHOLD` and `CIRCUIT_BREAKER_TIMEOUT` | Module-level constants that just mirror `_breaker.threshold` and `_breaker.timeout`. Only used by test fixtures. | LOW |
| `services/tasi_index.py:369` | `get_tasi_data = fetch_tasi_index` | Alias "for verification command" -- unclear if still used | LOW |
| `services/stock_ohlcv.py:337` | `get_stock_ohlcv = fetch_stock_ohlcv` | Same alias pattern | LOW |
| `api/routes/market_analytics.py:80` | `_MOVERS_SQL = MOVERS_BASE` | Unnecessary alias within the same module | LOW |
| `services/news_scraper.py:661-663` | `GoogleNewsRssScraper._parse_page` | Empty method (returns `[]`). Required by ABC but never called because `fetch_articles` is overridden. | LOW |

### Backward-Compatibility Shim in `tasi_index.py`

The module maintains parallel state (`_consecutive_failures`, `_circuit_open_until`) alongside the `_breaker` `CircuitBreaker` instance, with `_sync_to_breaker()` and `_sync_from_breaker()` to keep them in sync. This exists for test fixtures that reset state via `mod._consecutive_failures = 0`. This adds ~30 lines of complexity. A better approach would be to update the test fixtures to use `_breaker` directly.

---

## 7. Function Complexity (>50 lines)

| File | Function | Lines | Complexity Driver | Severity |
|------|----------|-------|-------------------|----------|
| `app.py:577-769` | `lifespan()` | 192 | Startup/shutdown orchestration for 8+ subsystems | MEDIUM |
| `services/news_scraper.py:537-659` | `GoogleNewsRssScraper.fetch_articles()` | 122 | RSS parsing + error handling for multiple queries | MEDIUM |
| `services/health_service.py:475-616` | `check_news_scraper()` | 141 | Dual-backend health probing with scheduler inspection | MEDIUM |
| `services/tasi_index.py:196-365` | `fetch_tasi_index()` | 170 | Cache + lock + circuit breaker + yfinance + fallback | MEDIUM |
| `services/stock_ohlcv.py:167-333` | `fetch_stock_ohlcv()` | 167 | Same pattern as tasi_index | MEDIUM |
| `services/reports_service.py:296-352` | `get_reports()` | 57 | Dual-backend SQL builder with conditional clauses | LOW |
| `services/health_service.py:323-410` | `check_news()` | 88 | Dual-backend news table check | MEDIUM |

**Most impactful refactor**: `app.py:lifespan()` would benefit from extracting helper functions for each startup phase (e.g., `_init_pool()`, `_init_redis()`, `_start_news_scheduler()`, `_start_quotes_hub()`).

---

## 8. Resource Cleanup

**Overall**: Good. All database operations follow the `try/finally: conn.close()` pattern.

### Verified Cleanup Patterns

- **Service layer** (`news_service.py`, `announcement_service.py`, `user_service.py`, `audit_service.py`, `reports_service.py`): All methods acquire connections via `self._conn()` and close in `finally` blocks.
- **`api/db_helper.py`**: `_sync_fetchall()` and `_sync_fetchone()` both use `try/finally: conn.close()`.
- **`services/health_service.py`**: `check_database()` uses `try/finally: conn.close()` for direct PG connections.
- **`services/news_store.py`**: Uses per-thread connection caching via `threading.local()` with explicit `close()` method.
- **SSE generators**: Both `widgets_stream.py` and `news_stream.py` properly check `request.is_disconnected()`.

### Observations

| File | Issue | Severity |
|------|-------|----------|
| `services/news_scraper.py:339-341` | `BaseNewsScraper.__init__` creates a `requests.Session()` but never closes it. Sessions are per-scraper-instance and short-lived (one `fetch_all_news()` call), so leak risk is minimal. | LOW |
| `services/news_scraper.py:208-209` | `_load_ticker_map_from_db`: Opens and closes SQLite connection correctly. | -- |
| `api/routes/widgets_stream.py:138-141` | Redis pubsub correctly unsubscribed and closed in `finally` block. | -- |
| `services/news_store.py:79` | SQLite connection cached per-thread via `threading.local()`. The `close()` method exists but is only called during shutdown. This is intentional for performance. | -- |

---

## 9. Naming Conventions

**Overall**: Excellent. Python snake_case is used consistently throughout.

### Verified Consistent Patterns

- All function and method names: `snake_case`
- All module names: `snake_case`
- All class names: `PascalCase` (e.g., `NewsStore`, `CircuitBreaker`, `YFinanceCache`)
- All constants: `UPPER_SNAKE_CASE` (e.g., `VALID_PERIODS`, `RELEVANCE_KEYWORDS`, `DEFAULT_HEADERS`)
- Private functions/methods: single underscore prefix (e.g., `_get_cached`, `_build_filters`)
- Module-level private state: single underscore prefix (e.g., `_cache`, `_breaker`, `_fetch_lock`)

### Minor Inconsistency

| File | Issue | Severity |
|------|-------|----------|
| Database column names use `snake_case` in SQLite/PG schema but some Pydantic models map from column names with mixed conventions (e.g., `camelCase` in API responses when the column is `snake_case`). This is standard practice. | -- | -- |
| `services/tasi_index.py:24` | `_CACHE_TTL = _cache.ttl` -- redundant alias | LOW |

---

## 10. Module Organization

**Overall**: Well-structured with clear boundaries.

### Module Size Analysis

| Module | Files | Lines (approx) | Assessment |
|--------|-------|-----------------|------------|
| `services/news_scraper.py` | 1 | 1065 | Large but well-structured (5 scrapers + base + helpers) |
| `services/health_service.py` | 1 | 670 | Large -- 8 health check functions. Could split into separate check modules. |
| `services/reports_service.py` | 1 | 467 | Moderate. Contains its own dual-backend abstraction. |
| `services/user_service.py` | 1 | 467 | Moderate. Users + watchlists + alerts in one file. |
| `app.py` | 1 | 778 | Large -- server assembly + route registration + lifespan + middleware. |

### Observations

- `app.py` does too many things: Vanna agent assembly, route registration, middleware setup, lifespan management, custom routes. It would benefit from splitting into `app.py` (core app) and `app_routes.py` (route registration) or `app_lifespan.py`.
- `services/health_service.py` has 8 separate check functions. These could be organized as a `HealthChecker` class or split by concern (DB checks, service checks, external API checks).
- The `services/widgets/providers/` directory is well-organized with one file per provider.

---

## 11. Import Organization

**Overall**: Good. No wildcard imports found anywhere.

### Verified Clean Patterns

- No `from module import *` found in any file
- Standard library imports at top, then third-party, then local (generally followed)
- `TYPE_CHECKING` guards used appropriately in `app.py` and `middleware/error_handler.py`

### Observations

| File | Issue | Severity |
|------|-------|----------|
| `app.py:236` | `from fastapi.middleware.cors import CORSMiddleware as _CORSMiddleware` -- import in the middle of module-level code (between route config and middleware setup). This is intentional for flow but unconventional. | LOW |
| `app.py:260` | `import os as _os` -- redundant since `os` is already imported at line 14. The `_os` alias avoids polluting the module namespace but `os` is already in scope. | LOW |
| `services/news_scraper.py:511` | `from urllib.parse import urlparse` -- imported inside `_absolute_url` method. Could be at module top. | LOW |
| `services/news_scraper.py:607` | `from email.utils import parsedate_to_datetime` -- imported inside a loop iteration. Should be at module or method top. | LOW |
| `services/cache_utils.py:132,152,169,189` | `import json as _json` repeated inside each wrapper. Should be at module top. | LOW |

---

## 12. Magic Numbers and Strings

### Magic Numbers Found

| File | Location | Value | Should Be |
|------|----------|-------|-----------|
| `services/tasi_index.py:150` | `rng = random.Random(42)` | `42` | Named constant `_MOCK_SEED = 42` |
| `services/news_scraper.py:586` | `len(title) < 10` | `10` | Named constant `_MIN_TITLE_LENGTH = 10` |
| `services/news_scraper.py:432` | `len(text) > 50` | `50` | Named constant `_MIN_BODY_LENGTH = 50` |
| `services/news_scraper.py:848` | `len(title) >= 15` | `15` | Different threshold from `10` above, should be consistent |
| `services/health_service.py:580-584` | `3600`, `86400` | Seconds thresholds | Already clear from context but could use named constants |
| `middleware/rate_limit.py:27` | `_CLEANUP_INTERVAL = 500` | 500 | Already named -- good |
| `services/widgets/quotes_hub.py:21-22` | `_REDIS_TTL = 120`, `_FETCH_INTERVAL = 30` | | Already named -- good |

### Magic Strings Found

| File | Location | Value | Notes |
|------|----------|-------|-------|
| `services/tasi_index.py:246` | `"^TASI"`, `"TASI.SR"` | Symbol strings used directly in code | Could be constants |
| `services/news_scraper.py:149-155` | Sentiment labels in Arabic | Used inline | Already defined as part of the analysis function |

---

## 13. Additional Findings

### A. Deprecated `datetime.utcnow()` Usage

**Severity**: MEDIUM (deprecated since Python 3.12)

Found 14 occurrences across 5 files:
- `services/health_service.py` (5 occurrences)
- `services/news_scraper.py` (1)
- `services/news_store.py` (1)
- `services/stock_ohlcv.py` (3)
- `services/tasi_index.py` (4)

**Recommendation**: Replace with `datetime.now(timezone.utc)` (already used correctly in `services/widgets/providers/crypto.py:34`).

### B. `BaseHTTPMiddleware` Limitation

**Severity**: LOW

Both `middleware/rate_limit.py` and `middleware/error_handler.py` use Starlette's `BaseHTTPMiddleware`. This has known limitations: it wraps the response body in memory (preventing true streaming), and it cannot handle `BackgroundTask` responses properly. For the current use case (rate limiting and error handling), this is acceptable, but if streaming responses grow in importance, consider switching to raw ASGI middleware.

### C. Consistent Error Handling Pattern

**Positive Finding**: All service write operations follow a consistent pattern:
```python
conn = self._conn()
try:
    # execute
    conn.commit()
except Exception:
    conn.rollback()
    logger.error(...)
    raise
finally:
    conn.close()
```
This is well-disciplined and prevents connection leaks.

### D. Broad `except Exception` Catches

**Severity**: LOW

Found 31 instances of `except Exception:` across service files. Most are appropriate (they log and re-raise, or they log and return a safe default). The pattern is consistent and intentional -- the services are designed to be resilient.

No bare `except:` clauses were found anywhere, which is good.

### E. `requests.Session` Not Used as Context Manager

**Severity**: LOW

`services/news_scraper.py:340` creates `self._session = requests.Session()` in `__init__` but the session is never explicitly closed. Since scrapers are short-lived (instantiated per fetch cycle), this is acceptable but not ideal.

---

## Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Type Hints | 7/10 | Good coverage, gaps in service constructors |
| Code Duplication | 5/10 | Significant duplication in yfinance services |
| Circular Imports | 10/10 | No issues found |
| Async/Await | 9/10 | One minor race condition in snapshot event |
| Logging | 10/10 | Consistently excellent |
| Dead Code | 8/10 | Some backward-compat shims and aliases |
| Function Complexity | 7/10 | A few long functions, especially app.py lifespan |
| Resource Cleanup | 9/10 | Very disciplined try/finally patterns |
| Naming | 10/10 | Fully consistent snake_case |
| Module Organization | 7/10 | app.py and health_service.py are overloaded |
| Import Organization | 9/10 | Clean, no wildcards, minor in-function imports |
| Constants | 7/10 | Some magic numbers remain |

**Overall Backend Quality Score: 8.2/10**

---

## Top 5 Recommendations (Priority Order)

1. **Extract shared yfinance fetch logic** from `tasi_index.py` and `stock_ohlcv.py` into `yfinance_base.py` -- eliminates ~200 lines of duplication (HIGH)

2. **Add `Callable` type hint** to all service `__init__(self, get_conn)` parameters, following the pattern already used in `auth_service.py` (MEDIUM)

3. **Replace `datetime.utcnow()`** with `datetime.now(timezone.utc)` across all 14 occurrences -- deprecated since Python 3.12 (MEDIUM)

4. **Refactor `app.py` lifespan** into smaller helper functions for each subsystem initialization (MEDIUM)

5. **Remove backward-compatibility shims** in `tasi_index.py` (module-level circuit breaker state, `_sync_to_breaker()`) and update test fixtures to use `_breaker` directly (MEDIUM)
