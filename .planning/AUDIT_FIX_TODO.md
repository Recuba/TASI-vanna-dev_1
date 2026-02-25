# Ra'd AI Platform - Audit Fix Master TODO
# Date: 2026-02-12
# 8-Agent Team Assignment

---

## Agent 1: Backend - Entities & Market Analytics (D-1, D-7)
**Files:** `api/routes/sqlite_entities.py`, `api/routes/market_analytics.py`, `app.py` (routing section lines 310-470)

- [x] **Task 1.1: Fix SQLite entities DB path resolution**
  - [x] Verify `_HERE = Path(__file__).resolve().parent.parent.parent` resolves to project root
  - [x] Add logging of resolved path at module load
  - [x] Add `if not Path(_DB_PATH).exists()` guard with clear error message
  - [x] Test `_get_conn()` with proper error handling for missing DB

- [x] **Task 1.2: Fix market analytics DB path resolution**
  - [x] Same path resolution check as entities
  - [x] Add fallback error handling to all 4 endpoints (movers, summary, sectors, heatmap)
  - [x] Wrap SQL queries in try/except with proper HTTP error responses
  - [x] Handle NULL values in float conversions (change_pct, market_cap, volume) via COALESCE + explicit float() casts

- [x] **Task 1.3: Make entities routes available in both backends**
  - [x] In `app.py`, always register sqlite_entities router (section 9g)
  - [x] Removed `/api/entities` and `/api/charts` from PG-only stub list
  - [x] SQLite entities now serves as fallback for both SQLite and PostgreSQL modes

- [x] **Task 1.4: Add market analytics chart endpoints**
  - [x] Created `api/routes/charts_analytics.py` with SQLite-backed chart endpoints
  - [x] Registered in app.py section 9h (always registered as fallback)
  - [x] Endpoints: `/api/charts/sector-market-cap`, `/api/charts/top-companies`, `/api/charts/sector-pe`, `/api/charts/dividend-yield-top`
  - [x] Response format matches `ChartResponse` schema used by PreBuiltCharts.tsx

---

## Agent 2: Backend - News Pipeline (D-2, D-3, D-4)
**Files:** `services/news_scraper.py`, `services/news_store.py`, `services/news_paraphraser.py`, `services/news_scheduler.py`

- [x] **Task 2.1: Fix empty body in scraped articles**
  - [x] Problem: Scrapers only extract summary/excerpt from listing pages, not full article text
  - [x] Add `_fetch_full_article(url)` method to BaseNewsScraper that fetches article URL and extracts body text
  - [x] Call `_fetch_full_article()` for each article when body is empty (via `_enrich_bodies()`)
  - [x] Add timeout (5s) and error handling for individual article fetches (`ARTICLE_FETCH_TIMEOUT`)
  - [x] Respect INTER_REQUEST_DELAY between fetches
  - [x] Limit to MAX_FULL_ARTICLE_FETCHES=5 per source to avoid excessive requests

- [x] **Task 2.2: Fix published_at always null**
  - [x] Audit each scraper's `published_at` extraction logic
  - [x] Updated all scrapers with broader date selectors: `time, [class*='date'], [class*='time'], [datetime]`
  - [x] Add fallback in `_make_article()` when `published_at` is None
  - [x] Store current datetime as published_at fallback: `published_at or datetime.utcnow().isoformat()`

- [x] **Task 2.3: Fix missing news sources (3 of 5)**
  - [x] AlarabiyaScraper: Updated URL to `/aswaq`, added broader CSS selectors with seen_urls dedup
  - [x] AsharqBusinessScraper: Added `_alt_urls` to try multiple URLs, broadened selectors
  - [x] MaaalScraper: Added `_alt_urls` to try multiple paths, broadened WordPress-style selectors
  - [x] Updated CSS selectors to use attribute contains (`[class*='...']`) for resilience
  - [x] Added fallback link strategies for all 5 scrapers
  - [x] Added URL dedup (`seen_urls` set) to all scrapers to prevent duplicates

- [x] **Task 2.4: Improve paraphraser robustness**
  - [x] Check `services/news_paraphraser.py` - handles empty body gracefully
  - [x] Ensure paraphrase_article() doesn't return None or undefined for body
  - [x] Added `or ""` guard for both title and body: `article.get("body") or ""`

---

## Agent 3: Backend - Auth & Chat Access (F-1, F-2)
**Files:** `app.py` (lines 285-310 auth middleware), `auth/jwt_handler.py`, `auth/dependencies.py`, `api/routes/auth.py` (create if needed)

- [x] **Task 3.1: Add guest/anonymous chat access**
  - [x] Modify `_require_chat_auth` middleware in app.py to allow anonymous access
  - [x] Made auth OPTIONAL: valid tokens accepted, missing tokens allowed through, invalid tokens rejected
  - [x] Updated JWTUserResolver to return anonymous user in all backends when no token present
  - [x] Invalid tokens still rejected with 401 to prevent confusion

