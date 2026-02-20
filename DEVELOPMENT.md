# Development Guide

This guide covers common development tasks and architectural patterns in the Ra'd AI codebase.

## Async Database Access

### Background

All FastAPI route handlers are `async def`, but the database drivers (sqlite3, psycopg2) are synchronous. Calling sync I/O directly inside an async handler blocks the event loop, degrading throughput for concurrent requests.

The solution: wrap sync calls in `asyncio.to_thread()`, which runs them in a thread pool without blocking the event loop.

### Using `aget_*` Methods (NewsStore)

`services/news_store.py` provides both sync and async methods. **Always use the async variants in route handlers.**

```python
# CORRECT - non-blocking
from api.routes.news_feed import get_store

@router.get("/articles")
async def list_articles(source: str | None = None):
    store = get_store()
    articles = await store.aget_latest_news(limit=20, source=source)
    return {"items": articles}
```

```python
# WRONG - blocks the event loop
@router.get("/articles")
async def list_articles():
    store = get_store()
    articles = store.get_latest_news(limit=20)  # sync call in async handler!
    return {"items": articles}
```

Available async methods:

| Async Method | Sync Equivalent | Description |
|---|---|---|
| `aget_latest_news(**kwargs)` | `get_latest_news(...)` | Fetch articles with filters |
| `acount_articles(**kwargs)` | `count_articles(...)` | Count articles with filters |
| `aget_article_by_id(id)` | `get_article_by_id(id)` | Single article by ID |
| `asearch_articles(**kwargs)` | `search_articles(...)` | Full-text search |
| `acount_search(**kwargs)` | `count_search(...)` | Count search results |
| `aget_sources()` | `get_sources()` | List sources with counts |
| `aget_articles_by_ids(ids)` | `get_articles_by_ids(ids)` | Batch fetch by IDs |

### Using `db_helper` (Generic Queries)

For ad-hoc SQLite queries in route handlers, use `api/db_helper.py`:

```python
from api.db_helper import afetchall, afetchone

@router.get("/stats")
async def get_stats():
    row = await afetchone("SELECT COUNT(*) as total FROM companies")
    return {"total": row["total"]}

@router.get("/sectors")
async def get_sectors():
    rows = await afetchall(
        "SELECT sector, COUNT(*) as count FROM companies GROUP BY sector"
    )
    return {"sectors": rows}
```

### Adding Async Methods to Existing Services

When adding new sync methods that will be called from route handlers, always add an async wrapper:

```python
class NewsStore:
    def get_trending(self, hours: int = 24) -> List[Dict]:
        """Sync implementation."""
        conn = self._connect()
        try:
            # ... query logic
            return [dict(row) for row in rows]
        finally:
            conn.close()

    async def aget_trending(self, **kwargs) -> List[Dict]:
        """Async wrapper for use in FastAPI handlers."""
        return await asyncio.to_thread(self.get_trending, **kwargs)
```

## Adding a News Source

The news scraper system in `services/news_scraper.py` is extensible. Each source is a subclass of `BaseNewsScraper`.

### Step 1: Create the Scraper Class

```python
class MySourceScraper(BaseNewsScraper):
    """Scraper for MySource financial news."""

    @property
    def source_name(self) -> str:
        return "مصدري"  # Arabic name displayed in UI

    @property
    def base_url(self) -> str:
        return "https://mysource.example.com/economy"

    def parse_articles(self, html: str) -> List[Dict]:
        soup = BeautifulSoup(html, "lxml")
        articles = []
        for item in soup.select("article.news-item"):
            title_el = item.select_one("h2 a")
            if not title_el:
                continue
            articles.append({
                "title": title_el.get_text(strip=True),
                "source_url": title_el.get("href", ""),
                "published_at": self._parse_date(
                    item.select_one("time")
                ),
            })
        return articles[:_scraper_cfg.max_articles_per_source]
```

If the source blocks direct requests (Cloudflare, WAF), extend `GoogleNewsRssScraper` instead:

