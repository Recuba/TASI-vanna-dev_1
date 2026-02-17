# Changelog

All notable changes to the Ra'd AI TASI Platform are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] - 2026-02-18

### Added
- E2E Playwright tests for markets page (sector filter, sort, pagination, search, mobile card view, RTL layout)
- E2E Playwright tests for stock detail page (financials tab, dividends tab, watchlist toggle, news section, reports section)
- Backend test coverage expansion: XBRL processor (`ingestion/xbrl_processor.py`) 26.7% → 70%+ with 40+ new tests
- Backend test coverage expansion: price loader (`ingestion/price_loader.py`) 33.5% → 70%+ with 35+ new tests
- Backend test coverage expansion: stock OHLCV service (`services/stock_ohlcv.py`) 18.8% → 70%+ with 30+ new tests
- Backend test coverage expansion: Redis client (`backend/services/cache/redis_client.py`) 22.2% → 70%+ with mocked operations, pub/sub, and connection management tests
- Backend test coverage expansion: ingestion scheduler (`ingestion/scheduler.py`) 0% → 70%+ with 25+ new tests
- Frontend API module tests for remaining domains: charts, entities, market, and health (`frontend/src/__tests__/lib/api/`)
- Redis integration tests: mocked client operations, pub/sub flow, connection lifecycle, error recovery

### Changed
- ConstellationCanvas (`frontend/src/components/`) performance optimized: replaced `setInterval` animation loop with `requestAnimationFrame`; added `React.memo` to particle child components; debounced resize handler to prevent layout thrashing; added `will-change: transform` CSS hint for GPU compositing

### Improved
- Backend test coverage on critical data ingestion modules from an average of ~20% to 70%+

## [Unreleased] - 2026-02-17

### Added
- Frontend component decomposition: charts page split into 9 subcomponents (`frontend/src/app/charts/components/`), markets page split into 12 subcomponents (`frontend/src/app/markets/components/`)
- API client modularized into domain modules under `frontend/src/lib/api/` (stocks, news, charts, market, auth, health, widgets, reports, announcements); backward-compatible shim retained at `api-client.ts`
- Auth system enhancements: token refresh, guest login flow, profile enrichment in auth hook and auth service
- Stock detail page enriched with financials tab, dividends tab, reports section, related news feed, and watchlist toggle
- Chat SSE message batching and message persistence across sessions
- Tailwind CSS keyframe animations added to global styles
- Performance config files consolidated (Next.js + Tailwind + PostCSS)
- New frontend test suites: auth hook tests, API client module tests, stock detail page tests
- New backend test suites: auth service tests, widget system tests, health and config module tests
- UX/UI deep dive audit with 100 recommendations from 10-agent analysis
- 122 new tests: 95 db_compat tests + 27 Vanna pipeline integration tests

### Changed
- API client architecture: flat `api-client.ts` moved to modular domain structure under `frontend/src/lib/api/`; original file now re-exports from modules for backward compatibility
- Apply ruff 0.15.1 formatting across 49 Python files
- Reduce DemoAgentMemory from 10,000 to 500 items (OOM prevention)
- Replace global `_fetch_lock` with per-ticker locks in stock_ohlcv and tasi_index services
- `requirements-dev.txt` with separated development dependencies (pytest, pytest-timeout, ruff)
- `.gitignore` expansion to cover `.env.*`, keys, and build artifacts (49 patterns)

### Fixed
- RTL lint violations: physical direction Tailwind classes replaced with logical properties across charts and markets pages
- ESLint warnings resolved across new frontend component files
- CI pipeline: install `requirements-dev.txt` for test jobs
- CI pipeline: add `--timeout=60` per-test timeout to prevent yfinance network hangs
- CI pipeline: skip `tests/performance/` directory (network-dependent load tests)
- Add `pytest-timeout` to dev dependencies
- Resolve 21 unused imports, 1 ambiguous variable, 4 E402 noqa annotations
- Resolve 7 critical audit findings from 14-agent code audit (180+ findings)

### Security
- Add whitelist + regex validation to `datetime_recent()` (SQL injection defense)
- Add `validate_ticker()` to entity and reports routes (3 files)
- Pin dependency version bounds in `requirements.txt`

## [0.9.0] - 2026-02-16

### Added
- News page UX/UI polish (14 agents across 2 teams):
  - Full card clickable ArticleCard with hover prefetch
  - Breaking news treatment (pulsing badge + red accent bar for priority >= 5)
  - Search term highlighting in article cards
  - Horizontal scroll filter chips with snap-x and active ring
  - Toast-style NewArticlesBanner with auto-dismiss progress bar
  - Gold shimmer SkeletonCard with staggered entrance animations
  - Article detail: back-to-top, reading progress, drop-cap, auto-retry, word count
  - Related articles with staggered entrance animations
  - Bookmark toast notification on save/unsave
  - Header article count badge
  - Error/empty states redesign with floating icons and bilingual text
  - CSS keyframe animations: fade-in-up, fade-in, shimmer, float
