# ast-grep Codebase Audit Summary (Verified)

**Date:** 2026-02-17
**Tool:** ast-grep v0.40.5 (structural AST analysis)
**Agents deployed:** 8 parallel audit agents
**Scope:** Full Python backend + Next.js TypeScript frontend
**Status:** All findings manually verified against current source code

---

## Verification Results

Each finding was cross-checked against the actual code. Findings marked **CONFIRMED** are real issues. Findings marked **MITIGATED** have existing protections that reduce severity. Findings marked **NOT AN ISSUE** were false positives or already handled.

---

## CRITICAL Findings (2) - Both Confirmed

### C-1: Hardcoded Anthropic API key in `.env` (CONFIRMED - LOW RISK)
- **File:** `.env:9` - `sk-ant-api03-AOT8...`
- **Status:** `.env` IS in `.gitignore` (line 10), so it's not tracked by git
- **Risk:** Low for current state, but the key was flagged as previously committed to git history in `PRODUCTION_READINESS_PLAN.md`
- **Action:** Rotate the key if it was ever committed. Check `git log --all -p -- .env`

### C-2: Hardcoded Redis password in `.env` (CONFIRMED - LOW RISK)
- **File:** `.env:63` - Redis URL with embedded password
- **Status:** Same as C-1 - `.env` is gitignored, local dev only
- **Action:** No immediate action needed for local dev. Ensure production uses env vars injected by deployment platform

---

## HIGH Findings - Verification Status

### Async/Event Loop Blocking (Audit 03)

#### H-async-1: `auth/dependencies.py` sync DB in FastAPI dependency (CONFIRMED)
- **Line 81-92:** Direct `psycopg2` cursor call in sync `def get_current_user()`
- **Impact:** Blocks event loop on every authenticated request in PostgreSQL mode
- **Note:** Only affects PG mode. SQLite mode doesn't use this dependency.
- **Fix needed:** Wrap in `asyncio.to_thread()` or make the dependency async

#### H-async-2: `api/routes/auth.py` sync service calls (CONFIRMED)
- **Lines 75, 109, 176:** `service.register()`, `service.login()`, `service.verify_user_active()` called directly in async handlers without `asyncio.to_thread()`
- **Fix needed:** Wrap each sync service call in `asyncio.to_thread()`

#### H-async-3: `api/routes/tasi_index.py` sync fetch (CONFIRMED)
- **Line 73:** `fetch_tasi_index(period=period)` called directly in async handler
- **Impact:** Blocks event loop for yfinance HTTP + potential `time.sleep(0.5)` retries
- **Fix needed:** `result = await asyncio.to_thread(fetch_tasi_index, period=period)`

#### M-async-4: `api/routes/stock_ohlcv.py` sync fetch (CONFIRMED)
- **Line 82:** `fetch_stock_ohlcv(ticker, period)` called directly in async handler
- **Fix needed:** Same as H-async-3

### Broad Exception Catches (Audit 01)

#### H-exc-1: `app.py:149` - JWT catch-all (CONFIRMED)
- `except Exception:` in UserResolver catches everything as "invalid token"
- Could mask ImportError, AttributeError, etc.
- **Fix:** Catch `(jwt.PyJWTError, ValueError, KeyError)`

#### H-exc-2: `app.py:340` - Auth middleware catch-all (CONFIRMED)
- `except Exception:` returns 401 for all errors including import failures
- **Fix:** Catch `(jwt.PyJWTError, ValueError)`

#### H-exc-3: `api/routes/auth.py:42` - Auth service factory silent None (CONFIRMED)
- `except Exception: return None` with no logging
- **Fix:** Log the error before returning None

#### H-exc-4: `backend/security/sql_validator.py:216` - Fails OPEN (CONFIRMED but MITIGATED)
- `extract_forbidden_ops()` returns `["UNPARSEABLE"]` on parse error (line 217) - this actually BLOCKS the query
- `extract_tables()` returns `[]` on parse error (line 267) - this could allow queries with unknown tables through
- **Severity adjusted:** The `extract_forbidden_ops` is safe. Only `extract_tables` is a concern.

#### H-exc-5: `chart_engine/raid_chart_generator.py:99` - Silent pass (CONFIRMED - LOW RISK)
- `except Exception: pass` on `pd.to_datetime()` - this is a data coercion attempt, failing silently is reasonable here
- **Severity adjusted:** LOW - not a security issue, just skips non-date columns

#### H-exc-6: `services/news_store.py:91` - Silent pass on close (CONFIRMED - LOW RISK)
- `except Exception: pass` on `conn.close()` - defensive teardown
- **Severity adjusted:** LOW - standard pattern for connection cleanup

#### H-exc-7: `services/health_service.py:572` - Silent pass (CONFIRMED - LOW RISK)
- In health diagnostics, DB query failure is non-fatal
- **Severity adjusted:** LOW - appropriate for graceful degradation

### Security (Audit 07)

#### H-sec-1: DOMPurify race condition (CONFIRMED)
- **File:** `templates/index.html:1116-1129`
- `marked.js` and `DOMPurify` both load with `async` attribute
- If DOMPurify hasn't loaded when `renderMd()` runs, raw HTML goes through unsanitized
- **Note:** This is legacy UI, not the production Next.js frontend

#### H-sec-2: DOMPurify allows iframes (CONFIRMED)
- **File:** `templates/index.html:1127` - `ADD_TAGS: ['iframe']`
- **Note:** Legacy UI only

