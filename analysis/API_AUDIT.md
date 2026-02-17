# API Endpoint Completeness Audit

**Auditor:** api-auditor
**Date:** 2026-02-17
**Scope:** All API endpoints in `api/routes/`, middleware, auth, frontend-backend alignment

---

## 1. Route Discovery Summary

All routes registered in `app.py` (lines 349-543):

| # | Route File | Prefix | Tags | Backend | Auth |
|---|-----------|--------|------|---------|------|
| 1 | `health.py` | `/health` | health | Any | Public |
| 2 | `reports.py` | `/api/reports` | reports | Dual (SQLite+PG) | Read=Public, Write=JWT |
| 3 | `news.py` | `/api/news` | news | PG only | Read=Public, Write=JWT |
| 4 | `announcements.py` | `/api/announcements` | announcements | PG only | Read=Public, Write=JWT |
| 5 | `watchlists.py` | `/api/watchlists` | watchlists | PG only | All=JWT |
| 6 | `entities.py` (PG) | `/api/entities` | entities | PG only | Public |
| 7 | `auth.py` | `/api/auth` | auth | Dual | Mixed |
| 8 | `tasi_index.py` | `/api/v1/charts/tasi` | tasi-index | Any (yfinance) | Public |
| 9 | `stock_ohlcv.py` | `/api/v1/charts` | stock-ohlcv | Any (yfinance) | Public |
| 10 | `news_feed.py` | `/api/v1/news` | news-feed | SQLite | Public |
| 11 | `news_stream.py` | `/api/v1/news` | news-stream | SQLite | Public |
| 12 | `widgets_stream.py` | `/api/v1/widgets` | widgets | Any | Public |
| 13 | `market_overview.py` | `/api/v1/market-overview` | market-overview | Any (yfinance) | Public |
| 14 | `market_analytics.py` | `/api/v1/market` | market-analytics | Dual | Public |
| 15 | `stock_data.py` | `/api/v1/stocks` | stock-data | Dual | Public |
| 16 | `sqlite_entities.py` | `/api/entities` | entities | SQLite only | Public |
| 17 | `charts_analytics.py` | `/api/charts` | charts-analytics | Dual | Public |
| 18 | `charts.py` (PG) | `/api/charts` | charts | PG only | Public |

**Total endpoints: 48 unique endpoint paths** across 18 route files.

---

## 2. Input Validation Audit

### 2.1 Ticker Validation

| Endpoint | Validation | Status |
|----------|-----------|--------|
| `GET /api/v1/stocks/{ticker}/dividends` | `validate_ticker()` regex | OK |
| `GET /api/v1/stocks/{ticker}/summary` | `validate_ticker()` regex | OK |
| `GET /api/v1/stocks/{ticker}/financials` | `validate_ticker()` regex + whitelist for `statement` | OK |
| `GET /api/v1/stocks/compare` | `validate_ticker_list()` (2-5) | OK |
| `GET /api/v1/stocks/quotes` | `validate_ticker_list()` (1-50) | OK |
| `GET /api/v1/charts/{ticker}/ohlcv` | `validate_ticker()` regex | OK |
| `GET /api/v1/charts/{ticker}/health` | `validate_ticker()` regex | OK |
| `GET /api/entities/{ticker}` (SQLite) | `_normalize_ticker()` only | **[Bug]** |
| `GET /api/entities/{ticker}` (PG) | `_normalize_ticker()` only | **[Bug]** |
| `GET /api/reports/ticker/{ticker}` | No validation | **[Bug]** |
| `GET /api/news/ticker/{ticker}` | No validation | **[Bug]** |

**Finding B-01 [Bug]: Entities endpoints lack ticker validation.** Both `sqlite_entities.py:228` and `entities.py:163` use `_normalize_ticker()` which only adds `.SR` suffix to numeric inputs but does not reject malformed tickers. An input like `../../etc` would pass through to the SQL query. The parameterized query prevents SQL injection, but the lack of validation means unnecessary DB lookups and confusing 404 responses for garbage input.

**Finding B-02 [Bug]: Reports and news (PG) ticker path params lack validation.** `reports.py:83` (`/api/reports/ticker/{ticker}`) and `news.py:77` (`/api/news/ticker/{ticker}`) pass the ticker directly to the service layer without calling `validate_ticker()`. Same risk as B-01.

### 2.2 Pagination Bounds

| Endpoint | Limit Bound | Status |
|----------|------------|--------|
| `GET /api/v1/news/feed` | `le=100` | OK |
| `GET /api/v1/news/search` | `le=100` | OK |
| `GET /api/v1/market/movers` | `le=100` | OK |
| `GET /api/entities` (SQLite) | `le=500` | **[Best Practice]** |
| `GET /api/entities` (PG) | `le=500` | **[Best Practice]** |
| `GET /api/charts/top-companies` | `le=50` | OK |
| `GET /api/charts/dividend-yield-top` | `le=50` | OK |
| PG-backed PaginationParams | `le=100` | OK |

