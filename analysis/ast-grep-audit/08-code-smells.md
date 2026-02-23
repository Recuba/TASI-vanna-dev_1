# Code Smells & Anti-Patterns Audit

**Auditor:** ast-grep + ripgrep structural analysis
**Date:** 2026-02-17
**Scope:** All Python source files in the Ra'd AI TASI platform
**Tool:** `sg.exe` (ast-grep CLI) + ripgrep content search

---

## Executive Summary

The codebase is generally well-structured with **no critical anti-patterns** found. The most common code smells are:

- **Global mutable state** (21 `global` statements across 13 production files) -- mostly used for singleton initialization patterns
- **Broad exception handling** (68 `except Exception:` blocks, 9 of which silently `pass`)
- **Duplicate magic string** `"saudi_stocks.db"` repeated 16 times across the codebase
- **8 `# type: ignore` suppressions** in production code
- **Zero mutable default arguments** (the most dangerous Python anti-pattern was completely avoided)
- **Zero star imports** (`from X import *`)
- **Zero bare `except:` blocks**
- **Zero TODO/FIXME/HACK comments** in production code

| Category | Findings | Severity |
|----------|----------|----------|
| Mutable default arguments | 0 | -- |
| Star imports | 0 | -- |
| Global mutable state | 21 statements / 13 files | MEDIUM |
| Assert in production code | 0 (all in tests) | -- |
| Nested functions | 18 in production code | LOW |
| Broad exception handling | 68 `except Exception:` | MEDIUM |
| Silent exception swallowing | 9 `except Exception: pass` | HIGH |
| Duplicate string literals | 16x `"saudi_stocks.db"`, 3x `"text/event-stream"` | MEDIUM |
| `type: ignore` suppressions | 8 | LOW |
| TODO/FIXME/HACK comments | 0 | -- |
| Thread-unsafe global counters | 2 (request/error counters) | HIGH |
| Direct `os.environ` in services | 1 file bypasses settings module | LOW |

---

## 1. Mutable Default Arguments

**Findings: 0**
**Severity: N/A**

Searched for `def func(arg=[])`, `def func(arg={})`, and `def func(arg=set())` using both ast-grep AST patterns (`default_parameter` and `typed_default_parameter` with `list`/`dictionary` child nodes) and regex. No instances found.

The codebase correctly uses:
- Pydantic `Field(default_factory=list)` for model fields
- Local variable initialization (`items: List[str] = []`) inside function bodies
- `Optional[list]` with `None` default when mutable containers are needed as parameters

**Verdict: CLEAN** -- This is the most dangerous Python anti-pattern and it has been fully avoided.

---

## 2. Star Imports

**Findings: 0**
**Severity: N/A**

No `from X import *` statements found anywhere in the codebase (production or test).

**Verdict: CLEAN**

---

## 3. Global Mutable State

**Findings: 21 `global` statements across 13 production files**
**Severity: MEDIUM (patterns are intentional singletons, but some have thread-safety issues)**

### 3.1 Singleton / Lazy-Init Pattern (Acceptable)

These follow a common Python singleton pattern with `init_X()` / `get_X()` / `close_X()` functions:

| File | Variables | Purpose |
|------|-----------|---------|
| `cache/redis_client.py:32,62` | `_redis_client` | Redis client singleton |
| `database/pool.py:63,199` | `_pool` | Connection pool singleton |
| `backend/middleware/register.py:55,95` | `_rate_limiter`, `_cost_controller` | Middleware singletons |
| `config/error_tracking.py:173,206` | `_tracker` | Error tracker singleton |
| `config/lifecycle.py:31` | `_start_time` | Process start timestamp |
| `services/cache_utils.py:93` | `_redis_client` | Redis cache client |
| `services/widgets/quotes_hub.py:81` | `_latest_snapshot` | In-memory quote snapshot |
| `backend/services/resilience/config.py:90` | `_config` | Resilience config |
| `backend/security/vanna_hook.py:28,36,164` | `_validator`, `_allowlist` | SQL validator singletons |

**Recommendation:** These are acceptable for a FastAPI application where the async event loop is single-threaded. However, consider refactoring to a dependency injection pattern (FastAPI `Depends()`) for better testability.

### 3.2 Thread-Unsafe Global Counters (HIGH)

| File | Line | Code | Issue |
|------|------|------|-------|
| `backend/routes/health.py` | 25-34 | `global _REQUEST_COUNTER, _ERROR_COUNTER` | Non-atomic increment (`+=1`) called from middleware |
| `services/tasi_index.py` | 111, 121 | `global _consecutive_failures, _circuit_open_until` | Circuit breaker state mutated without lock |