- [x] **Task 3.2: Create login/register API endpoints**
  - [x] Updated `api/routes/auth.py` with lazy DB imports (works in both backends)
  - [x] Login: POST /api/auth/login (requires PG backend, returns 503 in SQLite mode)
  - [x] Register: POST /api/auth/register (requires PG backend, returns 503 in SQLite mode)
  - [x] Added POST /api/auth/guest - generates anonymous JWT token (works with any backend)
  - [x] Auth router now registered in all modes (not just postgres)

- [x] **Task 3.3: Create frontend login page**
  - [x] Created `frontend/src/app/login/page.tsx`
  - [x] Login form with email/password fields + mode toggle to register
  - [x] Guest access button (one-click anonymous login via /api/auth/guest)
  - [x] Gold/dark theme matching app design system
  - [x] Bilingual (Arabic/English) using useLanguage() / t() pattern
  - [x] On success, stores token via useAuth hook and redirects to ?redirect= or /chat
  - [x] Added `guestLogin()` method to useAuth hook

- [x] **Task 3.4: Update watchlist to work for anonymous users**
  - [x] Removed blocking sign-in screen for unauthenticated users
  - [x] Anonymous users see full watchlist UI using localStorage data
  - [x] Added small "Sign in to sync across devices" banner at top when not authenticated
  - [x] Existing authenticated behavior preserved when user is logged in

---

## Agent 4: Backend - Health Check Enhancement
**Files:** `api/routes/health.py`, `services/health_service.py`, `api/schemas/health.py`

- [x] **Task 4.1: Add entities API check to health service**
  - [x] Add `check_entities()` method to health_service.py
  - [x] Run a simple query against companies table (SELECT COUNT(*) FROM companies)
  - [x] Return HEALTHY if query succeeds, UNHEALTHY with error message if not
  - [x] Add to components list in `get_health()`

- [x] **Task 4.2: Add news scraper check**
  - [x] Add `check_news()` method to health_service.py
  - [x] Check if news_articles table exists and has articles
  - [x] Return HEALTHY if articles exist, DEGRADED if empty, UNHEALTHY if table missing
  - [x] Report source count in message

- [x] **Task 4.3: Add market analytics check**
  - [x] Add `check_market_data()` method
  - [x] Run quick query against market_data table
  - [x] Verify data exists and has non-null change_pct values

- [ ] **Task 4.4: Add chat/LLM availability check**
  - [x] Existing `check_llm()` already reports which provider is active (Gemini/Anthropic/config)
  - [ ] Live API call check deferred (would add latency to health endpoint)

- [x] **Task 4.5: Update health response schema**
  - [x] Ensure `api/schemas/health.py` has `service` field
  - [x] Add `version` field with app version
  - [x] Add `uptime_seconds` field
  - [x] Make the health response backward-compatible (keep existing fields)
  - [x] Add `_STARTUP_TIME` module-level uptime tracking
  - [x] All 8 health tests pass

---

## Agent 5: Frontend - News Page Fixes (F-4, F-5, F-6)
**Files:** `frontend/src/app/news/page.tsx`, `frontend/src/app/news/[id]/page.tsx`

- [x] **Task 5.1: Fix "Showing X of Y" counter when Saved filter active (F-4)**
  - [x] Updated counter to hide when showSaved is active
  - [x] Added dedicated saved articles counter with bilingual text

- [x] **Task 5.2: Fix article 404 raw JSON error (F-5)**
  - [x] Replaced raw error with user-friendly UI (icon + localized messages + action buttons)
  - [x] 404: "Article Not Found" with back-to-news button
  - [x] Other errors: "An error occurred" with retry + back buttons

- [x] **Task 5.3: Remove duplicate "Read from original source" links (F-6)**
  - [x] Made second source link conditional on `article.body` existing
  - [x] No body: link only inside alert box; body exists: link after body section

- [x] **Task 5.4: Show created_at as fallback when published_at is null (D-3 frontend)**
  - [x] Article cards: `published_at || created_at` fallback
  - [x] Article detail meta row: same fallback with "(approximate)" label
  - [x] Related article cards: same fallback

---

## Agent 6: Frontend - localStorage & State Management
**Files:** Multiple frontend files with localStorage keys

- [x] **Task 6.1: Unify localStorage key naming convention**
  - [x] Standard: all keys use `rad-ai-` prefix
  - [x] Change `raid-chat-messages` → `rad-ai-chat-messages` in use-sse-chat.ts
  - [x] Change `raid-onboarding-seen` → `rad-ai-onboarding-seen` in page.tsx (homepage)
  - [x] Change `raid-charts-recent` → `rad-ai-charts-recent` in charts/page.tsx
  - [x] Change `raid-watchlist-tickers` → `rad-ai-watchlist-tickers` in stock/[ticker]/StockDetailClient.tsx
  - [x] Change `rad-palette-recent` → `rad-ai-palette-recent` in CommandPalette.tsx
  - [x] Change `rad-palette-stocks` → `rad-ai-palette-stocks` in CommandPalette.tsx
  - [x] Add migration: on app load, read old keys, write to new keys, delete old keys

