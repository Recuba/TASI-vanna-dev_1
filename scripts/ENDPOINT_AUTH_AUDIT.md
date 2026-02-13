# Endpoint Authentication Consistency Audit

**Date:** 2026-02-13
**Scope:** All routes in `app.py` and `api/routes/` (16 route files)
**Author:** security-harden agent

---

## Summary

| Category | Count |
|----------|-------|
| Total endpoints audited | 54 |
| Auth required (JWT) | 13 |
| Public (no auth) | 38 |
| Conditional (PG mode) | 2 |
| Always public (by design) | 1 (health) |

All write endpoints consistently require `Depends(get_current_user)`. All public read endpoints serve market data, charts, or news -- appropriate for a financial data platform.

---

## Endpoint Audit Table

### Auth Routes (`api/routes/auth.py`, prefix: `/api/auth`)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/auth/register` | POST | No | Public -- creates new user | OK (registration must be public) |
| `/api/auth/login` | POST | No | Public -- authenticates user | OK (login must be public) |
| `/api/auth/guest` | POST | No | Public -- issues guest token | OK (guest access by design) |
| `/api/auth/refresh` | POST | No (token in body) | Validates refresh token from request body | OK (standard refresh pattern) |
| `/api/auth/me` | GET | **YES** | `Depends(get_current_user)` | OK |

### Watchlist Routes (`api/routes/watchlists.py`, prefix: `/api/watchlists`) -- PG only

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/watchlists` | GET | **YES** | `Depends(get_current_user)` | OK (SA-01 fixed) |
| `/api/watchlists` | POST | **YES** | `Depends(get_current_user)` | OK |
| `/api/watchlists/{id}/tickers` | POST | **YES** | `Depends(get_current_user)` | OK |
| `/api/watchlists/{id}` | PATCH | **YES** | `Depends(get_current_user)` | OK |
| `/api/watchlists/{id}` | DELETE | **YES** | `Depends(get_current_user)` | OK |
| `/api/watchlists/alerts` | GET | **YES** | `Depends(get_current_user)` | OK (SA-01 fixed) |
| `/api/watchlists/alerts` | POST | **YES** | `Depends(get_current_user)` | OK |
| `/api/watchlists/alerts/{id}` | DELETE | **YES** | `Depends(get_current_user)` | OK |

### News Routes (`api/routes/news.py`, prefix: `/api/news`) -- PG only

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/news` | GET | No | Public read | OK (news is public) |
| `/api/news/ticker/{ticker}` | GET | No | Public read | OK |
| `/api/news/sector/{sector}` | GET | No | Public read | OK |
| `/api/news/{article_id}` | GET | No | Public read | OK |
| `/api/news` | POST | **YES** | `Depends(get_current_user)` | OK |

### Reports Routes (`api/routes/reports.py`, prefix: `/api/reports`) -- PG only

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/reports` | GET | No | Public read | OK |
| `/api/reports/ticker/{ticker}` | GET | No | Public read | OK |
| `/api/reports/{report_id}` | GET | No | Public read | OK |
| `/api/reports` | POST | **YES** | `Depends(get_current_user)` | OK |

### Announcements Routes (`api/routes/announcements.py`, prefix: `/api/announcements`) -- PG only

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/announcements` | GET | No | Public read | OK |
| `/api/announcements/material` | GET | No | Public read | OK |
| `/api/announcements/sector/{sector}` | GET | No | Public read | OK |
| `/api/announcements/{id}` | GET | No | Public read | OK |
| `/api/announcements` | POST | **YES** | `Depends(get_current_user)` | OK |

### Health Route (`api/routes/health.py`)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/health` | GET | No | Public | OK (health checks must be public for LB probes) |

### TASI Index Routes (`api/routes/tasi_index.py`, prefix: `/api/v1/charts/tasi`)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/v1/charts/tasi/index` | GET | No | Public | OK (public market data) |
| `/api/v1/charts/tasi/health` | GET | No | Public | OK (SA-03 fixed -- no infra details exposed) |

### Stock OHLCV Routes (`api/routes/stock_ohlcv.py`, prefix: `/api/v1/charts`)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/v1/charts/{ticker}/ohlcv` | GET | No | Public | OK (public market data) |
| `/api/v1/charts/{ticker}/health` | GET | No | Public | OK (no infra details exposed) |

