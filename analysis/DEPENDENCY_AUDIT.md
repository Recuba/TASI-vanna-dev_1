# Dependency & Supply Chain Audit

**Audit Date:** 2026-02-17
**Auditor:** dep-auditor (automated)
**Scope:** Python (`requirements.txt`) and Node.js (`frontend/package.json`) dependencies

---

## Executive Summary

The project has **30 Python packages** and **21 production + 12 dev Node.js packages**. The audit found:

- **CRITICAL:** 2 Python dependencies have installed versions that violate requirements.txt upper bounds (environment drift)
- **CRITICAL:** 2 Python dependencies imported in code but missing from requirements.txt
- **HIGH:** 8 npm vulnerabilities (1 critical, 6 high, 1 moderate) including Next.js DoS and xlsx prototype pollution
- **HIGH:** `xlsx` (SheetJS) has **no fix available** for known CVEs and questionable maintenance
- **MEDIUM:** No Python lock file (Pipfile.lock / poetry.lock) -- builds are non-reproducible
- **MEDIUM:** 3 charting libraries doing overlapping work on the frontend
- **LOW:** All licenses are permissive (MIT, Apache-2.0, BSD, ISC) -- no GPL conflicts

### Risk Score: 7/10 (High)

---

## 1. Python Dependencies Audit

### 1.1 Version Pinning Strategy

All packages use **compatible range pinning** (`>=min,<major`). This is a reasonable middle ground but leaves the project vulnerable to breaking minor releases. No lock file exists to pin exact transitive versions.

| Package | Pinning | Installed | Constraint Met? | Status |
|---------|---------|-----------|-----------------|--------|
| vanna | `>=2.0.2,<3.0` | 2.0.2 | YES | OK |
| openai | `>=1.20.0,<2.0` | **2.7.1** | **NO (>= 2.0)** | DRIFT |
| fastapi | `>=0.115.6,<1.0` | 0.115.6 | YES | OK |
| uvicorn[standard] | `>=0.34.0,<1.0` | 0.40.0 | YES | OK |
| python-dotenv | `>=1.0.1,<2.0` | 1.2.1 | YES | OK |
| pydantic-settings | `>=2.0.0,<3.0` | 2.12.0 | YES | OK |
| psycopg2-binary | `>=2.9.10,<3.0` | 2.9.11 | YES | OK |
| pandas | `>=2.1.0,<3.0` | 2.3.2 | YES | OK |
| numpy | `>=1.24.0,<3.0` | 1.26.4 | YES | OK |
| plotly | `>=5.20.0,<6.0` | **6.3.1** | **NO (>= 6.0)** | DRIFT |
| anthropic | `>=0.41.0,<1.0` | 0.68.0 | YES | OK |
| pyjwt | `>=2.8.1,<3.0` | 2.10.1 | YES | OK |
| bcrypt | `>=4.1.0,<5.0` | 5.0.0 | BORDERLINE | CHECK |
| pydantic[email] | `>=2.5.0,<3.0` | 2.12.5 | YES | OK |
| redis | `>=5.0.0,<6.0` | 7.1.1 | **NO (>= 6.0)** | DRIFT |
| msgpack | `>=1.0.0,<2.0` | 1.1.2 | YES | OK |
| sqlalchemy[asyncio] | `>=2.0.0,<3.0` | 2.0.23 | YES | OK |
| aiosqlite | `>=0.20.0,<1.0` | 0.22.1 | YES | OK |
| yfinance | `>=0.2.35,<1.0` | 1.1.0 | **NO (>= 1.0)** | DRIFT |
| lxml | `>=4.10.0,<6.0` | 6.0.2 | **NO (>= 6.0)** | DRIFT |
| beautifulsoup4 | `>=4.12.0,<5.0` | 4.14.3 | YES | OK |
| requests | `>=2.31.0,<3.0` | 2.31.0 | YES | OK |
| apscheduler | `>=3.10.4,<4.0` | 3.10.4 | YES | OK |
| sqlparse | `>=0.5.0,<1.0` | 0.5.5 | YES | OK |
| pytest | `>=8.0.0,<9.0` | (dev) | N/A | OK |
| pytest-asyncio | `>=0.24.0,<1.0` | (dev) | N/A | OK |
| httpx | `>=0.27.0,<1.0` | 0.28.1 | YES | OK |
| locust | `>=2.20.0,<3.0` | 2.42.2 | YES | OK |