**Finding BP-01 [Best Practice]: Entity list endpoints allow up to 500 items per page.** Both `sqlite_entities.py:130` and `entities.py:54` set `le=500`, which is generous compared to the `le=100` standard used elsewhere. This could return large payloads (~500 full entity rows). Consider reducing to `le=100` for consistency.

### 2.3 Query Parameter Validation

| Endpoint | Param | Validation | Status |
|----------|-------|-----------|--------|
| `GET /api/v1/market/movers` | `type` | `pattern="^(gainers|losers)$"` | OK |
| `GET /api/v1/stocks/{ticker}/financials` | `statement` | Whitelist check | OK |
| `GET /api/v1/stocks/{ticker}/financials` | `period_type` | String check | OK |
| `GET /api/v1/charts/tasi/index` | `period` | `VALID_PERIODS` set check | OK |
| `GET /api/v1/charts/{ticker}/ohlcv` | `period` | `VALID_PERIODS` set check | OK |
| `GET /api/v1/news/search` | `q` | `min_length=1` | OK |
| `POST /api/auth/register` | `password` | `min_length=8, max_length=128` | OK |
| `POST /api/auth/register` | `email` | `EmailStr` (pydantic) | OK |
| `GET /api/v1/news/feed` | `date_from/date_to` | No format validation | **[Best Practice]** |

**Finding BP-02 [Best Practice]: Date filter params lack format validation.** `news_feed.py:84-85` accepts `date_from` and `date_to` as plain strings with no ISO format validation. Invalid date strings would silently produce no results or pass through to SQLite where behavior is undefined.

---

## 3. Error Handling Audit

### 3.1 Try/Except Coverage

| Route File | Handlers | Has try/except | Status |
|-----------|----------|---------------|--------|
| `health.py` | 3 | No (delegates to service) | OK - middleware catches |
| `auth.py` | 5 | Partial (refresh has explicit) | OK |
| `news_feed.py` | 5 | No | **[Best Practice]** |
| `news_stream.py` | 1 | Yes (in generator) | OK |
| `widgets_stream.py` | 1 | Yes (in generators) | OK |
| `market_overview.py` | 1 | Yes (per-instrument) | OK |
| `market_analytics.py` | 4 | Yes (all handlers) | OK |
| `stock_data.py` | 5 | Partial | **[Best Practice]** |
| `sqlite_entities.py` | 3 | Yes (list + detail) | OK |
| `charts_analytics.py` | 4 | Yes (all handlers) | OK |
| `tasi_index.py` | 2 | Partial | OK |
| `stock_ohlcv.py` | 2 | Partial | OK |
| `reports.py` | 4 | No explicit try/except | **[Best Practice]** |
| `news.py` (PG) | 5 | No explicit try/except | **[Best Practice]** |
| `announcements.py` | 5 | No explicit try/except | **[Best Practice]** |
| `watchlists.py` | 7 | No explicit try/except | **[Best Practice]** |
| `entities.py` (PG) | 3 | Partial (list only) | OK |
| `charts.py` (PG) | 4 | No explicit try/except | **[Best Practice]** |

**Finding BP-03 [Best Practice]: Several route files rely entirely on middleware for error handling.** The `ErrorHandlerMiddleware` (`middleware/error_handler.py`) catches unhandled exceptions and returns consistent JSON errors. This is architecturally valid, but the PG-backed services (`news.py`, `announcements.py`, `watchlists.py`, `charts.py`) and `news_feed.py` have no try/except blocks. If the service layer raises a `psycopg2.OperationalError` or similar, the middleware will catch it as a generic 500 rather than a targeted 503 "Database temporarily unavailable" response. The dual-backend routes (market_analytics, charts_analytics, sqlite_entities) handle this correctly by catching DB errors and raising 503.

### 3.2 Consistent Error Response Schema

The project has two error response shapes:

1. **ErrorHandlerMiddleware**: `{"error": {"code": "...", "message": "...", "request_id": "..."}}` (used by middleware)
2. **HTTPException default**: `{"detail": "..."}` (used by some handlers before middleware catches them)

**Finding BP-04 [Best Practice]: Error shape is unified via `install_exception_handlers()`.** The `install_exception_handlers()` function in `error_handler.py:137` overrides FastAPI's default HTTPException handler to use the `{"error": {...}}` shape. This means all errors, including HTTPException, return the consistent format. This is correctly implemented.

---

## 4. Async Correctness Audit