```python
class MySourceScraper(GoogleNewsRssScraper):
    @property
    def source_name(self) -> str:
        return "مصدري"

    @property
    def base_url(self) -> str:
        return "https://mysource.example.com"  # used for Google News site: filter

    @property
    def google_news_query(self) -> str:
        return "سوق الأسهم السعودي site:mysource.example.com"
```

### Step 2: Register the Scraper

Add your class to the `ALL_SCRAPERS` list at the bottom of `news_scraper.py`:

```python
ALL_SCRAPERS: List[type] = [
    AlarabiyaScraper,
    AsharqBusinessScraper,
    ArgaamScraper,
    MaaalScraper,
    MubasherScraper,
    MySourceScraper,         # <-- add here
]
```

### Step 3: Add the Source Filter to the Frontend

Update `frontend/src/app/news/utils.ts` to add the source chip:

```typescript
export const SOURCE_FILTERS = [
  { key: null, label: 'الكل', color: '#D4A84B' },
  { key: 'العربية', label: 'العربية', color: '#C4302B' },
  { key: 'الشرق', label: 'الشرق', color: '#1A73E8' },
  { key: 'أرقام', label: 'أرقام', color: '#00A650' },
  { key: 'معال', label: 'معال', color: '#FF6B00' },
  { key: 'مباشر', label: 'مباشر', color: '#6B21A8' },
  { key: 'مصدري', label: 'مصدري', color: '#FF1493' },  // <-- add here
] as const;
```

Also add the color mapping in the `SOURCE_COLORS` map (same file):

```typescript
const SOURCE_COLORS: Record<string, string> = {
  // ... existing entries
  'مصدري': '#FF1493',
};
```

### Step 4: Configuration

All scraper settings are centralized in `config/settings.py` under `ScraperSettings`:

| Env Variable | Default | Description |
|---|---|---|
| `SCRAPER_REQUEST_TIMEOUT` | `10` | HTTP timeout for source pages (seconds) |
| `SCRAPER_ARTICLE_FETCH_TIMEOUT` | `5` | HTTP timeout for article body fetches |
| `SCRAPER_INTER_REQUEST_DELAY` | `1.5` | Delay between requests (rate limiting) |
| `SCRAPER_MAX_ARTICLES_PER_SOURCE` | `10` | Max articles per source per cycle |
| `SCRAPER_MAX_FULL_ARTICLE_FETCHES` | `5` | Max full-body fetches per source |
| `SCRAPER_FETCH_INTERVAL_SECONDS` | `1800` | Scheduler interval (30 min default) |
| `SCRAPER_CLEANUP_AGE_DAYS` | `7` | Auto-delete articles older than N days |
| `SCRAPER_DEDUP_THRESHOLD` | `0.55` | Title similarity threshold for dedup |

### Step 5: Test

```bash
# Verify the scraper works in isolation
python -c "
from services.news_scraper import MySourceScraper
s = MySourceScraper()
articles = s.fetch_articles()
print(f'Found {len(articles)} articles')
for a in articles[:3]:
    print(f'  - {a[\"title\"][:60]}')
"

# Run the full pipeline
python -c "
from services.news_scraper import fetch_all_news
articles = fetch_all_news()
print(f'Total: {len(articles)} articles from all sources')
"
```

## Frontend Architecture

### Component Decomposition

Large page files have been decomposed into focused subcomponents to improve maintainability:

**Charts Page** (`frontend/src/app/charts/`):

| File | Purpose |
|---|---|
| `page.tsx` | Top-level orchestrator (slim) |
| `components/ChartHeader.tsx` | Page title + stock selector header |
| `components/ChartControls.tsx` | Timeframe picker + chart-type selector |
| `components/CandlestickPanel.tsx` | OHLCV candlestick chart wrapper |
| `components/VolumePanel.tsx` | Volume bar chart panel |
| `components/TASIPanel.tsx` | TASI index lightweight-charts panel |
| `components/ComparisonPanel.tsx` | Multi-stock overlay comparison chart |
| `components/StockSearch.tsx` | Ticker autocomplete search input |
| `components/ChartSkeleton.tsx` | Loading skeleton for chart panels |

**Markets Page** (`frontend/src/app/markets/`):