- Live market widgets system (SSE + Redis pub/sub): crypto, metals, oil, indices
- ConnectionStatusBadge component (live/reconnecting/offline indicator)
- Unified cache decorator (`@cache_response` with LRU + TTL)
- Shared yfinance base extraction with circuit breaker
- SQL centralization in `database/queries.py`
- News scheduler per-source logging
- RTL lint script (`npm run lint:rtl`)
- Route-level error and loading boundaries for news, market, charts, chat
- Markets page with MarketOverviewClient

### Fixed
- Reports service now works with SQLite backend (dual-backend support)
- Auto-create `technical_reports` table in SQLite on first access
- Reports router registered for both backends in `app.py`
- Add `vercel.json` to fix Vercel build error
- Replace stale Vercel URL with env-driven frontend link (`{{FRONTEND_URL}}`)
- Raise `/api/v1/charts` rate limit from 30 to 120 rpm (sparkline burst support)
- `next.config` health proxy fix

## [0.8.0] - 2026-02-14

### Added
- Pydantic-settings configuration for scraper (`ScraperSettings` with all constants)
- Frontend runtime config (`frontend/src/lib/config.ts`) for API timeouts and intervals
- Playwright E2E tests for news portal (RTL, virtual scroll, SSE, filters)
- News SSE stream route (`/api/v1/news/stream`)
- SSE buffering headers in `next.config.mjs` for stream endpoints
- `DEVELOPMENT.md` developer guide (async patterns, adding news sources, RTL, AbortController)

### Changed
- Extract hardcoded config values into pydantic-settings and env variables
- Replace 30+ hardcoded 15,000ms timeouts in `api-client.ts` with config defaults
- Replace hardcoded 60,000ms cache TTL with config defaults
- Replace hardcoded 30,000ms health poll interval in `Header.tsx`
- Decompose 1,212-line `news/page.tsx` into 8 focused modules
- Finalize dead code cleanup and async conversion across codebase
- Synchronize all documentation with new architecture

### Fixed
- AbortController added to 15 unsafe `fetch()` calls preventing race conditions on unmount
- Replace 25 hardcoded LTR Tailwind classes with logical properties (ms/me/ps/pe) for RTL
- Wrap sync sqlite3/psycopg2 calls in `asyncio.to_thread()` across 14 backend route files
- Fix blocking sync call in `news_stream.py` SSE endpoint
- E2E test flakes (RTL timing, SSE network idle, Badge selectors)
- Docker: add missing `models/` COPY to Dockerfile
- Docker: add `--timeout-graceful-shutdown 30` to uvicorn for clean SSE disconnect
- Docker: rename `REDIS_URL` to `CACHE_REDIS_URL` in `docker-compose.yml`
- Build regressions from refactor verified and fixed

## [0.7.0] - 2026-02-13

### Added
- Frontend security: CSP, HSTS, host validation middleware, CSRF protection, secure cookies
- Frontend monitoring: Sentry integration (client/server/edge), error boundaries, Web Vitals
- Frontend performance: bundle analyzer, lazy-loading wrappers, skeletons, OptimizedImage
- Frontend auth: RBAC types (admin/analyst/viewer), AuthContext with JWT, permission guards
- Query UX: IndexedDB query store, history UI with search/sort/favorites, saved queries
- Data export: CSV, Excel, and PDF export from query results
- AutoChart with smart type detection (recharts), DataTable with virtual scrolling
- Playwright E2E tests (27 tests), Locust load tests, Lighthouse CI
- 72 new Vitest unit tests (139 total)
- OpenAPI 3.0 spec (35+ endpoints), Swagger UI
- PRIVACY.md (GDPR/PDPL), SLA.md documentation

### Changed
- Production-readiness audit: 38 tasks across all layers (7-agent team)
- Chat bundle reduced from 362kB to 105kB (71% reduction)
- Tiered rate limiting (10/30/60 rpm by endpoint category)
- Unified error responses with `request_id` correlation

### Fixed
- 12 information leak fixes across API endpoints
- CORS hardening with restricted methods and headers

### Security
- Ticker input validation on 7 endpoints
- 54-endpoint auth audit completed
- Dependency security scan integrated
- IP-anonymized request logging