| Route File | All `async def`? | Blocking calls wrapped? | Status |
|-----------|-----------------|------------------------|--------|
| `health.py` | Yes | `asyncio.to_thread(get_health)` | OK |
| `auth.py` | Yes | Service calls are sync but fast | **[Best Practice]** |
| `news_feed.py` | Yes | Uses `aget_*` async wrappers | OK |
| `news_stream.py` | Yes | Uses `aget_latest_news` | OK |
| `widgets_stream.py` | Yes | `asyncio.to_thread` for Redis | OK |
| `market_overview.py` | Yes | `asyncio.to_thread` per instrument | OK |
| `market_analytics.py` | Yes | `afetchall/afetchone` (async wrappers) | OK |
| `stock_data.py` | Yes | `afetchall/afetchone` + `asyncio.to_thread` for compare | OK |
| `sqlite_entities.py` | Yes | `afetchall/afetchone` | OK |
| `charts_analytics.py` | Yes | `afetchall` | OK |
| `tasi_index.py` | Yes | `fetch_tasi_index` is sync! | **[Bug]** |
| `stock_ohlcv.py` | Yes | `fetch_stock_ohlcv` is sync! | **[Bug]** |
| `reports.py` | Yes | `asyncio.to_thread` everywhere | OK |
| `news.py` (PG) | Yes | `asyncio.to_thread` everywhere | OK |
| `announcements.py` | Yes | `asyncio.to_thread` everywhere | OK |
| `watchlists.py` | Yes | `asyncio.to_thread` everywhere | OK |
| `entities.py` (PG) | Yes | `asyncio.to_thread` for queries | OK |
| `charts.py` (PG) | Yes | `asyncio.to_thread` for queries | OK |

**Finding B-03 [Bug]: TASI index and stock OHLCV handlers call synchronous functions without wrapping.** In `tasi_index.py:73`, `fetch_tasi_index(period=period)` is called directly in an async handler. If the underlying yfinance call is slow (network I/O, 10s timeout), it blocks the event loop. Similarly, `stock_ohlcv.py:82` calls `fetch_stock_ohlcv()` synchronously. Both should be wrapped in `asyncio.to_thread()`. The `@cache_response` decorator on `market_overview.py` does this correctly, but these two endpoints do not.

**Finding BP-05 [Best Practice]: Auth service calls in `auth.py` are synchronous.** The `_get_auth_service()` call and subsequent `service.register()/login()` calls (`auth.py:75,109`) are synchronous database operations. They should ideally be wrapped in `asyncio.to_thread()`. However, since auth endpoints have a 10rpm rate limit and PG queries are fast, this is low-priority.

---

## 5. Authentication Audit

### 5.1 Endpoint Authentication Matrix

| Endpoint | Auth Required? | Mechanism | Status |
|----------|---------------|-----------|--------|
| `POST /api/auth/register` | No | N/A | OK |
| `POST /api/auth/login` | No | N/A | OK |
| `POST /api/auth/guest` | No | N/A | OK |
| `POST /api/auth/refresh` | No (token in body) | Refresh token validation | OK |
| `GET /api/auth/me` | Yes | `get_current_user` | OK |
| `GET /api/reports` | No | Public | OK |
| `GET /api/reports/{id}` | No | Public | OK |
| `POST /api/reports` | Yes | `get_current_user` | OK |
| `GET /api/news` (PG) | No | Public | OK |
| `POST /api/news` (PG) | Yes | `get_current_user` | OK |
| `GET /api/announcements` | No | Public | OK |
| `POST /api/announcements` | Yes | `get_current_user` | OK |
| `GET /api/watchlists` | Yes | `get_current_user` | OK |
| `POST /api/watchlists` | Yes | `get_current_user` | OK |
| `PATCH /api/watchlists/{id}` | Yes | `get_current_user` | OK |
| `DELETE /api/watchlists/{id}` | Yes | `get_current_user` | OK |
| `GET /api/watchlists/alerts` | Yes | `get_current_user` | OK |
| `POST /api/watchlists/alerts` | Yes | `get_current_user` | OK |
| `DELETE /api/watchlists/alerts/{id}` | Yes | `get_current_user` | OK |
| All `/api/v1/*` endpoints | No | Public | OK |
| `POST /api/vanna/v2/chat_sse` | Optional (PG) | Middleware validation | OK |

**Finding BP-06 [Best Practice]: No admin-only endpoints are actively used.** The `require_admin` dependency in `auth/dependencies.py:121` is defined but no route uses it. The `POST /api/reports`, `POST /api/news`, and `POST /api/announcements` write endpoints only require basic authentication (`get_current_user`), meaning any authenticated user (including guests) can create reports and announcements. Consider restricting write endpoints to admin users.

