# Ra'd AI TASI Platform - Consolidated Code Audit Summary

**Date:** 2026-02-17
**Agents Deployed:** 14
**Total Findings:** ~180+
**Reports:** 14 individual audit reports in `analysis/`

---

## Overall Health Scorecard

| Audit Area | Grade | Findings | Critical | High | Medium |
|---|---|---|---|---|---|
| Security | B | 19 | 1 | 3 | 6 |
| API Endpoints | B+ | ~20 | 2 | 0 | 5 |
| Database & SQL | B | 27 | 2 | 5 | 10 |
| Performance | B- | 22 | 2 | 4 | 7 |
| Error Handling | B+ | ~26 | 2 | 0 | 5 |
| Frontend Quality | B | Mixed | 0 | 1 | 4 |
| Backend Quality | A- (8.2/10) | ~12 | 0 | 1 | 5 |
| Test Coverage | B- | ~15 | 3 | 0 | 5 |
| Configuration | B- | 25 | 2 | 5 | 8 |
| Middleware | B+ | 18 | 0 | 0 | 7 |
| SSE & Real-time | B- | 16 | 0 | 6 | 5 |
| Dependencies | B- | ~18 | 2 | 1 | 1 |
| Architecture | B+ | ~12 | 0 | 1 | 4 |
| Documentation | B+ | ~10 | 0 | 1 | 2 |

**Composite Grade: B**

---

## CRITICAL Findings (Immediate Action Required)

### 1. Leaked API Credentials in Committed `.env` File
- **Source:** Security Audit, Config Audit
- **Severity:** CRITICAL
- **Details:** Hardcoded Anthropic API key (`sk-ant-api03-...`), Redis password, and PostgreSQL credentials committed in `.env` file
- **Impact:** Anyone with repo access has production credentials
- **Action:** Rotate ALL exposed keys immediately. Expand `.gitignore` to cover `.env.*` and `frontend/.env.local`

### 2. Global Fetch Lock Serializes All OHLCV Requests
- **Source:** Performance Audit (PERF-28)
- **Location:** `services/stock_ohlcv.py`
- **Severity:** CRITICAL
- **Details:** Single `_fetch_lock` serializes ALL stock data requests. 10 concurrent cache-miss requests = 10-50s wait
- **Action:** Replace with per-ticker lock dictionary

### 3. DemoAgentMemory OOM Risk
- **Source:** Performance Audit (PERF-12)
- **Location:** `app.py` - `DemoAgentMemory(max_items=10000)`
- **Severity:** CRITICAL
- **Details:** Accumulates unbounded in-memory with large SQL results/charts per conversation
- **Action:** Implement memory eviction or bounded storage

### 4. Injectable `datetime_recent()` API
- **Source:** Database Audit
- **Location:** `services/db_compat.py:135`
- **Severity:** CRITICAL
- **Details:** Uses unparameterized f-string for column and interval arguments. Currently safe (hardcoded callers only) but the API design is inherently injectable
- **Action:** Refactor to use parameterized queries or explicit whitelist validation

### 5. Missing Ticker Validation on Entity Routes
- **Source:** Security, Database, API Audits (3 audits flagged this)
- **Location:** `api/routes/entities.py`, `api/routes/sqlite_entities.py`
- **Severity:** CRITICAL
- **Details:** Uses `_normalize_ticker()` instead of `validate_ticker()`, bypassing regex validation
- **Action:** Apply `validate_ticker()` consistently on all ticker-accepting endpoints

### 6. Non-Reproducible Python Builds
- **Source:** Dependency Audit
- **Severity:** CRITICAL
- **Details:** 5 packages exceed requirements.txt upper bounds (openai, plotly, redis, yfinance, lxml). No lock file exists
- **Action:** Fix version bounds and add pip-compile lock file

### 7. Zero Test Coverage on Core Product Feature
- **Source:** Test Audit
- **Severity:** CRITICAL
- **Details:** Vanna Agent query pipeline (NL -> SQL -> response) has ZERO tests. This is the core product feature
- **Action:** Add integration tests for the Vanna query flow

---

## HIGH Severity Findings (Fix This Sprint)

### Blocking Async Handlers
- **Source:** API, Performance, Error Handling Audits
- Auth routes call sync PostgreSQL+bcrypt without `asyncio.to_thread()`
- `fetch_tasi_index()` and `fetch_stock_ohlcv()` block event loop for 1-10s each
- **Action:** Wrap all sync I/O in `asyncio.to_thread()`

### Frontend-Backend Type Mismatches
- **Source:** API Audit
- `MarketMover` type has wrong field names (`company_name_ar/en` vs `short_name`)
- `getMarketMovers()` expects array but backend returns wrapper object
- 5+ field name mismatches across dividend, financial summary, batch quotes
- **Action:** Sync TypeScript types with actual API responses

### SSE Race Condition
- **Source:** SSE Audit (SSE-01/09)
- `asyncio.Event.set()` immediately followed by `.clear()` means SSE waiters may miss notifications
- Module-level `asyncio.Event` bound to wrong event loop in multi-worker scenarios
- **Action:** Use `asyncio.Condition` or event queues instead

### Frontend Bundle Size
- **Source:** Performance, Dependency Audits
- plotly.js (~3.5MB), swagger-ui-react (~2.5MB), xlsx (~800KB), jspdf (~500KB) loaded without lazy loading
- **Action:** Use `next/dynamic` for heavy imports