| File | Purpose |
|---|---|
| `page.tsx` | Top-level orchestrator (slim) |
| `components/MarketHeader.tsx` | Summary stats + breadcrumb |
| `components/SectorFilter.tsx` | Sector filter chip bar |
| `components/SortControls.tsx` | Column sort controls |
| `components/MarketTable.tsx` | Full desktop data table |
| `components/MarketCard.tsx` | Mobile card view for a single stock |
| `components/MarketCardList.tsx` | Mobile card list container |
| `components/PaginationBar.tsx` | Pagination controls |
| `components/MarketSearch.tsx` | Market search input |
| `components/MarketSkeleton.tsx` | Loading skeleton for table/cards |
| `components/MarketError.tsx` | Error state component |
| `components/MarketEmpty.tsx` | Empty state component |

### API Client Modules

`frontend/src/lib/api-client.ts` now re-exports from domain modules under `frontend/src/lib/api/`. Import from the domain module directly for new code:

```typescript
// Preferred: domain-specific import
import { getStockDetail } from '@/lib/api/stocks';
import { getNewsFeed } from '@/lib/api/news';

// Still works: legacy import (backward-compatible shim)
import { getStockDetail, getNewsFeed } from '@/lib/api-client';
```

Domain modules:

| Module | Exports |
|---|---|
| `api/stocks.ts` | `getStockDetail`, `getStockOHLCV`, `searchStocks` |
| `api/news.ts` | `getNewsFeed`, `getNewsArticle`, `getNewsSources`, `searchNews` |
| `api/charts.ts` | `getChartData`, `getTASIIndex` |
| `api/market.ts` | `getMarketOverview`, `getMarketSectors` |
| `api/auth.ts` | `login`, `refreshToken`, `guestLogin`, `getProfile` |
| `api/health.ts` | `getHealth`, `getLiveness`, `getReadiness` |
| `api/widgets.ts` | `getWidgetQuotes` |
| `api/reports.ts` | `getReports`, `getReport` |
| `api/announcements.ts` | `getAnnouncements` |

### Auth System

The auth hook (`frontend/src/lib/hooks/use-auth.ts`) provides:

- **Token refresh**: Automatically refreshes JWT before expiry using a background timer
- **Guest login**: `loginAsGuest()` calls `/api/v1/auth/guest` for anonymous access
- **Profile enrichment**: `fetchProfile()` populates user name, role, and permissions after login

Auth service (`services/auth_service.py`) was updated to support:

- Guest token issuance with limited claims
- Profile endpoint (`/api/v1/auth/me`) returning enriched user data

### Stock Detail Page

The stock detail page (`frontend/src/app/stocks/[ticker]/page.tsx`) now includes:

- **Financials tab**: Balance sheet, income statement, and cash flow in tabbed panels
- **Dividends tab**: Historical dividend table with yield trend sparkline
- **Reports section**: Related analyst reports linked to the ticker
- **News feed**: Latest news articles filtered by ticker/company name
- **Watchlist toggle**: Add/remove from watchlist with toast notification

## Frontend Patterns

### RTL Support

The app uses `dir="rtl"` for Arabic layout. Always use Tailwind logical properties:

| Physical (DO NOT USE) | Logical (USE THIS) |
|---|---|
| `ml-*` | `ms-*` (margin-inline-start) |
| `mr-*` | `me-*` (margin-inline-end) |
| `pl-*` | `ps-*` (padding-inline-start) |
| `pr-*` | `pe-*` (padding-inline-end) |
| `left-*` | `start-*` |
| `right-*` | `end-*` |

### AbortController Pattern

All fetch calls must be cancellable. The `api-client.ts` `request()` function accepts an optional `signal` parameter:

```typescript
import { getNewsFeed } from '@/lib/api-client';

useEffect(() => {
  const controller = new AbortController();
  getNewsFeed({ limit: 20 }, undefined, undefined, controller.signal)
    .then(setData)
    .catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    });
  return () => controller.abort();
}, []);
```

For hooks, use the `useAsync` pattern from `lib/hooks/use-api.ts` which handles AbortController automatically.

### Runtime Configuration

Frontend config values live in `frontend/src/lib/config.ts` and are driven by environment variables:

```typescript
import { API_TIMEOUT_MS, HEALTH_POLL_INTERVAL_MS } from '@/lib/config';
```

See `frontend/.env.local.example` for all available variables.

## Live Market Widgets

The widgets system provides live-updating market quotes (crypto, metals, oil, global indices) via Server-Sent Events.

### Architecture

```
QuotesHub (services/widgets/quotes_hub.py)
  ├── CryptoProvider     (providers/crypto.py)
  ├── MetalsProvider     (providers/metals.py)
  ├── OilProvider        (providers/oil.py)
  └── IndicesProvider    (providers/indices.py)
         │
         v
  SSE endpoint (/api/v1/widgets/stream)
         │
         v
  LiveMarketWidgets (React component)
    └── EventSource with reconnection backoff
```

### Adding a New Provider

1. Create a new file in `services/widgets/providers/`:

```python
from api.models.widgets import QuoteItem

async def fetch_my_quotes() -> list[QuoteItem]:
    """Fetch quotes from your data source."""
    # ... fetch logic
    return [
        QuoteItem(
            symbol="XYZ",
            name="My Asset",
            price=100.0,
            change=2.5,
            change_pct=2.56,
            category="my_category",
        )
    ]
```

2. Register the provider in `services/widgets/providers/__init__.py`.

3. Add the category to the `LiveMarketWidgets` component's category filter tabs.

### Redis Pub/Sub (Optional)

The `QuotesHub` supports Redis pub/sub for multi-instance deployments. Configure via:

| Env Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |
| `CACHE_ENABLED` | `false` | Enable Redis-based caching |

Without Redis, the hub operates in single-process mode with in-memory state.

## Cache Utilities

### Unified Caching Decorator (`services/cache_utils.py`)

Use `@cache_response` for caching service method results:

```python
from services.cache_utils import cache_response

@cache_response(ttl=300, max_size=500)
def get_expensive_data(ticker: str) -> dict:
    # ... expensive computation
    return result
```

The decorator provides:
- **TTL-based expiration**: Entries expire after `ttl` seconds
- **LRU eviction**: Cache is capped at `max_size` entries (default 500)
- **Thread-safe**: Uses `threading.Lock` internally

### YFinance Shared Utilities (`services/yfinance_base.py`)

Common patterns for yfinance API calls are centralized in `yfinance_base.py`:

- **`YFinanceCache`**: Shared LRU cache with configurable TTL and max entries (default 500)
- **`CircuitBreaker`**: Prevents repeated calls to a failing yfinance endpoint; auto-resets after a cooldown period

```python
from services.yfinance_base import YFinanceCache, CircuitBreaker

cache = YFinanceCache(max_size=500, ttl=300)
breaker = CircuitBreaker(failure_threshold=5, reset_timeout=60)
```

## Connection Status Patterns

### SSE Disconnect Detection (Backend)

All SSE endpoints must check for client disconnection to avoid orphaned generators:

```python
@router.get("/stream")
async def stream(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            yield {"data": json.dumps(payload)}
            await asyncio.sleep(interval)
    return EventSourceResponse(event_generator())
```

### EventSource Reconnection (Frontend)

The `ConnectionStatusBadge` component (`frontend/src/components/common/ConnectionStatusBadge.tsx`) provides a reusable connection state indicator. SSE consumers should implement exponential backoff on reconnection:

```typescript
const reconnect = useCallback(() => {
  const delay = Math.min(1000 * 2 ** attempt, 30000);
  setTimeout(() => {
    const es = new EventSource(url);
    es.onopen = () => setAttempt(0);
    es.onerror = () => { es.close(); reconnect(); };
  }, delay);
}, [attempt]);
```

States: `live` (connected), `reconnecting` (attempting), `offline` (failed).

### Header Health Polling

The site header polls `/health/live` with AbortController to show a connection indicator. The polling interval is configurable via `HEALTH_POLL_INTERVAL_MS` in `frontend/src/lib/config.ts`.

## Async I/O Notes

In addition to database calls and news store methods, health check routes in `app.py` are also wrapped in `asyncio.to_thread()` to prevent blocking when the database driver performs I/O during health probes.

