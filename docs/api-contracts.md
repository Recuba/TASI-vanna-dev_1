# Ra'd AI -- API Contracts

> Authoritative reference for every HTTP endpoint exposed by the Ra'd AI backend.
> Generated from source code on 2026-02-10.

---

## Table of Contents

1. [Conventions](#conventions)
2. [Vanna Chat (SSE)](#vanna-chat-sse)
3. [TASI Index Charts](#tasi-index-charts)
4. [Charts (PostgreSQL)](#charts-postgresql)
5. [Entities](#entities)
6. [News](#news)
7. [Reports](#reports)
8. [Announcements](#announcements)
9. [Watchlists & Alerts](#watchlists--alerts)
10. [Auth](#auth)
11. [Health](#health)
12. [Static / UI](#static--ui)
13. [Pagination](#pagination)
14. [Error Responses](#error-responses)

---

## Conventions

| Convention | Detail |
|---|---|
| Base URL | `http://localhost:8084` (dev) or `https://raid-ai-app-production.up.railway.app` (prod) |
| Content-Type | `application/json` for all JSON endpoints |
| Auth header | `Authorization: Bearer <access_token>` (JWT, where noted) |
| User header | `X-User-Id: <user_id>` (watchlist read endpoints) |
| Rate limiting | 60 req/min per IP (disabled in debug mode). `/health` is exempt. |
| CORS origins | `http://localhost:3000`, `http://localhost:8084` (configurable) |
| Backend modes | **SQLite** (default) -- limited to Vanna chat + TASI index + static routes. **PostgreSQL** -- all routes enabled. |

---

## Vanna Chat (SSE)

Provided by `VannaFastAPIServer`. The SSE endpoint streams AI assistant responses.

### POST /api/vanna/v2/chat_sse

**Auth required:** No | **Rate limited:** Yes | **DB backend:** SQLite + PostgreSQL

Stream a natural language query to the AI assistant.

**Request body:**

```json
{
  "message": "Show top 10 companies by market cap"
}
```

**Response:** Server-Sent Events (SSE) stream. Each event is a `data:` line with JSON:

```
data: {"type": "text", "data": {"content": "Let me query..."}}
data: {"type": "sql", "data": {"query": "SELECT ...", "result_file": "abc.csv"}}
data: {"type": "chart", "data": {"html": "<div id='plotly-chart'>...</div>"}}
data: {"type": "text", "data": {"content": "The top 10 companies..."}}
data: [DONE]
```

**SSE event types:**

| type | data shape | description |
|---|---|---|
| `text` | `{content: string}` | Incremental text from the LLM |
| `sql` | `{query: string, result_file: string}` | SQL executed + CSV filename |
| `chart` | `{html: string}` | Plotly chart HTML fragment |
| `error` | `{message: string}` | Error during tool execution |

**Frontend consumer:** `frontend/src/lib/use-sse-chat.ts` -> `AIChatInterface` component.
Also consumed by legacy `templates/index.html` native SSE chat UI.

**curl example:**

```bash
curl -N -X POST http://localhost:8084/api/vanna/v2/chat_sse \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the top 5 companies by market cap?"}'
```

---

## TASI Index Charts

Prefix: `/api/v1/charts/tasi` | Tag: `tasi-index`

Works with **both** SQLite and PostgreSQL backends (no database dependency).

### GET /api/v1/charts/tasi/index

**Auth required:** No | **Rate limited:** Yes | **DB backend:** Any (no DB required)

Return TASI index OHLCV data for TradingView chart rendering.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `period` | string | `1y` | Data period. One of: `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y` |

**Response (200):**

```json
{
  "data": [
    {
      "time": "2025-02-10",
      "open": 11523.45,
      "high": 11598.20,
      "low": 11501.30,
      "close": 11580.10,
      "volume": 185000000
    }
  ],
  "source": "real",
  "last_updated": "2026-02-10T12:00:00.000Z",
  "symbol": "^TASI",
  "period": "1y",
  "count": 252
}
```

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `data` | `TASIOHLCVPoint[]` | Array of OHLCV data points |
| `source` | `"real" \| "mock" \| "cached"` | Data origin |
| `last_updated` | string (ISO 8601) | Timestamp of the data |
| `symbol` | string | Yahoo Finance symbol used (`^TASI` or `TASI.SR`) |
| `period` | string | Echo of the requested period |
| `count` | int | Number of data points |

**Error (400):**

```json
{
  "detail": "Invalid period 'bad'. Must be one of: 1mo, 3mo, 6mo, 1y, 2y, 5y"
}
```

**Data pipeline:** yfinance (^TASI, then TASI.SR fallback) -> 5-minute in-memory cache -> stale cache fallback -> deterministic mock data.

**Frontend consumer:** `useMarketIndex()` hook in `frontend/src/lib/hooks/use-chart-data.ts`.

**curl example:**

```bash
curl "http://localhost:8084/api/v1/charts/tasi/index?period=6mo"
```

---

### GET /api/v1/charts/tasi/health

**Auth required:** No | **Rate limited:** Yes | **DB backend:** Any

Return health/diagnostic status for the TASI data pipeline.

**Response (200):**

```json
{
  "status": "ok",
  "yfinance_available": true,
  "cache_status": "fresh",
  "cache_age_seconds": 42,
  "last_updated": "2026-02-10T12:00:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `"ok" \| "degraded"` | `degraded` when cache is not fresh AND yfinance is unavailable |
| `yfinance_available` | bool | Whether `yfinance` is importable |
| `cache_status` | `"fresh" \| "stale" \| "empty"` | Current cache state |
| `cache_age_seconds` | int or null | Seconds since last cache write |
| `last_updated` | string or null | ISO timestamp of cached data |

**curl example:**

```bash
curl "http://localhost:8084/api/v1/charts/tasi/health"
```

---

## Charts (PostgreSQL)

Prefix: `/api/charts` | Tag: `charts`

**DB backend:** PostgreSQL only. Pre-built data endpoints for frontend charting.

### GET /api/charts/sector-market-cap

**Auth required:** No | **Rate limited:** Yes

Total market cap by sector (for pie/bar chart).

**Response (200):**

```json
{
  "chart_type": "bar",
  "title": "Market Cap by Sector (SAR)",
  "data": [
    {"label": "Energy", "value": 7500000000000.0},
    {"label": "Financial Services", "value": 2100000000000.0}
  ]
}
```

**Frontend consumer:** `getChartSectorMarketCap()` in `api-client.ts`.

**curl example:**

```bash
curl "http://localhost:8084/api/charts/sector-market-cap"
```

---

### GET /api/charts/top-companies

**Auth required:** No | **Rate limited:** Yes

Top N companies by market cap.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int (1-50) | `10` | Number of companies |
| `sector` | string (optional) | - | Filter by sector (ILIKE match) |

**Response:** Same `ChartResponse` schema as above.

**curl example:**

```bash
curl "http://localhost:8084/api/charts/top-companies?limit=5&sector=Energy"
```

---

### GET /api/charts/sector-pe

**Auth required:** No | **Rate limited:** Yes

Average trailing P/E ratio by sector (excludes P/E > 200 and <= 0).

**Response:** Same `ChartResponse` schema.

---

### GET /api/charts/dividend-yield-top

**Auth required:** No | **Rate limited:** Yes

Top N companies by dividend yield (as percentage).

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int (1-50) | `15` | Number of companies |

**Response:** Same `ChartResponse` schema.

---

## Entities

Prefix: `/api/entities` | Tag: `entities` | **DB backend:** PostgreSQL only

### GET /api/entities

**Auth required:** No | **Rate limited:** Yes

List companies with basic market data.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int (1-500) | `50` | Max results |
| `offset` | int (>=0) | `0` | Offset for pagination |
| `sector` | string (optional) | - | Filter by sector (ILIKE match) |
| `search` | string (optional) | - | Search by ticker or company name (ILIKE) |

**Response (200):**

```json
{
  "items": [
    {
      "ticker": "2222.SR",
      "short_name": "Saudi Aramco",
      "sector": "Energy",
      "industry": "Oil & Gas Integrated",
      "current_price": 28.45,
      "market_cap": 7500000000000.0,
      "change_pct": 1.23
    }
  ],
  "count": 50
}
```

**Frontend consumer:** `useEntities()` hook, `getEntities()` in `api-client.ts`.

**curl example:**

```bash
curl "http://localhost:8084/api/entities?search=aramco&limit=10"
```

---

### GET /api/entities/sectors

**Auth required:** No | **Rate limited:** Yes

Return all sectors with company counts.

**Response (200):**

```json
[
  {"sector": "Financial Services", "company_count": 85},
  {"sector": "Energy", "company_count": 12}
]
```

**Frontend consumer:** `useSectors()` hook, `getSectors()` in `api-client.ts`.

---

### GET /api/entities/{ticker}

**Auth required:** No | **Rate limited:** Yes

Detailed company information with market data, valuation, and profitability.

**Path parameters:**

| Param | Type | Description |
|---|---|---|
| `ticker` | string | Stock ticker (e.g., `2222.SR`) |

**Response (200):**

```json
{
  "ticker": "2222.SR",
  "short_name": "Saudi Aramco",
  "sector": "Energy",
  "industry": "Oil & Gas Integrated",
  "exchange": "SAU",
  "currency": "SAR",
  "current_price": 28.45,
  "previous_close": 28.10,
  "day_high": 28.60,
  "day_low": 28.05,
  "week_52_high": 35.20,
  "week_52_low": 26.50,
  "volume": 15000000,
  "market_cap": 7500000000000.0,
  "beta": 0.85,
  "trailing_pe": 15.2,
  "forward_pe": 13.8,
  "price_to_book": 2.1,
  "trailing_eps": 1.87,
  "roe": 0.32,
  "profit_margin": 0.28,
  "revenue_growth": 0.05,
  "recommendation": "buy",
  "target_mean_price": 32.50,
  "analyst_count": 18
}
```

**Error (404):** `{"detail": "Company not found"}`

**Frontend consumer:** `useStockDetail()` hook, `getEntityDetail()` in `api-client.ts`. Used by `/stock/[ticker]` page.

---

## News

Prefix: `/api/news` | Tag: `news` | **DB backend:** PostgreSQL only

### GET /api/news

**Auth required:** No | **Rate limited:** Yes

Return the latest news articles across all tickers. Supports pagination.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int (>=1) | `1` | Page number |
| `page_size` | int (1-100) | `20` | Items per page |
| `language` | string (optional) | - | Filter by language code (e.g., `ar`, `en`) |

**Response (200):** `PaginatedResponse<NewsResponse>`

```json
{
  "items": [
    {
      "id": "uuid",
      "ticker": "2222.SR",
      "title": "Aramco Q4 results exceed expectations",
      "body": "...",
      "source_name": "Bloomberg",
      "source_url": "https://...",
      "published_at": "2026-02-10T08:00:00Z",
      "sentiment_score": 0.75,
      "sentiment_label": "positive",
      "language": "en",
      "created_at": "2026-02-10T08:01:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "total_pages": 8
}
```

**Frontend consumer:** `useNews()` hook -> `/news` page.

**curl example:**

```bash
curl "http://localhost:8084/api/news?page=1&page_size=10&language=en"
```

---

### GET /api/news/ticker/{ticker}

**Auth required:** No | **Rate limited:** Yes

News articles for a specific ticker.

**Additional query parameters:**

| Param | Type | Description |
|---|---|---|
| `sentiment` | string (optional) | Filter by sentiment label (e.g., `positive`, `negative`, `neutral`) |
| `since` | datetime (optional) | Only articles after this timestamp |

---

### GET /api/news/sector/{sector}

**Auth required:** No | **Rate limited:** Yes

News articles for all companies in a sector.

**Additional query parameters:**

| Param | Type | Description |
|---|---|---|
| `since` | datetime (optional) | Only articles after this timestamp |

---

### GET /api/news/{article_id}

**Auth required:** No | **Rate limited:** Yes

Return a single news article by ID.

**Error (404):** `{"detail": "Article not found"}`

---

### POST /api/news

**Auth required:** Yes (JWT) | **Rate limited:** Yes | **Status:** 201

Create a new news article.

**Request body:**

```json
{
  "title": "Aramco announces dividend increase",
  "content": "Saudi Aramco has announced...",
  "ticker": "2222.SR",
  "source": "Reuters",
  "source_url": "https://...",
  "language": "en",
  "sentiment_score": 0.65,
  "sentiment_label": "positive"
}
```

**Validation:**

| Field | Constraints |
|---|---|
| `title` | Required, 1-500 chars |
| `content` | Required, min 1 char |
| `ticker` | Optional, max 20 chars |
| `source` | Optional, max 200 chars |
| `source_url` | Optional, max 2000 chars |
| `language` | Default `"ar"`, max 5 chars |
| `sentiment_score` | Optional, -1.0 to 1.0 |
| `sentiment_label` | Optional, max 20 chars |

---

## Reports

Prefix: `/api/reports` | Tag: `reports` | **DB backend:** PostgreSQL only

### GET /api/reports

**Auth required:** No | **Rate limited:** Yes

Return the latest technical reports. Supports pagination.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int (>=1) | `1` | Page number |
| `page_size` | int (1-100) | `20` | Items per page |
| `recommendation` | string (optional) | - | Filter by recommendation (e.g., `buy`, `hold`, `sell`) |
| `report_type` | string (optional) | - | Filter by type (e.g., `technical`, `fundamental`, `sector`, `macro`) |
| `since` | datetime (optional) | - | Only reports after this timestamp |

**Response (200):** `PaginatedResponse<ReportResponse>`

```json
{
  "items": [
    {
      "id": "uuid",
      "ticker": "1180.SR",
      "title": "Al Rajhi Bank Technical Analysis",
      "summary": "...",
      "author": "Research Dept",
      "source_name": "NCB Capital",
      "source_url": "https://...",
      "published_at": "2026-02-09T10:00:00Z",
      "recommendation": "buy",
      "target_price": 95.50,
      "current_price_at_report": 88.20,
      "report_type": "technical",
      "created_at": "2026-02-09T10:01:00Z"
    }
  ],
  "total": 45,
  "page": 1,
  "page_size": 20,
  "total_pages": 3
}
```

**Frontend consumer:** `useReports()` hook -> `/reports` page.

---

### GET /api/reports/ticker/{ticker}

**Auth required:** No | **Rate limited:** Yes

Reports for a specific ticker.

---

### GET /api/reports/{report_id}

**Auth required:** No | **Rate limited:** Yes

Single report by ID.

**Error (404):** `{"detail": "Report not found"}`

---

### POST /api/reports

**Auth required:** Yes (JWT) | **Rate limited:** Yes | **Status:** 201

Create a new technical report.

---

## Announcements

Prefix: `/api/announcements` | Tag: `announcements` | **DB backend:** PostgreSQL only

### GET /api/announcements

**Auth required:** No | **Rate limited:** Yes

Return announcements with optional filters.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int (>=1) | `1` | Page number |
| `page_size` | int (1-100) | `20` | Items per page |
| `ticker` | string (optional) | - | Filter by ticker |
| `category` | string (optional) | - | Filter by category |
| `source` | string (optional) | - | Filter by source |
| `since` | datetime (optional) | - | Only announcements after this timestamp |

**Response (200):** `PaginatedResponse<AnnouncementResponse>`

```json
{
  "items": [
    {
      "id": "uuid",
      "ticker": "2222.SR",
      "title_ar": "...",
      "title_en": "Dividend Declaration",
      "body_ar": "...",
      "body_en": "...",
      "source": "Tadawul",
      "announcement_date": "2026-02-09",
      "category": "dividend",
      "classification": "financial",
      "is_material": true,
      "source_url": "https://...",
      "created_at": "2026-02-09T06:00:00Z"
    }
  ],
  "total": 200,
  "page": 1,
  "page_size": 20,
  "total_pages": 10
}
```

---

### GET /api/announcements/material

**Auth required:** No | **Rate limited:** Yes

Return only material announcements (CMA-classified).

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `ticker` | string (optional) | Filter by ticker |
| `since` | datetime (optional) | Only after this timestamp |

---

### GET /api/announcements/sector/{sector}

**Auth required:** No | **Rate limited:** Yes

Announcements for all companies in a sector.

---

### GET /api/announcements/{announcement_id}

**Auth required:** No | **Rate limited:** Yes

Single announcement by ID.

**Error (404):** `{"detail": "Announcement not found"}`

---

### POST /api/announcements

**Auth required:** Yes (JWT) | **Rate limited:** Yes | **Status:** 201

Create a new announcement.

---

## Watchlists & Alerts

Prefix: `/api/watchlists` | Tag: `watchlists` | **DB backend:** PostgreSQL only

### GET /api/watchlists

**Auth required:** No (uses `X-User-Id` header) | **Rate limited:** Yes

Return all watchlists for the specified user.

**Required headers:** `X-User-Id: <user_id>`

**Response (200):**

```json
[
  {
    "id": "uuid",
    "user_id": "user-123",
    "name": "My Watchlist",
    "tickers": ["2222.SR", "1180.SR", "2010.SR"]
  }
]
```

**Frontend consumer:** `getWatchlists()` in `api-client.ts` -> `/watchlist` page.

**curl example:**

```bash
curl -H "X-User-Id: user-123" "http://localhost:8084/api/watchlists"
```

---

### POST /api/watchlists

**Auth required:** Yes (JWT) | **Rate limited:** Yes | **Status:** 201

Create a new watchlist.

**Request body:**

```json
{
  "name": "Banking Sector",
  "tickers": ["1180.SR", "1010.SR"]
}
```

---

### POST /api/watchlists/{watchlist_id}/tickers

**Auth required:** Yes (JWT) | **Rate limited:** Yes

Add a single ticker to an existing watchlist.

**Request body:**

```json
{
  "ticker": "2222.SR"
}
```

---

### PATCH /api/watchlists/{watchlist_id}

**Auth required:** Yes (JWT) | **Rate limited:** Yes

Update a watchlist's name and/or tickers.

**Request body:**

```json
{
  "name": "Updated Name",
  "tickers": ["2222.SR", "1180.SR"]
}
```

---

### DELETE /api/watchlists/{watchlist_id}

**Auth required:** Yes (JWT) | **Rate limited:** Yes | **Status:** 204

Delete a watchlist. Returns empty body on success.

**Error (404):** `{"detail": "Watchlist not found"}`

---

### GET /api/watchlists/alerts

**Auth required:** No (uses `X-User-Id` header) | **Rate limited:** Yes

Return active alerts for the specified user.

**Required headers:** `X-User-Id: <user_id>`

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `ticker` | string (optional) | Filter by ticker |

**Response (200):**

```json
[
  {
    "id": "uuid",
    "user_id": "user-123",
    "ticker": "2222.SR",
    "alert_type": "price_above",
    "threshold_value": 30.0,
    "is_active": true
  }
]
```

---

### POST /api/watchlists/alerts

**Auth required:** Yes (JWT) | **Rate limited:** Yes | **Status:** 201

Create a new alert.

**Request body:**

```json
{
  "ticker": "2222.SR",
  "alert_type": "price_above",
  "threshold_value": 30.0
}
```

---

### DELETE /api/watchlists/alerts/{alert_id}

**Auth required:** Yes (JWT) | **Rate limited:** Yes | **Status:** 204

Deactivate an alert (soft-delete).

---

## Auth

Prefix: `/api/auth` | Tag: `auth` | **DB backend:** PostgreSQL only

### POST /api/auth/register

**Auth required:** No | **Rate limited:** Yes | **Status:** 201

Register a new user account with bcrypt-hashed password.

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "securepass123",
  "display_name": "Ahmed"
}
```

**Validation:**

| Field | Constraints |
|---|---|
| `email` | Required, valid email format |
| `password` | Required, 8-128 characters |
| `display_name` | Optional, max 100 characters |

**Response (201):**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Error (409):** `{"detail": "Email already registered"}`

**curl example:**

```bash
curl -X POST http://localhost:8084/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepass123","display_name":"Ahmed"}'
```

---

### POST /api/auth/login

**Auth required:** No | **Rate limited:** Yes

Authenticate and receive tokens. Only works for `auth_provider='local'` users.

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response (200):** Same `TokenResponse` as register.

**Error (401):** `{"detail": "Invalid email or password"}` or `{"detail": "Account is deactivated"}`

---

### POST /api/auth/refresh

**Auth required:** No | **Rate limited:** Yes

Exchange a valid refresh token for new access/refresh tokens.

**Request body:**

```json
{
  "refresh_token": "eyJ..."
}
```

**Response (200):** Same `TokenResponse`.

**Error (401):** `{"detail": "Refresh token has expired"}` / `{"detail": "Invalid refresh token"}` / `{"detail": "User not found"}` / `{"detail": "Account is deactivated"}`

---

### GET /api/auth/me

**Auth required:** Yes (JWT) | **Rate limited:** Yes

Return the authenticated user's profile.

**Response (200):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "display_name": "Ahmed",
  "subscription_tier": "free",
  "usage_count": 42,
  "is_active": true,
  "created_at": "2026-01-15T10:00:00Z"
}
```

**curl example:**

```bash
curl -H "Authorization: Bearer eyJ..." "http://localhost:8084/api/auth/me"
```

---

## Health

Tag: `health` | **DB backend:** PostgreSQL only

### GET /health

**Auth required:** No | **Rate limited:** No (skip path)

Structured health status for all platform components. Returns `503` when any component is `UNHEALTHY`.

**Response (200):**

```json
{
  "status": "healthy",
  "components": [
    {"name": "database", "status": "healthy", "latency_ms": 2.34, "message": ""},
    {"name": "llm", "status": "healthy", "latency_ms": null, "message": ""},
    {"name": "redis", "status": "degraded", "latency_ms": null, "message": "Not configured"}
  ]
}
```

**Frontend consumer:** `getHealth()` in `api-client.ts`.

---

## Static / UI

### GET /

**Auth required:** No | **Rate limited:** No

Serves the legacy `templates/index.html` frontend (Ra'd AI chat UI with gold/dark theme).

### GET /favicon.ico

**Auth required:** No | **Rate limited:** No

Serves `templates/favicon.svg` or empty response.

### GET /static/{path}

Static file serving from the `templates/` directory.

---

## Pagination

All paginated endpoints use a consistent pattern:

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | `1` | 1-indexed page number |
| `page_size` | int | `20` | Items per page (max 100) |

**Response wrapper:**

```json
{
  "items": [...],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "total_pages": 8
}
```

`total_pages` is computed server-side as `ceil(total / page_size)`.

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "detail": "Human-readable error message",
  "code": "OPTIONAL_ERROR_CODE"
}
```

**Standard HTTP status codes:**

| Code | Meaning |
|---|---|
| `400` | Bad request (invalid parameters) |
| `401` | Unauthorized (missing/invalid JWT) |
| `404` | Resource not found |
| `409` | Conflict (e.g., duplicate email) |
| `422` | Validation error (Pydantic) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `503` | Service unavailable (health check failure) |

Pydantic validation errors (422) include detailed field-level errors:

```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error"
    }
  ]
}
```