### Infrastructure
- Multi-stage Dockerfile with tini init and non-root user
- CI/CD pipeline with Buildx cache (`.github/workflows/ci.yml` + `deploy.yml`)
- Environment validation on startup (`env_validator.py`)
- Liveness (`/health/live`) and readiness (`/health/ready`) probes
- Graceful shutdown handler
- Railway deployment configuration
- `db_compat.py` SQLite/PostgreSQL abstraction layer
- Structured JSON logging (production) / pretty logging (development)
- Pluggable error tracking (`error_tracking.py`)
- 56 new backend tests (552 total, 0 regressions)

## [0.6.0] - 2026-02-12

### Added
- Bilingual chat suggestion chips (Arabic/English)
- Stock detail: financial statements tabbed section
- Watchlist: batch quote fetching with skeleton loading states
- Login page with email/password + guest access
- Guest token endpoint for anonymous chat access
- Health endpoint: TASI cache, news scheduler, build info checks (6 components)

### Changed
- Switch default LLM to Claude Sonnet 4.5 (`AnthropicLlmService`), remove Gemini references
- Chart rendering: `normalizeSSEEvent` falls back to `richData` when `plotly_json`/`fig` wrappers absent
- Batch SSE events via 50ms flush interval (reduce React re-renders ~10-20x)
- Separate progress events from content components in chat UI
- Show live progress text in LoadingDots during streaming

### Fixed
- Chat SSE: use `RequestContext.get_header()` instead of `.request` (Vanna 2.0 API)
- Arabic name corrected: replace all "رائد" with "رعد" across frontend
- SSE chat: normalize Vanna 2.0 event format to frontend types
- Dividend yield: remove 100x multiplier (DB stores percentages)
- TASI index: reduce circuit breaker timeout, add data freshness metadata
- Stock detail: add `.SR` ticker normalization (frontend + backend)
- Filter 113 SABE null-data entities from listings (387 real companies remain)
- News scrapers: replace broken Al Arabiya/Asharq with Google News RSS proxy
- Market search: add stock alias matching (Aramco -> 2222.SR)
- Sector names: add Arabic translation map across all pages
- Unicode escape sequences replaced with actual Arabic characters
- `useLanguage` i18n added to 6 chat components
- `timeAgo()`, `readingTime()`, `formatDate()` made bilingual
- Sidebar CSS dark mode conflict fixed
- Pool connection: UUID-based unique keys per checkout (replaces thread-ID collision)
- psycopg2 pool: `_PooledConnection` wrapper (read-only C extension attribute fix)
- Dual-backend: entities/market/charts/stocks routes use PostgreSQL on Railway
- Entities API: SQLite fallback always registered with proper error handling
- Market analytics: NULL handling with COALESCE, 503 on missing DB
- News pipeline: full article body fetching, `published_at` fallback
- Watchlist: localStorage fallback for anonymous users
- Announcements: user-friendly error display with collapsible details
- News counter: updates correctly when Saved filter active
- News 404: clean error UI instead of raw JSON
- localStorage keys: unified to `rad-ai-*` prefix with migration
- CommandPalette `useMemo` missing language dependency
- Mobile: flex-wrap breadcrumbs, break-words company names
- Ruff format applied to 28 files, lint errors fixed for CI compliance
- CI: upgrade Node 18 to 20 for Vitest ESM compatibility

### Security
- JWT made optional (anonymous access allowed) with proper guards
- Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- API client: 15s timeout with in-memory cache

## [0.5.0] - 2026-02-11

### Added
- English/Arabic language toggle with full RTL/LTR support (LanguageProvider)
- 5-source Arabic news scraper, paraphraser, SQLite store, background scheduler
- News REST API (`/api/v1/news/feed`, `/feed/{id}`, `/sources`, `/search`)
- Frontend news page with full Arabic RTL support
- Announcements page, news detail page, loading states, 404 page
- Command palette (Ctrl+K), mobile bottom nav, scroll-to-top, toast system
- TASI index chart (lightweight-charts), TradingView widget integration
- Stock comparison chart
- Market analytics, news feed, SQLite entities API routes
- Database manager, config prompts module
- Gemini model compatibility check and auto-fallback

### Changed
- Switch LLM from Gemini to Claude Sonnet 4.5 via Anthropic API
- Home page made fully bilingual (Arabic/English)

### Fixed
- Frontend deployment: CORS origins, navigation, language toggle, API wiring, legacy UI
- API path mismatches for market and stocks endpoints
- `BACKEND_URL` env var for Next.js rewrite destination
- Railway deployment: warn instead of crash on missing `AUTH_JWT_SECRET`
- Gemini 3 Flash tool round-trip error (switch to Gemini 2.5 Flash as intermediate step)

## [0.4.0] - 2026-02-10