### Vulnerable Dependencies
- **Source:** Dependency Audit
- Next.js 14.2.35: 2 HIGH DoS CVEs (upgrade to 15.6.0+)
- xlsx: CRITICAL+HIGH CVEs with NO FIX (replace with exceljs)
- **Action:** Upgrade Next.js, replace xlsx

### Sequential News Scraping
- **Source:** Performance Audit (PERF-32)
- 5 sources fetched sequentially (worst case ~300s per cycle)
- **Action:** Parallelize with `ThreadPoolExecutor`

### app.py Monolith
- **Source:** Architecture Audit
- 778 lines handling 16 distinct responsibilities
- **Action:** Split into modules (agent setup, middleware, routes, lifespan)

---

## MEDIUM Severity Patterns (Plan for Next Sprint)

| Pattern | Audits Flagging It | Count |
|---|---|---|
| Missing error.tsx on 4 routes | Frontend, Error Handling | 2 |
| LIKE wildcard injection | Database, Security | 2 |
| In-memory rate limiter not shared across workers | Middleware, Security | 2 |
| Inconsistent auth error formats | Middleware, API | 2 |
| Deprecated `datetime.utcnow()` (14 occurrences) | Backend | 1 |
| Widget providers lack CircuitBreaker | SSE, Error Handling | 2 |
| MarketOverviewClient 1085 lines | Frontend | 1 |
| Duplicate DB compatibility layers | Architecture | 1 |
| Inconsistent API versioning (/api/ vs /api/v1/) | Architecture | 1 |
| 12 inline SQL queries not in queries.py | Database | 1 |
| No coverage reporting in CI | Config, Test | 2 |
| tasi_index.py / stock_ohlcv.py ~200 line duplication | Backend | 1 |

---

## Positive Findings (What's Working Well)

- **SQL Injection Protection:** All user-facing queries use parameterized execution
- **Zero `dangerouslySetInnerHTML`** in React frontend
- **Bcrypt password hashing** correctly implemented
- **JWT implementation** is sound
- **CORS has explicit origins** (not wildcard)
- **Error handler middleware** catches all unhandled exceptions
- **Structured JSON logging** with IP anonymization
- **Multi-tier fallback chains** (cache -> live -> stale -> mock) for TASI/OHLCV
- **TypeScript strict mode** enabled, only 3 justified `any` usages
- **SSR compatibility** - all window/document access properly guarded
- **Zero circular imports**, zero wildcard imports, zero bare `except:`
- **All licenses permissive** (MIT, Apache-2.0, BSD, ISC)
- **Auth/JWT test coverage excellent** (30+ tests)
- **SQL injection prevention tests** comprehensive (40+ tests)
- **.env.example** is exemplary (60+ vars, well-categorized)

---

## Recommended Fix Priority

### Immediate (Today)
1. Rotate all leaked credentials (Anthropic API key, Redis, PostgreSQL)
2. Expand `.gitignore` for `.env.*` patterns

### This Week
3. Fix global `_fetch_lock` -> per-ticker locks
4. Add `validate_ticker()` to all entity routes
5. Wrap blocking sync calls in `asyncio.to_thread()`
6. Fix frontend-backend type mismatches (MarketMover, etc.)

### This Sprint
7. Add Vanna query pipeline integration tests
8. Fix requirements.txt bounds + add lock file
9. Upgrade Next.js to 15.6.0+, replace xlsx with exceljs
10. Lazy-load heavy frontend bundles (plotly, swagger-ui)
11. Fix SSE race condition (asyncio.Event -> Condition)
12. Parallelize news scraper
13. Split app.py monolith

### Next Sprint
14. Add missing error.tsx for 4 routes
15. Decompose MarketOverviewClient (1085 lines)
16. Add CircuitBreaker to widget providers
17. Consolidate duplicate DB compatibility layers
18. Standardize API versioning
19. Add coverage reporting to CI
20. Replace deprecated `datetime.utcnow()` calls

---

## Individual Audit Reports

| # | Report | File |
|---|--------|------|
| 1 | Security Vulnerability Audit | `analysis/SECURITY_AUDIT.md` |
| 2 | API Endpoint Completeness Audit | `analysis/API_AUDIT.md` |
| 3 | Database & SQL Query Audit | `analysis/DATABASE_AUDIT_V2.md` |
| 4 | Performance & Scalability Audit | `analysis/PERFORMANCE_AUDIT.md` |
| 5 | Error Handling & Resilience Audit | `analysis/ERROR_HANDLING_AUDIT.md` |
| 6 | Frontend Code Quality Audit | `analysis/FRONTEND_AUDIT.md` |
| 7 | Backend Code Quality Audit | `analysis/BACKEND_AUDIT.md` |
| 8 | Test Coverage & Quality Audit | `analysis/TEST_AUDIT.md` |
| 9 | Configuration & Environment Audit | `analysis/CONFIG_AUDIT.md` |
| 10 | Middleware & Cross-cutting Audit | `analysis/MIDDLEWARE_AUDIT.md` |
| 11 | SSE & Real-time Systems Audit | `analysis/SSE_AUDIT.md` |
| 12 | Dependency & Supply Chain Audit | `analysis/DEPENDENCY_AUDIT.md` |
| 13 | Architecture & Design Pattern Audit | `analysis/ARCHITECTURE_AUDIT.md` |
| 14 | Documentation & Code Comments Audit | `analysis/DOCUMENTATION_AUDIT.md` |