```python
# backend/routes/health.py:29-34 -- NOT thread-safe
def record_request(*, is_error: bool = False) -> None:
    global _REQUEST_COUNTER, _ERROR_COUNTER
    _REQUEST_COUNTER += 1  # Race condition: read-modify-write is not atomic
    if is_error:
        _ERROR_COUNTER += 1
```

**Severity: HIGH**
**Fix:** Use `threading.Lock` or `itertools.count()` or `asyncio`-safe counters. For the health counters, since they are only approximate metrics, a `threading.Lock` or switching to `collections.Counter` would suffice.

### 3.3 Script-Only Globals (Acceptable)

| File | Variables |
|------|-----------|
| `scripts/smoke_test.py:70,77,84` | `_passed`, `_failed`, `_skipped` |

These are only used in CLI scripts, not production server code.

---

## 4. Assert in Production Code

**Findings: 0 in production code**
**Severity: N/A**

All `assert` statements (hundreds) are exclusively in test files (`tests/`, `test_*.py`, `scripts/smoke_test.py`). No production code uses `assert` for validation.

**Verdict: CLEAN**

---

## 5. Nested Function Definitions

**Findings: 18 in production code (excluding tests)**
**Severity: LOW (most are standard decorator/closure patterns)**

### 5.1 Decorator Patterns (Expected)

| File | Line | Function | Context |
|------|------|----------|---------|
| `cache/decorators.py` | 44, 46 | `decorator` / `wrapper` inside `cached()` | 3-level nesting (decorator pattern) |
| `services/cache_utils.py` | 122, 126, 164 | `decorator` / `async_wrapper` / `sync_wrapper` | Cache decorator |
| `backend/services/resilience/retry.py` | 56, 58, 134, 136 | `decorator` / `wrapper` | Retry decorator (2 variants) |

These are standard Python decorator patterns and are not a concern.

### 5.2 Handler Factory (Intentional Closure)

| File | Line | Function | Context |
|------|------|----------|---------|
| `app.py` | 402 | `_stub_handler` inside `_make_stub_handler` | Loop variable capture for PG stub routes |

This is a correct use of closures to capture loop variables.

### 5.3 Exception Handler Registration

| File | Line | Function | Context |
|------|------|----------|---------|
| `middleware/error_handler.py` | 148, 163 | `_http_exception_handler`, `_validation_exception_handler` inside `install_exception_handlers` | Handler registration pattern |

Standard FastAPI exception handler registration.

### 5.4 Generator / Inner Functions

| File | Line | Function | Context |
|------|------|----------|---------|
| `api/routes/news_stream.py` | 38 | `event_generator` inside route handler | SSE generator |
| `api/routes/stock_data.py` | 337 | Inner helper inside route handler | Data transformation |
| `api/routes/sqlite_entities.py` | 243, 246 | Inner helpers | Entity formatting |
| `api/routes/entities.py` | 96, 194, 197 | Inner helpers | Entity formatting |
| `services/news_scraper.py` | 1054 | Inner helper | Scraper utility |
| `ingestion/scheduler.py` | 204 | Inner function | Scheduler utility |
| `app.py` | 702 | `_check_yfinance` inside `lifespan` | Startup health check |

**Recommendation:** Functions at lines `sqlite_entities.py:243,246` and `entities.py:194,197` appear to be duplicated inner helpers. Consider extracting them to a shared utility module.

---

## 6. Broad Exception Handling

**Findings: 68 `except Exception:` blocks (32 in production, 36 in tests)**
**Severity: MEDIUM overall, HIGH for silent swallowing**

### 6.1 Silent Exception Swallowing (`except Exception: pass`) -- HIGH

These catch all exceptions and silently discard them, making debugging difficult:

| File | Line | Context | Risk |
|------|------|---------|------|
| `database/manager.py` | 117-118 | Connection cleanup in `__aexit__` | LOW (cleanup) |
| `database/manager.py` | 140-141 | Sync connection cleanup | LOW (cleanup) |
| `database/pool.py` | 148-149 | Pool connection return | LOW (cleanup) |
| `database/pool.py` | 155-156 | Pool connection close | LOW (cleanup) |
| `api/routes/widgets_stream.py` | 141-142 | SSE generator exception | **MEDIUM** -- could hide data corruption |
| `config/lifecycle.py` | 71-72 | Shutdown cleanup | LOW (cleanup) |
| `chart_engine/raid_chart_generator.py` | 99-100 | Number formatting | **MEDIUM** -- could produce wrong chart data |
| `services/health_service.py` | 572-573 | DB query in health check | LOW (non-fatal, documented) |
| `services/news_store.py` | 91-92 | Connection close | LOW (cleanup) |