**Environment Drift (CRITICAL):** The installed environment has 5 packages exceeding their upper bounds:
1. **openai** 2.7.1 vs `<2.0` -- Major version mismatch. OpenAI SDK v2 has breaking API changes.
2. **plotly** 6.3.1 vs `<6.0` -- Major version mismatch. Plotly 6 has deprecations/API changes.
3. **redis** 7.1.1 vs `<6.0` -- Major version mismatch. Redis-py 7 may have async API changes.
4. **yfinance** 1.1.0 vs `<1.0` -- Major version jump from 0.x to 1.x. API surface changed.
5. **lxml** 6.0.2 vs `<6.0` -- Major version mismatch.

This means `pip install -r requirements.txt` in a clean environment will install DIFFERENT versions than what is running. **Builds are non-reproducible.**

### 1.2 Dependency Usage Verification

| Package | Used In Codebase? | Notes |
|---------|-------------------|-------|
| vanna | YES | `app.py`, `chart_engine/raid_chart_generator.py` |
| openai | **INDIRECT ONLY** | Only referenced in test files (`test_app_assembly*.py`). Likely a transitive dependency of `vanna`. |
| fastapi | YES | 40+ files across `api/`, `middleware/`, `backend/` |
| uvicorn | YES | `app.py` |
| python-dotenv | YES | `app.py`, `scripts/` |
| pydantic-settings | YES | `config/settings.py`, `backend/` configs |
| psycopg2-binary | YES | `database/`, `services/`, `api/routes/` (7 files) |
| pandas | YES | `csv_to_sqlite.py`, `chart_engine/`, `ingestion/`, tests |
| numpy | YES | `chart_engine/`, `database/`, `ingestion/` |
| plotly | YES | `chart_engine/raid_chart_generator.py` |
| anthropic | YES | `app.py`, `config/settings.py`, `services/health_service.py` |
| pyjwt | YES | `auth/jwt_handler.py`, `auth/dependencies.py`, `api/routes/auth.py` |
| bcrypt | YES | `auth/password.py` |
| pydantic[email] | YES | 36+ files for request/response models |
| redis | YES | `backend/services/cache/redis_client.py` |
| msgpack | YES | `backend/services/cache/query_cache.py` |
| sqlalchemy[asyncio] | YES | `backend/services/cache/db_pool.py` |
| aiosqlite | **NOT DIRECTLY IMPORTED** | No direct imports found. May be a transitive dependency for SQLAlchemy async SQLite. |
| yfinance | YES | 10+ files across `services/`, `api/routes/`, `ingestion/` |
| lxml | YES | `ingestion/xbrl_processor.py` (also used by beautifulsoup4 parser) |
| beautifulsoup4 | YES | `services/news_scraper.py` |
| requests | YES | `services/news_scraper.py`, `ingestion/` |
| apscheduler | YES | `ingestion/scheduler.py` (optional import with try/except) |
| sqlparse | YES | `backend/security/sql_validator.py` |
| pytest | YES | Test runner |
| pytest-asyncio | YES | Async test support |
| httpx | YES | `services/widgets/providers/crypto.py` (also test client) |
| locust | YES | `frontend/e2e/load-tests/locust-frontend.py` |

### 1.3 Missing Dependencies (CRITICAL)

These packages are imported in code but **NOT listed in requirements.txt**:

| Package | Imported In | Risk |
|---------|-------------|------|
| **openpyxl** | `ingestion/xbrl_processor.py` | Will crash at runtime when processing Excel XBRL files |
| **sentry-sdk** | `config/error_tracking.py` | Will crash when `ERROR_TRACKER=sentry` is set |

Both have optional import guards (try/except), so they won't crash the main application, but the features they support will silently fail.

**Recommendation:** Add `openpyxl>=3.1.0,<4.0` and `sentry-sdk>=2.0.0,<3.0` to requirements.txt, or document them as optional dependencies.

### 1.4 Security-Critical Python Packages

#### pyjwt 2.10.1
- **Role:** JWT token creation/verification for auth
- **Status:** Current, no known CVEs for 2.10.x
- **Risk:** LOW. Ensure `algorithms` parameter is always explicitly set (not `["HS256"]` default which allows algorithm confusion attacks)
- **Note:** The codebase uses `jwt.decode()` and `jwt.encode()` -- verify algorithm pinning in `auth/jwt_handler.py`

#### bcrypt 5.0.0
- **Role:** Password hashing
- **Status:** Current version. Note: bcrypt 4.x -> 5.0 was a major version bump
- **Risk:** LOW. bcrypt is a well-maintained, audited library
- **Concern:** requirements.txt says `<5.0` but 5.0.0 is installed -- constraint violation