## RTL Lint Enforcement

Run the RTL lint check to catch physical direction properties (`ml-*`, `mr-*`, `pl-*`, `pr-*`) that should use logical equivalents:

```bash
cd frontend && npm run lint:rtl
```

This runs `scripts/lint-rtl.js`, which scans `.tsx` and `.ts` files for Tailwind physical direction classes and reports violations. The check is also integrated into CI.

## Backend Module (`backend/`)

The `backend/` package contains enterprise-grade infrastructure organized into four subsystems:

### Security Pipeline (`backend/security/`)

SQL injection prevention and query validation for AI-generated SQL:

- **`sanitizer.py`**: Input sanitization for natural-language queries and SQL identifiers. Strips dangerous characters and normalizes whitespace.
- **`allowlist.py`**: Table and column allowlist enforcement (`QueryAllowlist`). Only permits queries against known schema objects.
- **`sql_validator.py`**: Multi-pass SQL query validation (`SqlQueryValidator`). Checks for prohibited keywords, subquery depth, statement type restrictions.
- **`vanna_hook.py`**: Integration hook (`validate_vanna_output`) that intercepts Vanna-generated SQL before execution and runs it through the full validation pipeline.
- **`config.py`**: `SecurityConfig` with tunable thresholds and feature flags.
- **`models.py`**: `ValidationResult` and `ValidatedQuery` Pydantic models.

### Middleware (`backend/middleware/`)

Request-level controls for rate limiting and cost management:

- **`rate_limiter.py`**: Redis-backed sliding window rate limiter (`RateLimiter`) with automatic in-memory fallback when Redis is unavailable.
- **`rate_limit_middleware.py`**: FastAPI middleware (`RateLimitMiddleware`) that enforces per-endpoint rate limits with standard `X-RateLimit-*` response headers.
- **`rate_limit_config.py`**: `RateLimitConfig` and `EndpointRateLimit` for per-route limit customization.
- **`cost_controller.py`**: LLM spend tracking (`CostController`) with configurable daily/monthly limits (`CostLimitConfig`) and usage summaries (`UsageSummary`).
- **`register.py`**: One-call middleware registration (`register_middleware`) and accessors (`get_rate_limiter`, `get_cost_controller`, `shutdown_middleware`).

### Audit & Logging (`backend/services/audit/`)

Structured observability for query lifecycle and security events:

- **`structured_logger.py`**: JSON-formatted logging (`JSONFormatter`, `configure_logging`, `get_logger`) with automatic request-ID injection.
- **`correlation.py`**: `CorrelationMiddleware` for end-to-end request tracing via `X-Request-ID` headers. `get_current_request_id()` accessor for any code path.
- **`query_audit.py`**: `QueryAuditLogger` tracks the full NL-to-SQL lifecycle (query received, SQL generated, executed, results returned).
- **`security_events.py`**: `SecurityEventLogger` records auth failures, SQL injection attempts, rate limit violations, and other security-relevant events.
- **`config.py`**: `AuditConfig` for log levels, output paths, and feature toggles.
- **`models.py`**: `QueryAuditEvent`, `SecurityEvent`, `SecurityEventType`, `SecuritySeverity` Pydantic models.

### Cache Layer (`backend/services/cache/`)

Redis-based caching with compression and connection pooling:

- **`query_cache.py`**: Tiered query cache (`QueryCache`) with configurable TTL per query complexity.
- **`compression.py`**: `GZipCacheMiddleware` for transparent response compression. `compress_bytes` / `decompress_bytes` utilities, `compress_large_response` for threshold-based compression.
- **`redis_client.py`**: `RedisManager` for async Redis connection lifecycle with connection pooling.
- **`db_pool.py`**: `DatabasePoolManager` for database connection pooling with health checks.
- **`maintenance.py`**: `CacheMaintenance` for periodic cache cleanup, stats collection, and eviction.
- **`config.py`**: `CacheConfig` for Redis URLs, pool sizes, TTL tiers, and compression thresholds.
- **`models.py`**: `CachedResult`, `PoolConfig`, `PoolStats`, `TTLTier` Pydantic models.