**Recommendation:**
- For cleanup code (connection close, pool return): acceptable, but add `logger.debug()` for traceability.
- For `widgets_stream.py:141` and `chart_engine:99`: Add at minimum `logger.warning()` to avoid silent data issues.

### 6.2 Logged Exception Handling (Acceptable)

The remaining ~23 production `except Exception:` blocks all include `logger.warning()` or `logger.error()` calls, which is acceptable for a resilience-oriented design where individual failures should not crash the server.

---

## 7. Duplicate String Literals

**Severity: MEDIUM**

### 7.1 `"saudi_stocks.db"` -- 16 occurrences across 12 files

| File | Line | Usage |
|------|------|-------|
| `config/settings.py` | 30 | Default in DatabaseSettings |
| `app.py` | 95 | SqliteRunner initialization |
| `app.py` | 672 | NewsStore initialization |
| `api/db_helper.py` | 30 | DB backend path |
| `api/routes/news_feed.py` | 28 | News feed DB path |
| `services/db_compat.py` | 25 | Compat layer path |
| `services/health_service.py` | 209 | Health check DB path |
| `services/news_scraper.py` | 239 | Scraper DB path |
| `csv_to_sqlite.py` | 34 | CSV converter |
| `database/migrate_sqlite_to_pg.py` | 47 | Migration script |
| `scripts/generate_system_prompt.py` | 37 | Script utility |
| `scripts/test_news_api.py` | 18 | Test script |
| `test_database.py` | 22 | Test file |
| `test_app_assembly_v2.py` | 17 | Test file |
| `scripts/validate_charts.py` | 19 | Script utility |
| `tests/test_chart_engine.py` | 55 | Test file |

**Recommendation:** The `config/settings.py` already defines `DatabaseSettings.sqlite_path` with the default value. Production code should use `get_settings().database.sqlite_path` instead of hardcoding the string. At minimum, define a constant:

```python
# In config/settings.py or a shared constants module:
DEFAULT_SQLITE_DB = "saudi_stocks.db"
```

### 7.2 `"text/event-stream"` -- 3 occurrences

| File | Line |
|------|------|
| `api/routes/widgets_stream.py` | 46 |
| `api/routes/widgets_stream.py` | 53 |
| `api/routes/news_stream.py` | 88 |

**Recommendation:** Extract to a constant in a shared module:
```python
MEDIA_TYPE_SSE = "text/event-stream"
```

### 7.3 `"DB_BACKEND"` -- 6 occurrences (via `os.environ.get`)

Several files read `os.environ.get("DB_BACKEND", "sqlite")` directly instead of using the `get_settings()` singleton. This bypasses the config validation layer.

| File | Line |
|------|------|
| `api/db_helper.py` | 28 |
| `config/env_validator.py` | 39 |
| `scripts/generate_system_prompt.py` | 26 |
| `scripts/validate_config.py` | 44 |

**Recommendation:** Production code (`api/db_helper.py`) should use `get_settings().database.backend` instead.

---

## 8. TODO/FIXME/HACK/XXX Comments

**Findings: 0 in production code**
**Severity: N/A**

No TODO, FIXME, HACK, or XXX comments found in any production Python or TypeScript files. The only matches were string literals in test data (e.g., SQL injection test: `"'HACK', 'Hacked'"`).

**Verdict: CLEAN**

---

## 9. Additional Code Smells

### 9.1 `# type: ignore` Suppressions -- 8 instances

| File | Line | Suppression | Justification |
|------|------|-------------|---------------|
| `backend/services/cache/compression.py` | 116 | `[union-attr]` | Starlette body_iterator typing |
| `backend/services/resilience/retry.py` | 104 | `[return-value]` | Decorator return type |
| `backend/services/resilience/retry.py` | 149 | `[return-value]` | Decorator return type |
| `services/reports_service.py` | 346 | `[assignment]` | SQLite/PG param type switch |
| `services/reports_service.py` | 401 | `[assignment]` | SQLite/PG param type switch |
| `services/reports_service.py` | 461 | `[assignment]` | SQLite/PG param type switch |
| `services/cache_utils.py` | 160 | `[return-value]` | Decorator return type |
| `services/cache_utils.py` | 198 | `[return-value]` | Decorator return type |

**Severity: LOW** -- All suppressions are for known Python typing limitations with decorators and dual-backend parameter types. The `reports_service.py` suppressions could be eliminated by using a `Union` type or `TypeVar`.

### 9.2 `# noqa` Lint Suppressions -- 4 instances