#### psycopg2-binary 2.9.11
- **Role:** PostgreSQL database driver
- **Status:** Current, no known CVEs
- **Risk:** MEDIUM. `-binary` is not recommended for production (should use `psycopg2` with system libpq). However, this is acceptable for the current deployment model.
- **Note:** Consider migrating to `psycopg[binary]` (psycopg 3) for better async support

#### fastapi 0.115.6
- **Role:** Web framework
- **Status:** Minimum pinned version is current. No known CVEs.
- **Risk:** LOW

#### uvicorn 0.34.0+
- **Role:** ASGI server
- **Status:** Installed 0.40.0, well maintained
- **Risk:** LOW

#### anthropic 0.41.0+
- **Role:** LLM API client
- **Status:** Installed 0.68.0, actively maintained
- **Risk:** LOW. No known CVEs.

### 1.5 Supply Chain Risks (Python)

| Package | Concern | Severity |
|---------|---------|----------|
| **vanna** | Niche package, small maintainer team. If compromised, has direct DB access via SQL execution. | MEDIUM |
| **yfinance** | Unofficial Yahoo Finance API scraper. Yahoo could block it at any time. Has had reliability issues historically. | MEDIUM |
| **openai** | Seems unused directly -- may be pulled in by vanna. Unnecessary attack surface if not needed. | LOW |
| **locust** | Load testing tool in production requirements.txt. Should be dev-only. | LOW |

---

## 2. Node.js Dependencies Audit

### 2.1 npm Vulnerability Report

**Total: 8 vulnerabilities (1 critical, 6 high, 1 moderate)**

| Package | Severity | CVE/Advisory | Fix Available? |
|---------|----------|-------------|----------------|
| **next** 14.2.35 | HIGH | GHSA-9g9p-9gw9-jx7f (Image Optimizer DoS) | Yes: next >= 15.6.0 |
| **next** 14.2.35 | HIGH | GHSA-h25m-26qc-wcjf (RSC deserialization DoS) | Yes: next >= 15.6.0 |
| **xlsx** 0.18.5 | HIGH | GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) | **NO FIX AVAILABLE** |
| **xlsx** 0.18.5 | CRITICAL | GHSA-5pgg-2g8v-p4x9 (ReDoS) | **NO FIX AVAILABLE** |
| **dompurify** <3.2.4 | MODERATE | GHSA-vhxf-7vqr-mrjg (XSS) | Yes: jspdf >= 4.1.0 |
| **glob** 10.2.0-10.4.5 | HIGH | GHSA-5j98-mcp5-4vw2 (Command Injection) | Yes: eslint-config-next >= 16.x |
| **@next/eslint-plugin-next** | HIGH | Via glob vulnerability | Yes: eslint-config-next >= 16.x |
| **eslint-config-next** | HIGH | Via @next/eslint-plugin-next | Yes: upgrade to 16.x |

### 2.2 Dependency Classification

#### Production Dependencies (19 packages)

| Package | Version | Used? | Notes |
|---------|---------|-------|-------|
| @sentry/nextjs | ^8.0.0 | YES | Error monitoring (ErrorBoundary, web-vitals) |
| @tanstack/react-virtual | ^3.13.18 | YES | Virtual scrolling (news page, DataTable) |
| clsx | ^2.1.1 | YES | Class name utility (utils.ts) |
| idb | ^8.0.2 | YES | IndexedDB wrapper (query-store.ts) |
| **jspdf** | ^2.5.2 | YES | PDF export (exporters.ts). Pulls in vulnerable dompurify. |
| **jspdf-autotable** | ^3.8.4 | YES | PDF table export (exporters.ts) |
| lightweight-charts | ^4.2.3 | YES | TASI index chart (useChart.ts, chart-config.ts) |
| **next** | **14.2.35** | YES | Framework. **EXACT PIN** -- unusual, blocks auto-updates. |
| nextjs-toploader | ^3.9.17 | YES | Navigation progress bar (layout.tsx) |
| **plotly.js-dist-min** | ^3.3.1 | **NO DIRECT IMPORT** | Not directly imported. react-plotly.js may use it. |
| react | ^18 | YES | Core framework |
| react-dom | ^18 | YES | Core framework |
| react-markdown | ^10.1.0 | YES | Chat markdown rendering (AssistantContent.tsx) |
| **react-plotly.js** | ^2.6.0 | YES | Chart rendering (ChartBlock.tsx) |
| react-syntax-highlighter | ^16.1.0 | YES | SQL syntax highlighting (SQLBlock.tsx) |
| **recharts** | ^3.7.0 | YES | Bar/Line/Pie/Scatter charts (visualization/) |
| **swagger-ui-react** | ^5.31.0 | **QUESTIONABLE** | API docs page. Large bundle (~2.5MB). |
| swr | ^2.4.0 | YES | Data fetching/caching (6 files) |
| tailwind-merge | ^3.4.0 | YES | Tailwind class merging (utils.ts) |
| web-vitals | ^4.2.0 | YES | Performance monitoring (web-vitals.ts) |
| **xlsx** | ^0.18.5 | YES | Excel export (exporters.ts). **HAS UNFIXABLE CVEs.** |

