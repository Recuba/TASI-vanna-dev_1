# Frontend Documentation Plan (Task #8)

## Overview
Create 6 documentation files across 4 phases: STATUS_FRONTEND.md, OpenAPI spec, api-docs page, PRIVACY.md, SLA.md, and update frontend/.env.local.example.

---

## Phase 1: STATUS_FRONTEND.md (immediate)

**File:** `STATUS_FRONTEND.md` (project root)

Create cross-terminal coordination file with sections:
- **Completed:** List Phase 1 security headers work (Task #1/#9 already completed)
- **In Progress:** List all active teammate tasks (#2 monitoring, #3 perf, #4 RBAC, #5 UX-history, #6 visualization, #7 testing)
- **New Environment Variables:** All NEXT_PUBLIC_* env vars discovered from next.config.mjs and teammate outputs:
  - `NEXT_PUBLIC_API_URL` (already exists)
  - `NEXT_PUBLIC_CSP_REPORT_URI` (from next.config.mjs)
  - `NEXT_PUBLIC_SENTRY_DSN` (from @sentry/nextjs in package.json)
  - `NEXT_PUBLIC_ENABLE_MONITORING` (from monitoring teammate)
  - `NEXT_PUBLIC_SESSION_TIMEOUT` (from auth teammate)
  - `NEXT_PUBLIC_AUTH_REDIRECT` (from auth teammate)
  - `NEXT_PUBLIC_ALLOWED_HOSTS` (from security headers)
- **New Dependencies:** swagger-ui-react (for api-docs page)
- **Interface Contracts for Terminal A:**
  - Security headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, etc. (from next.config.mjs)
  - CSRF token header: X-CSRF-Token
  - Expected backend headers: X-Request-ID, Retry-After (from rate limiter)
  - Consumed endpoints: GET /health, GET /health/live, GET /health/ready
- **Frontend Route Protection:** Route-to-role mapping from login page and RBAC patterns
- **Notes for Terminal A:** Backend compatibility notes

---

## Phase 3: OpenAPI Spec + API Docs Page + PRIVACY.md

### Task 2a: OpenAPI Spec
**File:** `frontend/public/api-docs/openapi.yaml`

Document all API endpoints discovered from api-client.ts:
- **Health:** GET /health, GET /health/live, GET /health/ready
- **Auth:** POST /api/auth/register, POST /api/auth/login, POST /api/auth/guest, POST /api/auth/refresh, GET /api/auth/me
- **News:** GET /api/news, GET /api/news/ticker/{ticker}
- **Reports:** GET /api/reports, GET /api/reports/ticker/{ticker}
- **Announcements:** GET /api/announcements
- **Entities:** GET /api/entities, GET /api/entities/{ticker}, GET /api/entities/sectors
- **Watchlists:** GET /api/watchlists, POST /api/watchlists, PATCH /api/watchlists/{id}, DELETE /api/watchlists/{id}
- **Charts:** GET /api/charts/sector-market-cap, GET /api/charts/top-companies, GET /api/charts/sector-pe, GET /api/charts/dividend-yield-top
- **OHLCV:** GET /api/v1/charts/{ticker}/ohlcv
- **TASI Index:** GET /api/v1/charts/tasi/index
- **News Feed:** GET /api/v1/news/feed, GET /api/v1/news/feed/{id}, GET /api/v1/news/search, GET /api/v1/news/sources
- **Market Analytics:** GET /api/v1/market/movers, GET /api/v1/market/summary, GET /api/v1/market/sectors, GET /api/v1/market/heatmap
- **Stock Data:** GET /api/v1/stocks/{ticker}/dividends, GET /api/v1/stocks/{ticker}/summary, GET /api/v1/stocks/{ticker}/financials, GET /api/v1/stocks/compare, GET /api/v1/stocks/quotes

Include: JWT Bearer auth, rate limit headers, standard error responses (400, 401, 403, 404, 429, 500, 503).

### Task 2b: Swagger UI Page
**File:** `frontend/src/app/api-docs/page.tsx`

- Dark-themed Swagger UI page using swagger-ui-react
- Gold/dark palette matching the design system (#D4A84B, #0E0E0E)
- Loads openapi.yaml from /api-docs/openapi.yaml
- Note: swagger-ui-react needs to be added as dependency

### Task 3: Privacy Policy
**File:** `PRIVACY.md` (project root)

Sections:
- Data Collection: What data is collected (queries, auth info, usage metrics)
- Data Storage: SQLite/PostgreSQL, encryption at rest
- Data Retention: How long data is kept
- User Rights: Access, deletion, export
- Third-Party Services: Anthropic/Gemini LLM, TradingView widgets, Sentry
- Data Flow Diagram: ASCII diagram
- GDPR and Saudi PDPL compliance notes

---

## Phase 4: SLA + Env Reference

### Task 4: SLA Document
**File:** `SLA.md` (project root)

- 99.5% uptime target
- Response time targets: API <500ms p95, chat <5s p95, page load <3s
- Maintenance windows: weekly, scheduled, communicated 24h advance
- Incident severity levels: P1 (total outage), P2 (degraded), P3 (minor), P4 (cosmetic)
- Monitoring tools: Sentry, health endpoints, uptime checks

### Task 5: Frontend Environment Reference
**File:** `frontend/.env.local.example` (update existing)

Consolidate ALL NEXT_PUBLIC_* env vars from all teammates with descriptions, defaults, and required/optional marks. Then update STATUS_FRONTEND.md with final state.

---

## Implementation Order
1. Phase 1: STATUS_FRONTEND.md (immediate)
2. Phase 3: openapi.yaml, api-docs/page.tsx, PRIVACY.md
3. Phase 4: SLA.md, update .env.local.example, update STATUS_FRONTEND.md

## Files Created/Modified
- NEW: STATUS_FRONTEND.md
- NEW: frontend/public/api-docs/openapi.yaml
- NEW: frontend/src/app/api-docs/page.tsx
- NEW: PRIVACY.md
- NEW: SLA.md
- UPDATED: frontend/.env.local.example
