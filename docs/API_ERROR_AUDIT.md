# API Error Handling Consistency Audit

**Date**: 2026-02-13
**Scope**: All route handlers in `app.py` and `api/routes/` (16 files), plus `middleware/error_handler.py`

---

## 1. Executive Summary

The API has **three distinct error response shapes** used inconsistently across endpoints:

| Shape | Example | Used By |
|-------|---------|---------|
| **A**: `{"error": {"code": "...", "message": "..."}}` | ErrorHandlerMiddleware | Unhandled exceptions only |
| **B**: `{"detail": "..."}` | FastAPI HTTPException default | Most route handlers |
| **C**: `{"detail": "...", "endpoint_prefix": "..."}` | SQLite stub routes | app.py stub handlers |

Additionally, the `RateLimitMiddleware` returns `{"detail": "Too many requests"}` (shape B variant).

**No endpoint includes a `request_id` in error responses.**

---

## 2. Middleware Assessment

### 2.1 ErrorHandlerMiddleware (`middleware/error_handler.py`)

- **Response format**: `{"error": {"code": "...", "message": "..."}}`
- **Exception mapping**: `ValueError` -> 400, `PermissionError` -> 403, `FileNotFoundError`/`KeyError` -> 404
- **Catch-all**: 500 with generic message (debug shows detail)
- **Missing**: `request_id` field, `ConnectionError` handling, `RequestValidationError` handling
- **Issue**: Shape A conflicts with FastAPI's default HTTPException handler (shape B)

### 2.2 RateLimitMiddleware (`middleware/rate_limit.py`)

- Returns `{"detail": "Too many requests"}` with `Retry-After` header
- Uses shape B (matches HTTPException default)
- No `request_id`

### 2.3 RequestLoggingMiddleware (`middleware/request_logging.py`)

- Logs: method, path, status_code, duration_ms, client_ip
- **Missing**: `request_id`, JSON structured format, IP anonymization
- Skips configurable paths (default: `/health`, `/favicon.ico`)
- Does NOT skip `/docs` or `/openapi.json`

### 2.4 CORS Middleware (`middleware/cors.py`)

- Standard FastAPI CORSMiddleware wrapper, no error handling concerns

---

## 3. Per-Endpoint Audit

### 3.1 `app.py` (Direct Routes)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /` | custom_index | No try/except | HTMLResponse | File read can raise `FileNotFoundError`; caught by middleware (shape A) |
| `GET /favicon.ico` | favicon | Checks `exists()` | HTMLResponse/FileResponse | No error possible; returns empty HTML if missing |
| `POST /api/vanna/v2/chat_sse` | PG auth middleware | Returns 401 JSONResponse | `{"detail": "..."}` (shape B) | Only active in postgres mode |
| SQLite stub routes (`/api/news`, etc.) | GET | Returns 503 | `{"detail": "...", "endpoint_prefix": "..."}` (shape C) | Non-standard extra field |

### 3.2 `api/routes/health.py`

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /health` | health_check | No try/except | `HealthResponse` model / JSONResponse(503) | Service errors propagate as unhandled exceptions (caught by middleware as shape A) |

**Issue**: If `get_health()` raises, middleware returns shape A while explicit 503 uses Pydantic model -- two different shapes for same endpoint.

### 3.3 `api/routes/news.py` (PG-only)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/news` | list_news | No try/except | `PaginatedResponse[NewsResponse]` | Service exceptions unhandled (shape A via middleware) |
| `GET /api/news/ticker/{ticker}` | news_by_ticker | No try/except | `PaginatedResponse[NewsResponse]` | Same |
| `GET /api/news/sector/{sector}` | news_by_sector | No try/except | `PaginatedResponse[NewsResponse]` | Same |
| `GET /api/news/{article_id}` | get_article | HTTPException(404) | `{"detail": "Article not found"}` (shape B) | OK for 404; service exceptions unhandled |
| `POST /api/news` | create_article | Auth dependency | `NewsResponse` | Auth errors handled by dependency; service exceptions unhandled |

### 3.4 `api/routes/reports.py` (PG-only)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/reports` | list_reports | No try/except | `PaginatedResponse[ReportResponse]` | Service exceptions unhandled |
| `GET /api/reports/ticker/{ticker}` | reports_by_ticker | No try/except | `PaginatedResponse[ReportResponse]` | Same |
| `GET /api/reports/{report_id}` | get_report | HTTPException(404) | `{"detail": "Report not found"}` (shape B) | OK for 404 |
| `POST /api/reports` | create_report | Auth dependency | `ReportResponse` | Service exceptions unhandled |

### 3.5 `api/routes/announcements.py` (PG-only)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/announcements` | list_announcements | No try/except | `PaginatedResponse[AnnouncementResponse]` | Service exceptions unhandled |
| `GET /api/announcements/material` | material_events | No try/except | `PaginatedResponse[AnnouncementResponse]` | Same |
| `GET /api/announcements/sector/{sector}` | announcements_by_sector | No try/except | Same | Same |
| `GET /api/announcements/{id}` | get_announcement | HTTPException(404) | `{"detail": "..."}` (shape B) | OK |
| `POST /api/announcements` | create_announcement | Auth dependency | `AnnouncementResponse` | Service exceptions unhandled |