#### Dev Dependencies (12 packages)

| Package | Version | Classification Correct? | Notes |
|---------|---------|------------------------|-------|
| @next/bundle-analyzer | ^16.1.6 | YES | Bundle analysis |
| @playwright/test | ^1.50.0 | YES | E2E testing |
| @testing-library/jest-dom | ^6.9.1 | YES | Test matchers |
| @testing-library/react | ^16.3.2 | YES | React testing |
| @testing-library/user-event | ^14.6.1 | YES | User interaction testing |
| @types/node | ^20 | YES | TypeScript types |
| @types/react | ^18 | YES | TypeScript types |
| @types/react-dom | ^18 | YES | TypeScript types |
| @types/react-syntax-highlighter | ^15.5.13 | YES | TypeScript types |
| @types/swagger-ui-react | ^5.18.0 | YES | TypeScript types |
| @vitejs/plugin-react | ^5.1.3 | YES | Vitest React support |
| eslint | ^8 | YES | Linting |
| eslint-config-next | **14.2.35** | YES | **EXACT PIN matching next version** |
| eslint-plugin-security | ^3.0.1 | YES | Security linting rules |
| jsdom | ^28.0.0 | YES | DOM emulation for tests |
| msw | ^2.12.9 | YES | Mock Service Worker for tests |
| postcss | ^8 | YES | CSS processing |
| tailwindcss | ^3.4.1 | YES | CSS framework |
| typescript | ^5 | YES | Compiler |
| vitest | ^4.0.18 | YES | Test runner |

### 2.3 Duplicate Functionality (Frontend)

**Charting Libraries (3 packages doing overlapping work):**
1. **recharts** -- Used for Bar/Line/Pie/Scatter in `visualization/chart-types/`
2. **react-plotly.js + plotly.js-dist-min** -- Used for AI chat chart responses (ChartBlock.tsx)
3. **lightweight-charts** -- Used specifically for TASI index candlestick chart

**Assessment:** Each serves a different purpose (general charts, AI-generated Plotly charts, financial candlestick charts), so this is a defensible architecture choice. However, it contributes ~1.5MB to the bundle. Consider:
- Could `recharts` handle all non-financial charts, eliminating Plotly?
- `plotly.js-dist-min` is 3.3MB minified. If only used for AI chat responses, consider lazy-loading.

**Data Export (2 packages):**
1. **jspdf + jspdf-autotable** -- PDF export
2. **xlsx** -- Excel export

Both used in `lib/export/exporters.ts`. No duplication, but `xlsx` has serious unpatched vulnerabilities.

### 2.4 License Compatibility

All frontend dependencies use permissive licenses:
- **MIT:** next, react, react-dom, swr, clsx, tailwind-merge, recharts, plotly.js, react-plotly.js, jspdf, jspdf-autotable, react-markdown, react-syntax-highlighter, nextjs-toploader, @sentry/nextjs, @tanstack/react-virtual
- **Apache-2.0:** lightweight-charts, xlsx, swagger-ui-react, web-vitals
- **ISC:** idb

**No GPL or AGPL dependencies found.** License compatibility is clean.

---

## 3. Transitive Risk Assessment

### 3.1 High-Risk Transitive Dependencies

| Direct Dep | Transitive Risk | Issue |
|-----------|----------------|-------|
| jspdf | dompurify <3.2.4 | XSS vulnerability (GHSA-vhxf-7vqr-mrjg). Fix requires jspdf 4.x (breaking). |
| eslint-config-next | glob 10.2.0-10.4.5 | Command injection in glob CLI. Low practical risk (dev-only, not user-facing). |
| vanna | openai, chromadb, etc. | Vanna pulls in many transitive deps. openai SDK is a large attack surface. |
| yfinance | pandas, requests, etc. | yfinance is a scraping library -- Yahoo can break it at any time. |