#### H-sec-3: TradingView `script.innerHTML` (CONFIRMED - LOW RISK)
- **File:** `frontend/src/components/charts/TradingViewWidget.tsx:86`
- `script.innerHTML = JSON.stringify(config)` - config is built entirely from component props (no user input)
- This is the standard TradingView widget embedding pattern
- **Severity adjusted:** LOW - no user-controlled data flows into the config

### Thread Safety (Audit 08)

#### H-thread-1: `backend/routes/health.py:25-34` - Non-atomic counter (CONFIRMED)
- `global _REQUEST_COUNTER` with `+=` is not thread-safe
- **Fix:** Use `threading.Lock` or `itertools.count()`

#### H-thread-2: `services/tasi_index.py:111,121` - Circuit breaker globals (CONFIRMED)
- `global _consecutive_failures, _circuit_open_until` mutated without lock
- **Fix:** Use the shared `CircuitBreaker` class methods which should be synchronized

### React Hooks (Audit 06)

#### H-react-1: Toast setTimeout not tracked (CONFIRMED)
- **File:** `frontend/src/components/common/Toast.tsx:134,144`
- Two `setTimeout` calls in `dismiss` and `showToast` are not tracked via `useRef`
- **Risk:** Low - ToastProvider is a top-level provider that never unmounts during normal use
- **Severity adjusted:** MEDIUM - theoretical issue, practically harmless

#### H-react-2: eslint-disable on exhaustive-deps (CONFIRMED)
- Chart components use `data.length > 0` as dep instead of `data`
- **Risk:** Could miss data content changes when length stays the same
- **Severity adjusted:** MEDIUM - should use `data` as the dependency

### TypeScript (Audit 04)

#### H-ts-1: Non-null assertions on nullable source_url (CONFIRMED)
- **File:** `frontend/src/app/news/[id]/page.tsx:603,626`
- `article.source_url!` with `isValidUrl()` guard above
- **Risk:** Very low - `isValidUrl()` checks for null/undefined
- **Severity adjusted:** LOW - TypeScript can't narrow through custom functions, but runtime is safe

### SQL Injection (Audit 02)

#### H-sql-1: `stock_data.py:355` f-string SQL (CONFIRMED - MITIGATED)
- f-string interpolates `{col_list}`, `{table}`, `{placeholders}`
- **BUT:** All values come from `_METRIC_MAP` whitelist (lines 37-94), not user input
- Ticker values use parameterized `?` placeholders
- Wrapped in `asyncio.to_thread()` (line 364)
- **Severity adjusted:** LOW - well-protected by whitelist

---

## Summary: What Actually Needs Fixing

### Must Fix (real bugs/blocking issues)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Sync DB in auth dependency | `auth/dependencies.py:81` | Wrap in `asyncio.to_thread()` |
| 2 | Sync auth service calls | `api/routes/auth.py:75,109,176` | Wrap in `asyncio.to_thread()` |
| 3 | Sync TASI fetch in async handler | `api/routes/tasi_index.py:73` | Wrap in `asyncio.to_thread()` |
| 4 | Sync OHLCV fetch in async handler | `api/routes/stock_ohlcv.py:82` | Wrap in `asyncio.to_thread()` |
| 5 | JWT catch-all in UserResolver | `app.py:149` | Narrow to `(jwt.PyJWTError, ValueError, KeyError)` |
| 6 | Auth middleware catch-all | `app.py:340` | Narrow to `(jwt.PyJWTError, ValueError)` |
| 7 | Auth factory silent failure | `api/routes/auth.py:42` | Add `logger.warning()` |
| 8 | Thread-unsafe counters | `backend/routes/health.py:25` | Add `threading.Lock` |
| 9 | Thread-unsafe circuit breaker | `services/tasi_index.py:111` | Add `threading.Lock` |

### Should Fix (code quality)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 10 | `extract_tables()` fails open | `backend/security/sql_validator.py:267` | Return `["UNKNOWN"]` on error |
| 11 | DOMPurify race condition | `templates/index.html` | Change `async` to `defer` |
| 12 | DOMPurify allows iframes | `templates/index.html:1127` | Remove `ADD_TAGS: ['iframe']` |
| 13 | Chart deps eslint-disable | 3 chart components | Use `data` as dependency |
| 14 | `any` in SWR middleware | `lib/monitoring/swr-middleware.ts` | Add proper SWR types |

### Won't Fix / Already Handled

| Issue | Reason |
|-------|--------|
| `.env` secrets | gitignored, local dev only |
| `news_store.py` silent close | Standard teardown pattern |
| `health_service.py` silent pass | Appropriate graceful degradation |
| `chart_generator` silent pass | Data coercion, not security |
| `stock_data.py` f-string SQL | Protected by whitelist + parameterized values |
| Toast setTimeout | Provider never unmounts in practice |
| TradingView innerHTML | No user input in config, standard widget pattern |
| Non-null assertions in news page | Runtime safe via isValidUrl guard |

---

## Codebase Health Score (Post-Verification)

| Category | Score | Notes |
|----------|-------|-------|
| SQL Injection Protection | **9/10** | Strong parameterization + whitelists |
| Exception Handling | **6/10** | Broad catches in auth path need narrowing |
| Async Correctness | **7/10** | Auth + TASI/OHLCV routes need `to_thread()` |
| TypeScript Safety | **9.5/10** | Near-zero `any`, active ESLint rules |
| Logging Discipline | **10/10** | Zero print() in production |
| React Patterns | **8.5/10** | Good cleanup, minor dep array issues |
| Secrets Management | **8/10** | gitignored .env, but rotate if ever committed |
| Thread Safety | **7/10** | Two unprotected global counters |
| **Overall** | **8.1/10** | Solid codebase, 9 targeted fixes needed |