| File | Line | Code | Reason |
|------|------|------|--------|
| `scripts/validate_charts.py` | 11 | `E402` | Import after `sys.path` manipulation |
| `scripts/validate_charts.py` | 17 | `E402` | Same as above |
| `api/routes/stock_ohlcv.py` | 110 | `F401` | Unused import (availability check) |
| `api/routes/tasi_index.py` | 110 | `F401` | Unused import (availability check) |

**Severity: LOW** -- All are legitimate use cases.

### 9.3 `print()` in Server Code -- 3 files with print statements

| File | Count | Context |
|------|-------|---------|
| `config/__init__.py` | 3 | Startup banner |
| `config/settings.py` | 1 | Settings dump |
| `config/env_validator.py` | 1 | Validation output |

All other `print()` usage is in CLI scripts (`csv_to_sqlite.py`, `migrate_sqlite_to_pg.py`, `smoke_test.py`, etc.) which is appropriate.

**Severity: LOW** -- Startup banner prints are common, but should use `logger.info()` for consistency.

### 9.4 Hardcoded Sleep Durations

| File | Line | Duration | Context |
|------|------|----------|---------|
| `api/routes/news_stream.py` | 84 | `30` seconds | SSE poll interval |
| `api/routes/widgets_stream.py` | 132 | `0.5` seconds | SSE poll interval |
| `services/news_scheduler.py` | 71 | `1` second | Scheduler tick |

**Severity: LOW** -- Consider extracting to configuration constants for easier tuning.

---

## Summary Table

| # | Category | Production Findings | Test Findings | Severity |
|---|----------|-------------------|---------------|----------|
| 1 | Mutable default arguments | 0 | 0 | -- |
| 2 | Star imports (`from X import *`) | 0 | 0 | -- |
| 3 | Global mutable state (`global`) | 21 stmts / 13 files | 3 stmts / 1 file | **MEDIUM** |
| 3a | Thread-unsafe global counters | 2 files | 0 | **HIGH** |
| 4 | `assert` in production code | 0 | ~500+ | -- |
| 5 | Nested function definitions | 18 | 6 | LOW |
| 6 | Broad `except Exception:` | 32 | 5 | MEDIUM |
| 6a | Silent `except Exception: pass` | 9 | 1 | **HIGH** |
| 7 | Duplicate string `"saudi_stocks.db"` | 10 | 6 | MEDIUM |
| 7a | Duplicate string `"text/event-stream"` | 3 | 0 | LOW |
| 7b | Direct `os.environ.get("DB_BACKEND")` | 2 prod + 2 scripts | 2 | LOW |
| 8 | TODO/FIXME/HACK comments | 0 | 0 | -- |
| 9a | `# type: ignore` suppressions | 8 | 0 | LOW |
| 9b | `# noqa` suppressions | 4 | 0 | LOW |
| 9c | `print()` in server code | 5 | -- | LOW |
| 9d | Hardcoded sleep durations | 3 | 0 | LOW |

---

## Recommended Actions (Priority Order)

### HIGH Priority

1. **Thread-safe counters** (`backend/routes/health.py:25-34`): Replace `global _REQUEST_COUNTER += 1` with `threading.Lock`-protected increment or `asyncio`-safe counter.

2. **Thread-safe circuit breaker state** (`services/tasi_index.py:111,121`): The `_consecutive_failures` and `_circuit_open_until` globals are mutated without synchronization. Wrap in a `threading.Lock`.

3. **Add logging to silent exception handlers**: At minimum add `logger.debug()` to the 9 `except Exception: pass` blocks to aid debugging, especially:
   - `api/routes/widgets_stream.py:141` (SSE data path)
   - `chart_engine/raid_chart_generator.py:99` (chart data formatting)

### MEDIUM Priority

4. **Consolidate `"saudi_stocks.db"` to a single constant**: Use `get_settings().database.sqlite_path` in all production code instead of hardcoding the path.

5. **Replace `os.environ.get("DB_BACKEND")` with settings**: `api/db_helper.py:28` should use the config singleton instead of reading env vars directly.

6. **Extract SSE media type constant**: Define `MEDIA_TYPE_SSE = "text/event-stream"` in a shared constants module.

### LOW Priority

7. **Replace `print()` with `logger.info()`** in `config/__init__.py` and `config/settings.py`.
8. **Extract hardcoded sleep durations** to named constants or config.
9. **Resolve `type: ignore` in `reports_service.py`** by using `Union[list, dict]` parameter types.
10. **Deduplicate inner helper functions** in `sqlite_entities.py` and `entities.py`.