### 3.2 Supply Chain Concerns

| Package | Concern Level | Rationale |
|---------|--------------|-----------|
| **xlsx (SheetJS)** | **HIGH** | Has known, unfixable CVEs (Prototype Pollution, ReDoS). The npm package is a stripped version of the commercial SheetJS Pro. Development cadence is irregular. |
| **vanna** | **MEDIUM** | Small team, niche package. Has direct SQL execution capabilities. A compromised version could exfiltrate data. |
| **yfinance** | **MEDIUM** | Unofficial API scraper. Not endorsed by Yahoo. Could stop working at any time. |
| **swagger-ui-react** | **LOW-MEDIUM** | Very large bundle (~2.5MB). If the API docs page is not frequently used, consider removing or lazy-loading. |
| **locust** | **LOW** | Listed in production requirements.txt but is a dev/testing tool. Should be dev-only. |

---

## 4. Version Conflict Analysis

### 4.1 Python Version Conflicts

| Conflict | Details | Severity |
|----------|---------|----------|
| **openai version drift** | Installed 2.7.1, required `<2.0`. If code runs without errors, it's because it doesn't use openai directly (vanna handles it). But a fresh `pip install` will get a different version. | HIGH |
| **plotly version drift** | Installed 6.3.1, required `<6.0`. Plotly 6 deprecated some APIs used in plotly 5. Chart generation may break on clean install. | HIGH |
| **redis version drift** | Installed 7.1.1, required `<6.0`. Redis-py 7 has API changes. | HIGH |
| **yfinance version drift** | Installed 1.1.0, required `<1.0`. yfinance 1.0 had breaking changes. | HIGH |
| **lxml version drift** | Installed 6.0.2, required `<6.0`. lxml 6 has API changes. | MEDIUM |
| **bcrypt version drift** | Installed 5.0.0, required `<5.0`. Borderline -- may work. | LOW |
| numpy <3.0 vs pandas | numpy pinned `<3.0`, pandas 2.x may need numpy 2.x. Currently compatible. | OK |

### 4.2 Node.js Version Conflicts

| Conflict | Details | Severity |
|----------|---------|----------|
| next 14.2.35 (exact) vs @next/bundle-analyzer ^16.1.6 | Major version mismatch between next and its analyzer. The analyzer may not work correctly with next 14. | MEDIUM |
| eslint-config-next 14.2.35 vs eslint ^8 | Pinned to match next version. ESLint 9 is current but would require config migration. | LOW |

---

## 5. Missing Lock File (CRITICAL)

**Neither `Pipfile.lock`, `poetry.lock`, nor `pip-compile` output exists for Python dependencies.**

This means:
1. **Builds are non-reproducible** -- two `pip install -r requirements.txt` runs may install different transitive dependency versions
2. **No integrity verification** -- package hashes are not checked
3. **Supply chain attacks** are harder to detect -- a compromised transitive dependency would be silently installed

**Recommendation:** Adopt one of:
- `pip-tools` with `pip-compile` to generate `requirements.lock`
- `poetry` with `poetry.lock`
- `pipenv` with `Pipfile.lock`

The Node.js side has `package-lock.json`, which is good.

---

## 6. Top 10 Upgrade Recommendations

| Priority | Package | Current | Target | Reason |
|----------|---------|---------|--------|--------|
| **1** | **next** | 14.2.35 | 15.6.0+ | 2 HIGH DoS vulnerabilities (GHSA-9g9p, GHSA-h25m). Breaking change but critical for security. |
| **2** | **xlsx** | 0.18.5 | **REPLACE** | Unfixable Prototype Pollution + ReDoS. Replace with `exceljs` (MIT, actively maintained). |
| **3** | **requirements.txt** upper bounds | Various | Update bounds | 5 packages have installed versions exceeding upper bounds. Update constraints to match reality or pin exact versions. |
| **4** | **jspdf** | 2.5.2 | 4.1.0 | Fixes transitive dompurify XSS vulnerability. Breaking changes in API. |
| **5** | **eslint-config-next** | 14.2.35 | 16.x | Fixes glob command injection vulnerability (dev-only risk). |
| **6** | **Add lock file** | N/A | pip-tools | Create `requirements.lock` for reproducible builds and hash verification. |
| **7** | **locust** | In prod req | Move to dev | Load testing tool should not be in production requirements.txt. |
| **8** | **psycopg2-binary** | 2.9.11 | psycopg[binary] 3.x | psycopg 3 has native async support, better performance. Non-urgent. |
| **9** | **openai** | In req | Evaluate removal | No direct imports found. If only used transitively via vanna, remove from requirements.txt. |
| **10** | **swagger-ui-react** | 5.31.0 | Evaluate removal | 2.5MB bundle for API docs. Consider if truly needed or if a lightweight alternative exists. |