### Added
- Per-stock OHLCV endpoint (`GET /api/v1/charts/{ticker}/ohlcv`) with yfinance, 300s cache, circuit breaker
- TASI index endpoint with same pattern
- Dedicated `/charts` page with stock search, quick-pick chips, and candlestick charts
- Pagination for news and reports pages
- Ctrl+K chat shortcut, print styles, onboarding banner
- DataSourceBadge, ChartErrorBoundary components
- 53 frontend Vitest tests (7 files), 42 new Python tests for TASI/OHLCV
- MSW integration tests

### Changed
- Switch LLM from Anthropic Claude to Google Gemini 3 Flash (via OpenAI-compatible endpoint)

### Fixed
- OHLCV hooks: unwrap `StockOHLCVResponse` correctly
- Wire error/loading/empty states across all chart pages

### Security
- Fix CRITICAL watchlist IDOR (SA-01): replace `X-User-Id` header with `get_optional_current_user()`
- Add DOMPurify to marked.js rendering (SA-02)
- Startup warnings for JWT secret and debug mode

## [0.3.0] - 2026-02-09

### Added
- Comprehensive codebase analysis with security findings and action plan

### Changed
- Dockerfile: add non-root user (`appuser`) and HEALTHCHECK
- CORS: restrict `allow_methods` and `allow_headers` to specific values
- `app.py`: use `config/settings.py` exclusively, replace deprecated `@app.on_event` with lifespan

### Fixed
- `middleware/rate_limit.py`: replace `list.pop(0)` with `deque.popleft()` (O(1) performance)
- `test_database.py`: fix index existence assertion

### Security
- Docker Compose: require passwords (no weak defaults), bind ports to 127.0.0.1, add resource limits
- Redis: enable persistence + auth
- Frontend: add DOMPurify for markdown XSS prevention, add `crossorigin` attrs to CDN scripts
- `requirements.txt`: pin all deps to major.minor ranges, update minimum versions
- CI: add security audit job (pip-audit), Docker build verification with non-root user check
- Extract auth logic into `services/auth_service.py` for separation of concerns

## [0.2.0] - 2026-02-08

### Added
- TradingView Lightweight Charts for Next.js frontend:
  - CandlestickChart with volume overlay, MA20/MA50, time ranges
  - LineChart with configurable time range selector
  - AreaChart with gradient fill for index trends
  - MiniSparkline for stock cards
  - Shared hooks (`useChart.ts`), config, and types
  - Chart state components (skeleton, error, empty)
- Native SSE chat UI replacing broken CDN vanna-chat component
- Railway deployment configuration (`railway.toml`)
- Entrypoint script for auto DB initialization on Railway
- Chart data layer: mock generators, formatters, MA calculation, data hooks
- 26 API routes, 5 CRUD services

### Changed
- Ra'd AI full-stack build with UI/UX hardening:
  - WCAG AA contrast (#999999 on dark), focus-visible, skip-to-content
  - Theme toggle (dark/light), onboarding overlay
  - Chart readability: larger fonts (14px), automargin, COLUMN_LABELS with units
  - Responsive: overflow-x handling, 44px touch targets
  - Remove user admin group to suppress Vanna diagnostic messages

### Fixed
- PostgresRunner parameter: `dbname` changed to `database`
- Health endpoint test: remove `components` assertion (Vanna returns `{status, service}`)
- CI test failures: add `openai` dependency, fix PG migration params
- Docker build: unblock CSV in `.dockerignore`, drop `.db` COPY
- All ruff lint and format errors resolved for CI (46 files formatted)

### Infrastructure
- Docker Compose: PostgreSQL 16 Alpine + app + optional pgAdmin
- Dockerfile: Python 3.11 FastAPI container
- Custom RaidChartGenerator: dark gold theme, value heatmaps, smart formatting
- JWT auth, Pydantic validation, Redis cache, rate limiting
- CI/CD pipeline established
- 513 tests pass, 0 failures, 38 skipped (PostgreSQL-only)

## [0.1.0] - 2026-02-06

### Added
- Initial release of Ra'd AI TASI Platform
- Normalized 1,062-column CSV into 10-table SQLite database (~500 Saudi stocks)
- Vanna 2.0 FastAPI server with Claude Sonnet 4.5 (Anthropic API)
- Ra'd AI gold-themed dark UI with responsive design (Tajawal font)
- SQL and visualization tools (RunSqlTool, VisualizeDataTool)
- Full schema documentation in system prompt
- 7 simple tables (1 row per ticker): companies, market_data, valuation_metrics, profitability_metrics, dividend_data, financial_summary, analyst_data
- 3 financial statement tables (multiple rows per ticker): balance_sheet, income_statement, cash_flow
- CLAUDE.md for Claude Code guidance
- AGENTS.md for agent configuration and behavioral rules
- Vanna skill references and scraped Vanna documentation
- Comprehensive test suite (44 tests)
- Environment configuration via `.env` file