### 3.6 `api/routes/watchlists.py` (PG-only, all authenticated)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/watchlists` | list_watchlists | Auth dependency | `List[WatchlistResponse]` | Service exceptions unhandled |
| `POST /api/watchlists` | create_watchlist | Auth dependency | `WatchlistResponse` | Same |
| `POST /api/watchlists/{id}/tickers` | add_ticker | Auth + HTTPException(404) | shape B | OK |
| `PATCH /api/watchlists/{id}` | update_watchlist | Auth + HTTPException(404) | shape B | OK |
| `DELETE /api/watchlists/{id}` | delete_watchlist | Auth + HTTPException(404) | shape B | OK |
| `GET /api/watchlists/alerts` | list_alerts | Auth dependency | `List[AlertResponse]` | Service exceptions unhandled |
| `POST /api/watchlists/alerts` | create_alert | Auth dependency | `AlertResponse` | Same |
| `DELETE /api/watchlists/alerts/{id}` | deactivate_alert | Auth + HTTPException(404) | shape B | OK |

### 3.7 `api/routes/auth.py`

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `POST /api/auth/register` | register | HTTPException(503, 409) | shape B | Good error handling |
| `POST /api/auth/login` | login | HTTPException(503, 401) | shape B | Good error handling |
| `POST /api/auth/guest` | guest_login | No try/except | `AuthResponse` | Token generation could fail |
| `POST /api/auth/refresh` | refresh_token | HTTPException(401) | shape B | Good; catches jwt exceptions |
| `GET /api/auth/me` | get_me | Auth dependency | `UserProfile` | OK |

### 3.8 `api/routes/charts.py` (PG-only)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/charts/sector-market-cap` | sector_market_cap | **No try/except** | `ChartResponse` | psycopg2 errors unhandled |
| `GET /api/charts/top-companies` | top_companies | **No try/except** | `ChartResponse` | Same |
| `GET /api/charts/sector-pe` | sector_avg_pe | **No try/except** | `ChartResponse` | Same |
| `GET /api/charts/dividend-yield-top` | top_dividend_yields | **No try/except** | `ChartResponse` | Same |

**Critical**: These PG-only chart routes have zero error handling. Database connection failures will produce shape A middleware errors.

### 3.9 `api/routes/entities.py` (PG-only)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/entities` | list_entities | **No try/except** | `EntityListResponse` | psycopg2 errors unhandled |
| `GET /api/entities/sectors` | list_sectors | **No try/except** | `List[SectorInfo]` | Same |
| `GET /api/entities/{ticker}` | get_entity | HTTPException(404) | shape B | DB errors still unhandled |

### 3.10 `api/routes/news_feed.py` (SQLite-backed)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/v1/news/feed` | get_news_feed | No try/except | `NewsFeedResponse` | SQLite errors unhandled |
| `GET /api/v1/news/feed/{id}` | get_article | HTTPException(404) | shape B | OK for 404 |
| `GET /api/v1/news/search` | search_articles | No try/except | `NewsFeedResponse` | SQLite errors unhandled |
| `GET /api/v1/news/sources` | get_sources | No try/except | `NewsSourcesResponse` | SQLite errors unhandled |

### 3.11 `api/routes/charts_analytics.py` (Dual-backend)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/charts/sector-market-cap` | sector_market_cap | try/except -> HTTPException(503) | shape B with detail `"Database query failed: {exc}"` | **Leaks exception details** in error message |
| `GET /api/charts/top-companies` | top_companies | try/except -> HTTPException(503) | Same | Same info leak |
| `GET /api/charts/sector-pe` | sector_avg_pe | try/except -> HTTPException(503) | Same | Same info leak |
| `GET /api/charts/dividend-yield-top` | top_dividend_yields | try/except -> HTTPException(503) | Same | Same info leak |

**Issue**: Error messages include raw exception text (`f"Database query failed: {exc}"`), leaking implementation details.

### 3.12 `api/routes/sqlite_entities.py` (Dual-backend)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/entities` | list_entities | try/except -> HTTPException(503) | shape B with detail `"Database query failed: {exc}"` | Leaks exception details |
| `GET /api/entities/sectors` | list_sectors | try/except -> HTTPException(503) | Same | Same |
| `GET /api/entities/{ticker}` | get_entity | try/except + HTTPException(404) | shape B | 404 OK; 503 leaks details |

### 3.13 `api/routes/market_analytics.py` (Dual-backend)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/v1/market/movers` | get_movers | try/except -> HTTPException(503) | shape B with detail leaking | Info leak |
| `GET /api/v1/market/summary` | get_market_summary | try/except -> HTTPException(503) | Same | Same |
| `GET /api/v1/market/sectors` | get_sector_analytics | try/except -> HTTPException(503) | Same | Same |
| `GET /api/v1/market/heatmap` | get_heatmap | try/except -> HTTPException(503) | Same | Same |