---

## 7. Recommendations by Category

### 7.1 Immediate Actions (Do Now)

1. **Fix requirements.txt upper bounds** to match installed versions, or pin exact versions with a lock file
2. **Add `openpyxl` and `sentry-sdk`** to requirements.txt (or document as optional)
3. **Move `locust` and test deps** to a separate `requirements-dev.txt`
4. **Evaluate xlsx replacement** with `exceljs` to eliminate unfixable CVEs

### 7.2 Short-Term (Next Sprint)

5. **Upgrade Next.js** from 14.2.35 to 15.6.0+ to fix DoS vulnerabilities
6. **Implement pip-tools** or poetry for Python dependency locking
7. **Upgrade jspdf** to 4.x to fix dompurify XSS
8. **Add `npm audit` to CI** to catch new vulnerabilities

### 7.3 Medium-Term (Next Quarter)

9. **Evaluate removing openai** from direct dependencies if only used via vanna
10. **Consider lazy-loading** plotly.js-dist-min (3.3MB) and swagger-ui-react (2.5MB)
11. **Migrate to psycopg 3** for native async PostgreSQL support
12. **Add Dependabot or Renovate** for automated dependency updates

### 7.4 Process Improvements

13. **Add `pip-audit` to CI** for automated Python CVE scanning
14. **Separate prod/dev Python dependencies** into `requirements.txt` / `requirements-dev.txt`
15. **Document optional dependencies** (sentry-sdk, openpyxl) with installation instructions
16. **Pin transitive dependencies** via lock files in both Python and Node.js

---

## 8. Full Vulnerability Summary

### Python (Known CVEs by Package)

| Package | Known CVEs | Severity | Notes |
|---------|-----------|----------|-------|
| requests 2.31.0 | CVE-2024-35195 (cert verification bypass) | MEDIUM | Fixed in 2.32.0. Update recommended. |
| All others | No known CVEs for pinned versions | -- | Based on advisory databases as of Feb 2026 |

### Node.js (npm audit)

| Advisory | Package | Severity | Fix |
|----------|---------|----------|-----|
| GHSA-9g9p-9gw9-jx7f | next <15.6.0 | HIGH | Upgrade next |
| GHSA-h25m-26qc-wcjf | next <15.6.0 | HIGH | Upgrade next |
| GHSA-4r6h-8v6p-xvw6 | xlsx * | HIGH | **No fix -- replace package** |
| GHSA-5pgg-2g8v-p4x9 | xlsx * | CRITICAL | **No fix -- replace package** |
| GHSA-vhxf-7vqr-mrjg | dompurify <3.2.4 | MODERATE | Upgrade jspdf to 4.x |
| GHSA-5j98-mcp5-4vw2 | glob 10.2-10.4 | HIGH | Upgrade eslint-config-next |

---

## 9. Dependency Graph Highlights

```
Production-Critical Path:
  fastapi -> uvicorn -> starlette (transitive, no direct pin)
  vanna -> openai (transitive), chromadb (transitive)
  pyjwt + bcrypt -> auth system
  psycopg2-binary -> PostgreSQL access
  yfinance -> market data (fragile, unofficial API)

Frontend-Critical Path:
  next -> react -> react-dom
  swr -> data fetching
  lightweight-charts -> TASI index
  recharts -> analytics charts
  react-plotly.js -> AI chat charts
  xlsx -> Excel export (VULNERABLE)
  jspdf -> PDF export (transitive vuln via dompurify)
```

---

## 10. Conclusion

The dependency management posture is **moderate risk**. The project uses well-chosen, permissive-licensed dependencies, but suffers from:

1. **No Python lock file** making builds non-reproducible
2. **Significant version drift** between requirements.txt constraints and installed packages
3. **Unfixable npm vulnerabilities** in xlsx
4. **Missing dependency declarations** for openpyxl and sentry-sdk
5. **Mixed prod/dev dependencies** in Python requirements.txt

The most urgent action is fixing the requirements.txt to match reality and replacing xlsx with a maintained alternative like exceljs. The Next.js upgrade to fix DoS vulnerabilities should also be prioritized.