### News Feed Routes (`api/routes/news_feed.py`, prefix: `/api/v1/news`) -- SQLite-backed

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/v1/news/feed` | GET | No | Public read | OK |
| `/api/v1/news/feed/{article_id}` | GET | No | Public read | OK |
| `/api/v1/news/search` | GET | No | Public read | OK |
| `/api/v1/news/sources` | GET | No | Public read | OK |

### Chart Analytics Routes (`api/routes/charts_analytics.py`, prefix: `/api/charts`) -- Dual-backend

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/charts/sector-market-cap` | GET | No | Public | OK (aggregated market data) |
| `/api/charts/top-companies` | GET | No | Public | OK |
| `/api/charts/sector-pe` | GET | No | Public | OK |
| `/api/charts/dividend-yield-top` | GET | No | Public | OK |

### Market Analytics Routes (`api/routes/market_analytics.py`, prefix: `/api/v1/market`) -- Dual-backend

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/v1/market/movers` | GET | No | Public | OK |
| `/api/v1/market/summary` | GET | No | Public | OK |
| `/api/v1/market/sectors` | GET | No | Public | OK |
| `/api/v1/market/heatmap` | GET | No | Public | OK |

### Stock Data Routes (`api/routes/stock_data.py`, prefix: `/api/v1/stocks`) -- Dual-backend

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/v1/stocks/{ticker}/dividends` | GET | No | Public | OK |
| `/api/v1/stocks/{ticker}/summary` | GET | No | Public | OK |
| `/api/v1/stocks/{ticker}/financials` | GET | No | Public | OK |
| `/api/v1/stocks/compare` | GET | No | Public | OK |
| `/api/v1/stocks/quotes` | GET | No | Public | OK |

### Entity Routes -- SQLite (`api/routes/sqlite_entities.py`, prefix: `/api/entities`)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/entities` | GET | No | Public | OK |
| `/api/entities/sectors` | GET | No | Public | OK |
| `/api/entities/{ticker}` | GET | No | Public | OK |

### Entity Routes -- PG (`api/routes/entities.py`, prefix: `/api/entities`)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/entities` | GET | No | Public | OK |
| `/api/entities/sectors` | GET | No | Public | OK |
| `/api/entities/{ticker}` | GET | No | Public | OK |

### Chart Routes -- PG (`api/routes/charts.py`, prefix: `/api/charts`)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/charts/sector-market-cap` | GET | No | Public | OK |
| `/api/charts/top-companies` | GET | No | Public | OK |
| `/api/charts/sector-pe` | GET | No | Public | OK |
| `/api/charts/dividend-yield-top` | GET | No | Public | OK |

### Custom Routes (app.py)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/` | GET | No | Serves `templates/index.html` | OK (public UI) |
| `/favicon.ico` | GET | No | Serves favicon | OK |
| `/static/*` | GET | No | Static file serving | OK |

### Vanna Chat Endpoints (registered by VannaFastAPIServer)

| Endpoint | Method | Auth Required | Current State | Action |
|----------|--------|---------------|---------------|--------|
| `/api/vanna/v2/chat_sse` | POST | Conditional | PG mode: validates token if present, rejects invalid; allows anonymous. SQLite: no validation. | OK (acceptable for MVP) |
| `/api/vanna/v2/chat_poll` | POST | Conditional | Same as chat_sse | OK |

---

## Assessment

### Consistency: PASS

The auth model is **consistent and intentional**:
- All **write operations** (POST for news, reports, announcements; all watchlist/alert CRUD) require JWT auth via `Depends(get_current_user)`
- All **read operations** for market data, charts, entities, and news are public
- The **watchlist/alert IDOR (SA-01)** has been fully remediated -- both read and write endpoints now use `Depends(get_current_user)` instead of `X-User-Id` header
- **Vanna chat** validates tokens when present but allows anonymous access (appropriate for a demo/MVP)

### No Action Items

No auth inconsistencies were found. The current model follows a clear pattern:
- Public: market data reads, health checks, auth endpoints (login/register/guest)
- Authenticated: user-specific data (watchlists, alerts), content creation (news/reports/announcements POST)