### 3.14 `api/routes/stock_data.py` (Dual-backend)

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/v1/stocks/{ticker}/dividends` | get_dividends | HTTPException(404) | shape B | **No try/except around DB calls** |
| `GET /api/v1/stocks/{ticker}/summary` | get_financial_summary | HTTPException(404) | shape B | Same |
| `GET /api/v1/stocks/{ticker}/financials` | get_financials | HTTPException(400, 404) | shape B | Same |
| `GET /api/v1/stocks/compare` | compare_stocks | HTTPException(400) | shape B | No try/except around DB calls |
| `GET /api/v1/stocks/quotes` | get_batch_quotes | HTTPException(400) | shape B | No try/except around DB calls |

### 3.15 `api/routes/stock_ohlcv.py`

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/v1/charts/{ticker}/ohlcv` | get_stock_ohlcv | HTTPException(400) | shape B | Service exceptions unhandled |
| `GET /api/v1/charts/{ticker}/health` | stock_ohlcv_health | No try/except | `StockHealthResponse` | Import error silently handled, but other exceptions unhandled |

### 3.16 `api/routes/tasi_index.py`

| Endpoint | Method | Error Handling | Response Format | Issues |
|----------|--------|----------------|-----------------|--------|
| `GET /api/v1/charts/tasi/index` | get_tasi_index | HTTPException(400) | shape B | Service exceptions unhandled |
| `GET /api/v1/charts/tasi/health` | tasi_health | No try/except | `TASIHealthResponse` | Similar to stock_ohlcv health |

---

## 4. Issues Summary

### 4.1 Inconsistent Error Response Shapes

| Priority | Issue | Count | Impact |
|----------|-------|-------|--------|
| **HIGH** | Three different error response shapes (A, B, C) | All endpoints | Clients cannot reliably parse error responses |
| **HIGH** | No `request_id` in any error response | All endpoints | Cannot correlate client errors with server logs |
| **MEDIUM** | `RequestValidationError` not handled by ErrorHandlerMiddleware | All endpoints | FastAPI default 422 response uses shape B, not shape A |
| **MEDIUM** | `HTTPException` not intercepted by ErrorHandlerMiddleware | All endpoints | Shape B bypasses middleware, producing inconsistent format |

### 4.2 Missing Error Handling

| Priority | Issue | Affected Endpoints | Impact |
|----------|-------|--------------------|--------|
| **HIGH** | PG-only routes (`charts.py`, `entities.py`) have zero try/except | 7 endpoints | Unhandled psycopg2 errors produce 500 with shape A |
| **HIGH** | `stock_data.py` DB calls have no try/except | 5 endpoints | DB errors produce 500 |
| **MEDIUM** | PG service routes (`news.py`, `reports.py`, `announcements.py`, `watchlists.py`) rely entirely on middleware | ~18 endpoints | Inconsistent error shape (A vs B) |
| **LOW** | `news_feed.py` SQLite operations unprotected | 4 endpoints | SQLite errors produce 500 |

### 4.3 Information Leakage

| Priority | Issue | Affected Files | Impact |
|----------|-------|----------------|--------|
| **HIGH** | `f"Database query failed: {exc}"` exposes raw exceptions | `charts_analytics.py`, `sqlite_entities.py`, `market_analytics.py` | Leaks DB structure, query details, connection info |
| **MEDIUM** | No distinction between debug/production error detail | Same files | Always leaks in production |

### 4.4 Status Code Inconsistencies

| Priority | Issue | Details |
|----------|-------|---------|
| **MEDIUM** | Dual-backend routes use 503 for DB errors | `charts_analytics.py`, `sqlite_entities.py`, `market_analytics.py` use 503 |
| **MEDIUM** | PG-only routes let DB errors become 500 | `charts.py`, `entities.py` let psycopg2 errors become 500 via middleware |
| **LOW** | SQLite stub routes use non-standard error shape | app.py stubs add `endpoint_prefix` field |

---

## 5. Recommendations

1. **Unify error response shape**: Adopt `{"error": {"code": "...", "message": "...", "request_id": "..."}}` everywhere by handling `HTTPException` and `RequestValidationError` in `ErrorHandlerMiddleware`
2. **Add `request_id`**: Generate UUID per request in middleware, include in all error responses and logs
3. **Remove info leaks**: Replace `f"Database query failed: {exc}"` with generic messages; log details server-side
4. **Add `ConnectionError` handling**: Map to 503 in ErrorHandlerMiddleware
5. **Add response models**: Create `models/api_responses.py` with standardized Pydantic models for all response types
6. **Protect unguarded routes**: Add try/except to `charts.py`, `entities.py`, `stock_data.py`, `news_feed.py`