**Finding B-04 [Bug]: Guest users can create reports and announcements.** The `POST /api/auth/guest` endpoint issues a token with a guest user ID. This token satisfies the `get_current_user` dependency on write endpoints. However, `get_current_user` in `auth/dependencies.py:81` performs a database lookup (`SELECT ... FROM users WHERE id = %s`), which would fail for guest IDs (they're not in the users table). This means guest tokens actually fail on write endpoints with a 401, which is the correct behavior incidentally but not by design -- it's a side effect of the DB lookup. In SQLite mode, the `get_current_user` dependency will fail entirely because it imports `get_db_connection` which expects PostgreSQL.

---

## 6. Rate Limiting Audit

Configured in `app.py:296-301`:

| Path Prefix | Limit (rpm) | Endpoints Affected |
|------------|-------------|-------------------|
| `/api/auth/login` | 10 | Login only |
| `/api/auth/register` | 10 | Registration only |
| `/api/v1/charts` | 120 | TASI index, stock OHLCV, charts analytics |
| `/health` | Skipped | All health endpoints |
| Default | 60 | Everything else |

**Finding BP-07 [Best Practice]: Rate limit tiers could be more granular.** The `/api/v1/charts` prefix at 120 rpm is generous but makes sense for chart-heavy UIs. However, the SSE endpoints (`/api/v1/news/stream`, `/api/v1/widgets/quotes/stream`) use the default 60 rpm limit, which is fine since they're long-lived connections (one request opens the stream). The market overview endpoint (`/api/v1/market-overview`) calls yfinance 10 times concurrently and is cached for 60s, but has no elevated limit -- at 60 rpm default it's adequately protected.

**Finding BP-08 [Best Practice]: Rate limiting is disabled in debug mode.** Per `app.py:291`, `if not _debug_mode:` gates the rate limiter. This is intentional for development but should be documented as a deployment risk if `SERVER_DEBUG=true` leaks to production.

---

## 7. Response Schemas Audit

### 7.1 Pydantic Response Models

| Endpoint | `response_model` Defined? | Status |
|----------|--------------------------|--------|
| `GET /health` | `HealthResponse` | OK |
| `GET /health/live` | No (returns dict) | **[Best Practice]** |
| `GET /health/ready` | No (returns dict) | **[Best Practice]** |
| `GET /api/v1/news/feed` | `NewsFeedResponse` | OK |
| `GET /api/v1/news/feed/{id}` | `NewsArticle` | OK |
| `GET /api/v1/news/feed/batch` | `NewsFeedResponse` | OK |
| `GET /api/v1/news/search` | `NewsFeedResponse` | OK |
| `GET /api/v1/news/sources` | `NewsSourcesResponse` | OK |
| `GET /api/v1/news/stream` | No (SSE) | OK (SSE doesn't use response_model) |
| `GET /api/v1/widgets/quotes/stream` | No (SSE) | OK |
| `GET /api/v1/market-overview` | `MarketOverviewResponse` | OK |
| `GET /api/v1/market/movers` | `MoversResponse` | OK |
| `GET /api/v1/market/summary` | `MarketSummary` | OK |
| `GET /api/v1/market/sectors` | `List[SectorAnalytics]` | OK |
| `GET /api/v1/market/heatmap` | `List[HeatmapItem]` | OK |
| `GET /api/v1/stocks/{t}/dividends` | `DividendData` | OK |
| `GET /api/v1/stocks/{t}/summary` | `FinancialSummaryData` | OK |
| `GET /api/v1/stocks/{t}/financials` | `FinancialsResponse` | OK |
| `GET /api/v1/stocks/compare` | `CompareResponse` | OK |
| `GET /api/v1/stocks/quotes` | `List[QuoteItem]` | OK |
| `GET /api/v1/charts/tasi/index` | `TASIIndexResponse` | OK |
| `GET /api/v1/charts/tasi/health` | `TASIHealthResponse` | OK |
| `GET /api/v1/charts/{t}/ohlcv` | `StockOHLCVResponse` | OK |
| `GET /api/v1/charts/{t}/health` | `StockHealthResponse` | OK |
| `GET /api/entities` | `EntityListResponse` | OK |
| `GET /api/entities/sectors` | `List[SectorInfo]` | OK |
| `GET /api/entities/{ticker}` | `CompanyFullDetail` / `CompanyDetail` | OK |
| `GET /api/charts/*` | `ChartResponse` | OK |
| `GET /api/reports` | `PaginatedResponse[ReportResponse]` | OK |
| `GET /api/auth/me` | `UserProfile` | OK |
| All auth POST endpoints | `AuthResponse` / `TokenResponse` | OK |
| PG CRUD endpoints | `PaginatedResponse[T]` | OK |

**Finding BP-09 [Best Practice]: Liveness and readiness endpoints lack response_model.** `health.py:53` and `health.py:62` return plain dicts without Pydantic models. While functional, this means the OpenAPI docs show `Any` as the response type.

### 7.2 STANDARD_ERRORS OpenAPI Annotations

Routes using `responses=STANDARD_ERRORS`: news_feed, market_analytics, stock_data, sqlite_entities, charts_analytics, tasi_index, stock_ohlcv. This is good coverage. PG-only routes (news, announcements, watchlists, charts, entities, reports) do NOT use `STANDARD_ERRORS`, resulting in less complete OpenAPI docs for those endpoints.

**Finding BP-10 [Best Practice]: PG-only route files lack `responses=STANDARD_ERRORS`.** The PG routes (`news.py`, `announcements.py`, `watchlists.py`, `charts.py`, `entities.py`) don't annotate their error responses in the OpenAPI spec. Consider adding `responses=STANDARD_ERRORS` to these endpoints for complete API documentation.

---

## 8. HTTP Status Codes Audit

| Action | Status Code | Status |
|--------|-----------|--------|
| `POST /api/auth/register` | 201 | OK |
| `POST /api/reports` | 201 | OK |
| `POST /api/news` (PG) | 201 | OK |
| `POST /api/announcements` | 201 | OK |
| `POST /api/watchlists` | 201 | OK |
| `POST /api/watchlists/alerts` | 201 | OK |
| `DELETE /api/watchlists/{id}` | 204 | OK |
| `DELETE /api/watchlists/alerts/{id}` | 204 | OK |
| Not found responses | 404 | OK |
| Rate limited | 429 | OK |
| PG-only stubs (SQLite mode) | 503 | OK |
| DB unavailable | 503 | OK |
| Invalid token | 401 | OK |
| `POST /api/auth/login` (success) | 200 | OK |
| `POST /api/auth/guest` (success) | 200 | OK |
| `POST /api/watchlists/{id}/tickers` | 200 | **[Best Practice]** |

**Finding BP-11 [Best Practice]: `POST /api/watchlists/{id}/tickers` returns 200 instead of 201.** Adding a ticker to a watchlist is a partial resource modification, so 200 is acceptable. However, since it's semantically "adding a sub-resource", 200 is the correct choice here (not a creation of a new resource).

---

## 9. Frontend-Backend Mismatch Audit

Comparing `frontend/src/lib/api-client.ts` with actual backend routes:

### 9.1 URL Mismatches

| Frontend Function | Frontend URL | Backend URL | Match? |
|------------------|-------------|------------|--------|
| `getHealth()` | `/health` | `GET /health` | OK |
| `getNews()` | `/api/news` | `GET /api/news` (PG) | OK |
| `getNewsByTicker()` | `/api/news/ticker/{t}` | `GET /api/news/ticker/{t}` | OK |
| `getReports()` | `/api/reports` | `GET /api/reports` | OK |
| `getReportsByTicker()` | `/api/reports/ticker/{t}` | `GET /api/reports/ticker/{t}` | OK |
| `getAnnouncements()` | `/api/announcements` | `GET /api/announcements` | OK |
| `getEntities()` | `/api/entities` | `GET /api/entities` | OK |
| `getEntityDetail()` | `/api/entities/{t}` | `GET /api/entities/{t}` | OK |
| `getSectors()` | `/api/entities/sectors` | `GET /api/entities/sectors` | OK |
| `getWatchlists()` | `/api/watchlists` | `GET /api/watchlists` | OK |
| `getChartSectorMarketCap()` | `/api/charts/sector-market-cap` | `GET /api/charts/sector-market-cap` | OK |
| `getChartTopCompanies()` | `/api/charts/top-companies` | `GET /api/charts/top-companies` | OK |
| `getChartSectorPE()` | `/api/charts/sector-pe` | `GET /api/charts/sector-pe` | OK |
| `getChartDividendYieldTop()` | `/api/charts/dividend-yield-top` | `GET /api/charts/dividend-yield-top` | OK |
| `getOHLCVData()` | `/api/v1/charts/{t}/ohlcv` | `GET /api/v1/charts/{t}/ohlcv` | OK |
| `getTasiIndex()` | `/api/v1/charts/tasi/index` | `GET /api/v1/charts/tasi/index` | OK |
| `getNewsFeed()` | `/api/v1/news/feed` | `GET /api/v1/news/feed` | OK |
| `getNewsArticle()` | `/api/v1/news/feed/{id}` | `GET /api/v1/news/feed/{id}` | OK |
| `searchNewsFeed()` | `/api/v1/news/search` | `GET /api/v1/news/search` | OK |
| `getNewsFeedByIds()` | `/api/v1/news/feed/batch` | `GET /api/v1/news/feed/batch` | OK |
| `getNewsSources()` | `/api/v1/news/sources` | `GET /api/v1/news/sources` | OK |
| `getMarketMovers()` | `/api/v1/market/movers` | `GET /api/v1/market/movers` | OK |
| `getMarketSummary()` | `/api/v1/market/summary` | `GET /api/v1/market/summary` | OK |
| `getSectorPerformance()` | `/api/v1/market/sectors` | `GET /api/v1/market/sectors` | OK |
| `getMarketHeatmap()` | `/api/v1/market/heatmap` | `GET /api/v1/market/heatmap` | OK |
| `getStockDividends()` | `/api/v1/stocks/{t}/dividends` | `GET /api/v1/stocks/{t}/dividends` | OK |
| `getStockFinancialSummary()` | `/api/v1/stocks/{t}/summary` | `GET /api/v1/stocks/{t}/summary` | OK |
| `getStockFinancials()` | `/api/v1/stocks/{t}/financials` | `GET /api/v1/stocks/{t}/financials` | OK |
| `compareStocks()` | `/api/v1/stocks/compare` | `GET /api/v1/stocks/compare` | OK |
| `getBatchQuotes()` | `/api/v1/stocks/quotes` | `GET /api/v1/stocks/quotes` | OK |

All URL paths match correctly.

### 9.2 Response Shape Mismatches

**Finding M-01 [Mismatch]: `EntityListResponse` missing `total` field in frontend type.** The backend `EntityListResponse` (sqlite_entities.py:41) includes `total: int = 0` for pagination, but the frontend TypeScript interface (`api-client.ts:84-87`) only defines `items` and `count`, missing `total`. This means the frontend cannot properly calculate total pages for entity listing.

```typescript
// Frontend (api-client.ts:84)
export interface EntityListResponse {
  items: CompanySummary[];
  count: number;
  // MISSING: total: number;
}
```

**Finding M-02 [Mismatch]: `MarketMover` type diverges from backend.** The frontend `MarketMover` interface (`api-client.ts:528-537`) includes `company_name_ar` and `company_name_en` fields, but the backend `MoverItem` (`market_analytics.py:36-42`) returns `short_name` instead. The frontend type also expects all fields as non-nullable (`current_price: number`), but the backend has them as `Optional`.

```typescript
// Frontend expects:
company_name_ar: string;  // Backend sends: short_name (which is in English)
company_name_en: string;  // Backend doesn't send this at all
current_price: number;     // Backend: Optional[float] (can be null)
```

**Finding M-03 [Mismatch]: `getMarketMovers` expects array but backend returns object.** The frontend function `getMarketMovers()` (`api-client.ts:639-644`) has return type `Promise<MarketMover[]>` (an array), but the backend endpoint `GET /api/v1/market/movers` returns `MoversResponse` which is `{ items: [...], type: "...", count: N }`. The frontend should expect the wrapper object, not a flat array.

**Finding M-04 [Mismatch]: `StockDividends.five_year_avg_dividend_yield` vs backend field name.** The frontend type (`api-client.ts:576`) uses `five_year_avg_dividend_yield` but the backend `DividendData` model (`stock_data.py:136`) sends `avg_dividend_yield_5y`. This field name mismatch means the frontend will never see this value.

**Finding M-05 [Mismatch]: `FinancialSummary` field name differences.** The frontend type (`api-client.ts:584-597`) uses `gross_profit` and `revenue_per_share`, but the backend `FinancialSummaryData` (`stock_data.py:141-155`) sends `gross_profits` (plural) and does not include `revenue_per_share` (it includes `total_cash_per_share` instead).

**Finding M-06 [Mismatch]: `CompanyDetail` frontend type is incomplete.** The frontend `CompanyDetail` interface (`api-client.ts:89-115`) has ~25 fields, but the backend `CompanyFullDetail` (sqlite_entities.py:53-120) returns ~55 fields. Fields like `open_price`, `avg_50d`, `avg_200d`, `shares_outstanding`, `pct_held_insiders`, `dividend_rate`, `dividend_yield`, `total_revenue`, `total_debt`, `ebitda`, etc. are available from the backend but not typed in the frontend. While this doesn't cause runtime errors (extra fields are ignored), it means the frontend cannot use them without type assertions.

**Finding M-07 [Mismatch]: `BatchQuote` expects `name` but backend sends `short_name`.** The frontend `BatchQuote` interface (`api-client.ts:624-633`) has `name: string` as a primary field, but the backend `QuoteItem` (`stock_data.py:180-187`) sends `short_name`. The frontend does have `short_name?: string | null` as an optional field, but the primary `name` field will be undefined.

**Finding M-08 [Mismatch]: `HealthResponse` frontend type missing fields.** The frontend `HealthResponse` (`api-client.ts:147-150`) only has `status` and `components`, but the backend `HealthResponse` (`api/schemas/health.py`) also returns `service`, `version`, and `uptime_seconds`.

---

## 10. Pagination Audit

| Endpoint | Pagination Style | Status |
|----------|-----------------|--------|
| `GET /api/v1/news/feed` | offset/limit | OK (bounded le=100) |
| `GET /api/v1/news/search` | offset/limit | OK (bounded le=100) |
| `GET /api/v1/market/movers` | limit only | OK (bounded le=100) |
| `GET /api/entities` | offset/limit | OK (bounded le=500) |
| `GET /api/reports` | page/page_size via PaginationParams | OK (bounded le=100) |
| `GET /api/news` (PG) | page/page_size via PaginationParams | OK (bounded le=100) |
| `GET /api/announcements` | page/page_size via PaginationParams | OK (bounded le=100) |
| `GET /api/v1/market/summary` | No (fixed 5 movers) | OK |
| `GET /api/v1/market/sectors` | No (returns all) | OK (bounded by sector count ~20) |
| `GET /api/v1/market/heatmap` | No (returns all ~500) | **[Best Practice]** |

**Finding BP-12 [Best Practice]: Heatmap endpoint returns all ~500 stocks without pagination.** `market_analytics.py:183` returns all stocks with market data for heatmap rendering. While this is expected for a treemap/heatmap visualization that needs all data points, the response can be large (~50KB+). The response is already GZip-compressed by middleware (1000 byte threshold), which mitigates this.

### 10.1 Pagination Style Inconsistency

**Finding BP-13 [Best Practice]: Two different pagination styles are used.** The `v1` endpoints (news_feed, market) use `offset/limit` style, while the PG-backed endpoints (news, reports, announcements) use `page/page_size` via `PaginationParams`. This is intentional (PG routes were added later with a more structured approach), but frontend developers must handle both patterns.

---

## 11. OpenAPI Documentation Audit

### 11.1 Docstrings

All endpoints have docstrings describing their purpose, which FastAPI uses for OpenAPI descriptions. This is well done.

### 11.2 OpenAPI Metadata

`app.py:198-220` sets comprehensive OpenAPI metadata:
- Title, description, version
- 14 tag groups with descriptions
- `responses=STANDARD_ERRORS` on most v1 endpoints

**Finding BP-14 [Best Practice]: No OpenAPI tag for `market-overview`.** The `market-overview` tag is defined in `app.py:212` but the tag name is `market-overview`, which matches the route. This is correct.

### 11.3 Missing OpenAPI Tags

The Vanna chat endpoints (`/api/vanna/v2/chat_sse`, `/api/vanna/v2/chat_poll`) are registered by the Vanna framework and don't appear in the custom OpenAPI tags. This is expected behavior -- they appear in the auto-generated docs under their framework-assigned tags.

---

## 12. Additional Findings

**Finding B-05 [Bug]: SQL injection vector in `stock_data.py` compare endpoint.** In `stock_data.py:353-356`, the compare endpoint constructs SQL with `f"SELECT {col_list} FROM {table}"` where `table` comes from `_METRIC_MAP` values and `col_list` from validated metric names. Since both are sourced from hardcoded dictionaries (`_METRIC_MAP` at lines 37-120) and never from user input, this is NOT an actual SQL injection vulnerability. The table and column names are validated against the whitelist. However, the pattern of using f-strings for SQL is a code smell that should be clearly commented.

**Finding B-06 [Bug]: `_normalize_ticker` inconsistency between PG and SQLite entities.** Both `sqlite_entities.py:215` and `entities.py:150` have identical `_normalize_ticker()` functions. However, neither uses the centralized `validate_ticker()` from `models/validators.py`. This duplication should be consolidated.

**Finding MF-01 [Missing Feature]: No endpoint for deleting reports.** The reports API has `GET` (list/detail) and `POST` (create) but no `DELETE` or `PUT/PATCH` endpoints. Once created, reports cannot be updated or removed via the API.

**Finding MF-02 [Missing Feature]: No endpoint for deleting news articles.** Similarly, the PG news API (`news.py`) has no `DELETE` endpoint. Articles can only be created.

**Finding MF-03 [Missing Feature]: No endpoint for news feed article counts by source.** While `GET /api/v1/news/sources` returns source names with counts, there's no endpoint for time-series article counts (e.g., articles per hour/day per source) which would be useful for monitoring scraper health.

**Finding BP-15 [Best Practice]: Duplicate route definitions for charts and entities.** Both `charts.py` (PG-specific) and `charts_analytics.py` (dual-backend) register routes under `/api/charts/*`. Similarly, `entities.py` (PG) and `sqlite_entities.py` (SQLite) register under `/api/entities`. In PG mode, both chart routers are registered, which means duplicate routes exist. FastAPI uses first-match routing, so the PG version (registered first in `app.py:377`) takes precedence and the dual-backend version at `app.py:540` is never reached. This doesn't cause errors but is wasteful.

**Finding BP-16 [Best Practice]: `news_feed.py` response model `NewsArticle` includes `priority` field.** The `NewsArticle` model in `news_feed.py:53` includes `priority: int = 3`, but the frontend `NewsFeedItem` type also expects this field and uses it. This is correctly aligned.

---

## 13. Findings Summary

### Bugs (6)

| ID | Severity | Description | File:Line |
|----|----------|-------------|-----------|
| B-01 | Medium | Entity endpoints lack ticker validation (accept arbitrary strings) | `sqlite_entities.py:228`, `entities.py:163` |
| B-02 | Medium | Reports and PG news ticker path params lack validation | `reports.py:83`, `news.py:77` |
| B-03 | High | TASI index and stock OHLCV handlers call sync functions without `asyncio.to_thread()`, blocking the event loop during yfinance network I/O | `tasi_index.py:73`, `stock_ohlcv.py:82` |
| B-04 | Low | Guest tokens fail on write endpoints due to DB lookup side effect, not by design | `auth/dependencies.py:81-98` |
| B-05 | Info | SQL f-string pattern in compare endpoint (not exploitable but code smell) | `stock_data.py:353-356` |
| B-06 | Low | Duplicate `_normalize_ticker()` not using centralized `validate_ticker()` | `sqlite_entities.py:215`, `entities.py:150` |

### Mismatches (8)

| ID | Severity | Description |
|----|----------|-------------|
| M-01 | Medium | Frontend `EntityListResponse` missing `total` field |
| M-02 | High | Frontend `MarketMover` has wrong field names (`company_name_ar/en` vs `short_name`) |
| M-03 | High | Frontend `getMarketMovers` expects array, backend returns `MoversResponse` object |
| M-04 | Medium | Frontend `StockDividends.five_year_avg_dividend_yield` vs backend `avg_dividend_yield_5y` |
| M-05 | Medium | Frontend `FinancialSummary.gross_profit` vs backend `gross_profits` |
| M-06 | Low | Frontend `CompanyDetail` type has fewer fields than backend response |
| M-07 | Medium | Frontend `BatchQuote.name` vs backend `QuoteItem.short_name` |
| M-08 | Low | Frontend `HealthResponse` type missing `service`, `version`, `uptime_seconds` |

### Missing Features (3)

| ID | Description |
|----|-------------|
| MF-01 | No DELETE/PUT endpoint for reports |
| MF-02 | No DELETE endpoint for PG news articles |
| MF-03 | No time-series article count endpoint for scraper health monitoring |

### Best Practices (16)

| ID | Description |
|----|-------------|
| BP-01 | Entity list endpoints allow up to 500 items (vs 100 standard) |
| BP-02 | Date filter params lack ISO format validation |
| BP-03 | PG-backed routes rely entirely on middleware for error handling (no targeted 503) |
| BP-04 | Error shape is unified via `install_exception_handlers()` (positive finding) |
| BP-05 | Auth service calls in `auth.py` are synchronous (low priority) |
| BP-06 | `require_admin` dependency defined but unused; write endpoints allow any authenticated user |
| BP-07 | Rate limit tiers are adequate for current use |
| BP-08 | Rate limiting disabled in debug mode |
| BP-09 | Liveness/readiness endpoints lack response_model |
| BP-10 | PG-only routes lack `responses=STANDARD_ERRORS` OpenAPI annotations |
| BP-11 | `POST .../tickers` returns 200 (acceptable) |
| BP-12 | Heatmap returns all ~500 stocks (mitigated by GZip) |
| BP-13 | Two pagination styles (offset/limit vs page/page_size) |
| BP-14 | OpenAPI tags are comprehensive |
| BP-15 | Duplicate route registrations for charts/entities in PG mode |
| BP-16 | News priority field correctly aligned |

---

## 14. Priority Recommendations

### Immediate (Fix Before Next Release)

1. **B-03**: Wrap `fetch_tasi_index()` and `fetch_stock_ohlcv()` in `asyncio.to_thread()` to prevent event loop blocking during yfinance network I/O.
2. **M-02 + M-03**: Fix frontend `MarketMover` type to match backend `MoverItem` shape and fix `getMarketMovers()` return type to expect `MoversResponse` wrapper.

### Short-term (Next Sprint)

3. **B-01 + B-02**: Add `validate_ticker()` calls to entity detail endpoints and PG news/reports ticker path params.
4. **M-04 + M-05 + M-07**: Align frontend type field names with backend response field names for dividends, financial summary, and batch quotes.
5. **M-01**: Add `total` field to frontend `EntityListResponse` type.

### Medium-term (Backlog)

6. **BP-06**: Decide which write endpoints should require admin access and apply `require_admin`.
7. **BP-03**: Add targeted try/except blocks to PG-only routes for better error messages.
8. **BP-15**: Avoid registering duplicate chart/entity routes in PG mode.
9. **MF-01 + MF-02**: Add DELETE endpoints for reports and news if needed by the UI.
10. **BP-13**: Consider standardizing on one pagination style across all endpoints.