- [x] **Task 6.2: Add localStorage migration utility**
  - [x] Inline migration blocks added to each file where keys are first read
  - [x] Read from old key names, write to new key names if old exist
  - [x] Delete old keys after migration
  - [x] No centralized migration needed - each file handles its own migration inline

- [ ] **Task 6.3: Persist chat error messages cleanup**
  - [ ] Currently error messages are persisted to localStorage along with regular messages
  - [ ] Filter out error messages when saving to localStorage
  - [ ] Only persist user and assistant messages, not error states

---

## Agent 7: Frontend - Announcements Error Display & Charts (F-3, F-7)
**Files:** `frontend/src/app/announcements/page.tsx`, `frontend/src/components/charts/StockComparisonChart.tsx`, `frontend/src/components/charts/PreBuiltCharts.tsx`

- [x] **Task 7.1: Fix announcements error display (F-3)**
  - [x] In announcements/page.tsx, the error state shows raw error message
  - [x] Replace with user-friendly error component
  - [x] Add icon (warning/error icon)
  - [x] Show localized message: "Unable to load announcements" + retry button
  - [x] Add "Show details" expandable section for technical error
  - [x] Match the error display style used on other pages (market, stock detail)

- [x] **Task 7.2: Improve PreBuiltCharts error handling**
  - [x] In PreBuiltCharts.tsx, currently shows error per card
  - [x] Add distinction between "endpoint not available" vs "server error"
  - [x] If all 4 charts fail, show a single consolidated message instead of 4 error cards
  - [x] Add proper i18n for all error strings

- [x] **Task 7.3: Investigate stock comparison chart rendering (F-7)**
  - [x] In StockComparisonChart.tsx, check if normalized price lines render
  - [x] Verify the `normalizeToBase100()` function produces correct output
  - [x] Check if `addLineSeries()` is called correctly with proper options
  - [x] Verify volume bars are not covering the price lines (z-order issue)
  - [x] No volume bars exist in comparison chart - only normalized line series are added
  - [x] Chart code is correct: lineWidth=2, fitContent() called, proper colors assigned

---

## Agent 8: Frontend - Security Headers & Performance
**Files:** `frontend/next.config.mjs`, `frontend/src/lib/api-client.ts`

- [x] **Task 8.1: Add security headers in next.config.mjs**
  - [x] Add `headers()` configuration to next.config.mjs
  - [x] Add `X-Content-Type-Options: nosniff`
  - [x] Add `X-Frame-Options: DENY`
  - [x] Add `X-XSS-Protection: 1; mode=block`
  - [x] Add `Referrer-Policy: strict-origin-when-cross-origin`
  - [x] Add `Permissions-Policy` header to restrict unnecessary APIs
  - [x] Add long cache headers for `/_next/static/:path*` immutable assets

- [ ] **Task 8.2: Strip infrastructure headers in proxy** (not in scope per team lead instructions)

- [x] **Task 8.3: Add API request timeout**
  - [x] In api-client.ts `request()` function, add AbortController with 15s timeout
  - [x] Show "Request timed out" error instead of hanging indefinitely
  - [x] Add timeout parameter option for longer operations (charts, AI chat)

- [x] **Task 8.4: Add API response caching**
  - [x] Add long cache headers for static assets in next.config.mjs
  - [x] In api-client.ts, add `cachedRequest()` in-memory cache utility
  - [x] Cache sectors for 60 seconds via `getSectors()` using `cachedRequest()`

- [x] **Task 8.5: Improve error handling in API client**
  - [x] In api-client.ts `ApiError`, add `getUserMessage()` method
  - [x] Map common status codes: 0=timeout, 401=auth, 403=denied, 404=not found, 429=rate limit, 500=server, 503=unavailable
  - [x] Add network error handling (TypeError with "fetch" mapped to "Network error" ApiError)

---

# Summary

| Agent | Focus Area | Files Modified | Priority |
|-------|-----------|---------------|----------|
| 1 | Entities & Market APIs | Backend: sqlite_entities.py, market_analytics.py, app.py | Critical |
| 2 | News Pipeline | Backend: news_scraper.py, news_store.py, news_paraphraser.py | Critical |
| 3 | Auth & Chat Access | Backend: app.py, auth/; Frontend: login page, watchlist | Critical |
| 4 | Health Check | Backend: health.py, health_service.py | Major |
| 5 | News Frontend | Frontend: news/page.tsx, news/[id]/page.tsx | Minor/Major |
| 6 | localStorage & State | Frontend: Multiple files | Minor |
| 7 | Announcements & Charts | Frontend: announcements/page.tsx, StockComparisonChart.tsx | Minor/Major |
| 8 | Security & Performance | Frontend: next.config.mjs, api-client.ts | Major |