### Resilience (`backend/services/resilience/`)

Fault tolerance for external service calls (yfinance, LLM APIs, Redis):

- **`circuit_breaker.py`**: `CircuitBreaker` with configurable failure thresholds, half-open probing, and a global registry (`get_or_create`, `get_all_stats`).
- **`retry.py`**: `with_retry` decorator for exponential backoff retries. `with_timeout` decorator for deadline enforcement.
- **`timeout_manager.py`**: `QueryTimeoutManager` with per-query-type timeout configuration (`QueryTimeoutConfig`).
- **`degradation.py`**: `DegradationManager` for graceful feature degradation when dependencies fail. `create_default_manager()` factory.
- **`config.py`**: `ResilienceConfig` with `get_resilience_config()` accessor.

## E2E Testing (Playwright)

End-to-end tests use [Playwright](https://playwright.dev/) and live under `frontend/e2e/`.

### Setup

```bash
cd frontend
npx playwright install --with-deps chromium
```

### Running E2E Tests

```bash
# Run all E2E tests (headless)
cd frontend && npx playwright test

# Run with UI (headed)
cd frontend && npx playwright test --headed

# Run a specific spec file
cd frontend && npx playwright test e2e/markets.spec.ts

# Show last test report
cd frontend && npx playwright show-report
```

### Spec File Locations

| File | What It Covers |
|---|---|
| `e2e/news.spec.ts` | News portal: RTL layout, virtual scroll, SSE stream, source filters |
| `e2e/markets.spec.ts` | Markets page: sector filter chips, column sort, pagination, search, mobile card view |
| `e2e/stock-detail.spec.ts` | Stock detail: financials tab, dividends tab, watchlist toggle, related news, reports |

### Writing New E2E Tests

- Use `page.getByRole()` and `page.getByTestId()` selectors for resilience
- Add `data-testid` attributes to new interactive elements in TSX files
- Use `await page.waitForLoadState('networkidle')` after SSE-dependent page loads
- For RTL assertions check `dir="rtl"` on `<html>` and use `toHaveCSS` for layout direction

## Performance Optimizations

### ConstellationCanvas Animation

The `ConstellationCanvas` component uses `requestAnimationFrame` instead of `setInterval` for its particle animation loop. This aligns animation updates with the browser's repaint cycle (typically 60fps) and avoids frame-rate issues:

```typescript
// Correct pattern (requestAnimationFrame)
const animate = useCallback(() => {
  drawFrame();
  animationRef.current = requestAnimationFrame(animate);
}, [drawFrame]);

useEffect(() => {
  animationRef.current = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(animationRef.current!);
}, [animate]);
```

Child particle components are wrapped in `React.memo` to prevent re-renders when parent state unrelated to particle data changes.

The resize handler is debounced (300ms) to avoid recalculating canvas dimensions on every intermediate resize event:

```typescript
const handleResize = useMemo(
  () => debounce(() => { /* recalculate */ }, 300),
  []
);
```

The canvas element has `will-change: transform` applied via CSS to hint to the browser that it should be composited on a separate GPU layer.

## Running Test Coverage

Generate an HTML coverage report for the backend:

```bash
# Run tests with coverage collection
python -m pytest tests/ --cov=api --cov=services --cov=backend --cov-report=html --cov-report=term-missing

# Open the HTML report
# Windows:
start htmlcov/index.html
# macOS:
open htmlcov/index.html
# Linux:
xdg-open htmlcov/index.html
```

For a quick terminal summary without HTML:

```bash
python -m pytest tests/ --cov=api --cov=services --cov=backend --cov-report=term-missing -q
```

## PostgreSQL Shared Utilities (`database/postgres_utils.py`)

Common PostgreSQL availability and connection helpers are centralized to avoid duplication across test files and services.

```python
from database.postgres_utils import pg_available, pg_connection_params

# Check if PG is reachable (safe to call with no PG configured — returns False)
if pg_available(timeout=3):
    params = pg_connection_params()
    conn = psycopg2.connect(**params, connect_timeout=5)
```

**`pg_available(timeout=3) -> bool`**
- Returns `False` immediately if `POSTGRES_HOST` env var is unset
- Catches all exceptions including invalid port values; logs `debug` on failure
- Safe to use in `@pytest.mark.skipif` decorators

**`pg_connection_params() -> dict`**
- Returns `host`, `port` (int, defaults to 5432 on invalid input), `dbname`, `user`, `password` from env
- Does not include `connect_timeout`; callers add as needed

Import this in any new code that needs to probe PG availability instead of duplicating the try/connect pattern.

## Test Organization

### Backend Tests

All test files live under `tests/`. There are no test files in the project root (except the legacy `test_app_assembly.py` v1, which is not run by pytest).

| Directory | Purpose | Marker |
|---|---|---|
| `tests/` | Unit tests (services, routes, schemas, middleware) | `@pytest.mark.fast` |
| `tests/integration/` | Integration tests (API chains, auth flows, health, PG path) | `@pytest.mark.integration` |
| `tests/security/` | Security tests (SQL injection, auth bypass) | - |
| `tests/performance/` | Load and concurrency tests | `@pytest.mark.performance` |

Key test files:

| File | Purpose |
|---|---|
| `tests/test_database.py` | 23 database integrity tests (dual SQLite + PG backends) |
| `tests/test_app_assembly_v2.py` | 33 Vanna 2.0 assembly tests (run directly with `python tests/test_app_assembly_v2.py`) |
| `tests/conftest.py` | Shared fixtures: `sqlite_db`, `pg_conn`, `pg_schema_version` |

New backend test files added in the quality sprint:

| File | Coverage |
|---|---|
| `tests/test_auth_service.py` | JWT issuance, guest login, token refresh, permission guards |
| `tests/test_widget_system.py` | QuotesHub providers, SSE streaming, Redis pub/sub fallback |
| `tests/test_health_config.py` | Health probes (live/ready), config validation, env startup checks |

### Frontend Tests (Vitest)

Frontend tests live under `frontend/src/__tests__/`. Run with `npx vitest run` from the `frontend/` directory. 231 tests across 20 files.

New frontend test files added in the quality sprint:

| File | Coverage |
|---|---|
| `src/__tests__/hooks/use-auth.test.ts` | Token refresh timer, guest login flow, profile enrichment |
| `src/__tests__/lib/api/stocks.test.ts` | Domain module exports, request shaping, error handling |
| `src/__tests__/lib/api/news.test.ts` | News domain module: feed, article, search, sources |
| `src/__tests__/app/stocks/StockDetail.test.tsx` | Financials tab, dividends tab, watchlist toggle, news section |
| `src/__tests__/lib/api/charts.test.ts` | Chart data fetch, TASI index, error and loading states |
| `src/__tests__/lib/api/entities.test.ts` | Entity search, pagination, empty results |
| `src/__tests__/lib/api/market.test.ts` | Market overview, sector filter, sort parameters |
| `src/__tests__/lib/api/health.test.ts` | Liveness and readiness probe responses |

New backend test files added in the coverage expansion sprint:

| File | Coverage Target | Description |
|---|---|---|
| `tests/test_xbrl_processor.py` | 70%+ (was 26.7%) | XBRL document parsing, field extraction, error handling |
| `tests/test_price_loader.py` | 70%+ (was 33.5%) | Price record loading, batch upsert, date normalization |
| `tests/test_stock_ohlcv.py` | 70%+ (was 18.8%) | OHLCV service: yfinance integration, cache, circuit breaker |
| `tests/test_redis_client.py` | 70%+ (was 22.2%) | Redis client: mocked ops, pub/sub flow, connection pool, error recovery |
| `tests/test_ingestion_scheduler.py` | 70%+ (was 0%) | Scheduler: task registration, run cycle, error isolation |

Run specific test categories:

```bash
# Unit tests only
python -m pytest tests/ --ignore=tests/integration --ignore=tests/security --ignore=tests/performance -q

# Integration tests only
python -m pytest tests/integration/ -q

# Security tests only
python -m pytest tests/security/ -q

# Performance tests only
python -m pytest tests/performance/ -q
```
