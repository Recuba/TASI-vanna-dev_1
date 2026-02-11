# Ra'd AI - TASI Saudi Stock Market Platform: Technical Summary

> **Generated**: 2026-02-11
> **Repository**: `vanna-ai-testing`
> **Version**: 2.0
> **Deployment**: Railway (backend) + Vercel (frontend)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Backend Architecture](#4-backend-architecture)
   - 4.1 [Application Assembly (app.py)](#41-application-assembly-apppy)
   - 4.2 [Middleware Stack](#42-middleware-stack)
   - 4.3 [API Routes & Endpoints](#43-api-routes--endpoints)
   - 4.4 [Services Layer](#44-services-layer)
   - 4.5 [Database Schema](#45-database-schema)
   - 4.6 [Authentication System](#46-authentication-system)
   - 4.7 [Configuration System](#47-configuration-system)
   - 4.8 [Chart Engine](#48-chart-engine)
   - 4.9 [News Pipeline](#49-news-pipeline)
5. [Frontend Architecture](#5-frontend-architecture)
   - 5.1 [App Router & Pages](#51-app-router--pages)
   - 5.2 [Component Tree](#52-component-tree)
   - 5.3 [Providers & Context](#53-providers--context)
   - 5.4 [API Client & Hooks](#54-api-client--hooks)
   - 5.5 [Design System & Theming](#55-design-system--theming)
   - 5.6 [Internationalization (i18n)](#56-internationalization-i18n)
6. [Frontend-Backend Wiring](#6-frontend-backend-wiring)
   - 6.1 [API Proxy via Next.js Rewrites](#61-api-proxy-via-nextjs-rewrites)
   - 6.2 [CORS Configuration](#62-cors-configuration)
   - 6.3 [SSE Chat Streaming](#63-sse-chat-streaming)
   - 6.4 [Authentication Flow](#64-authentication-flow)
7. [Complete API Reference](#7-complete-api-reference)
8. [Data Flow Diagrams](#8-data-flow-diagrams)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Dependencies](#10-dependencies)
11. [Environment Variables](#11-environment-variables)
12. [Summary Statistics](#12-summary-statistics)

---

## 1. Project Overview

**Ra'd AI** (رائد للذكاء الاصطناعي) is a full-stack TASI Saudi Stock Market AI Platform built on the **Vanna 2.0** framework. It provides:

- **Natural language to SQL** - Users ask questions in Arabic or English; the AI generates SQL against a normalized database of ~500 Saudi-listed companies and returns results with Plotly charts.
- **Real-time market data** - TASI index and per-stock OHLCV candlestick charts via yfinance.
- **News aggregation** - 5 Arabic financial news sources scraped every 30 minutes with Arabic paraphrasing.
- **Research reports & announcements** - CRUD for analyst reports and CMA/Tadawul announcements.
- **Watchlists & alerts** - Per-user stock tracking with price alerts.
- **Dual database support** - SQLite for development, PostgreSQL for production.

---

## 2. Technology Stack

### Backend
| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | FastAPI (via Vanna 2.0 server) | 0.115.6+ |
| Runtime | Python | 3.11 |
| AI Framework | Vanna | 2.0.2+ |
| LLM (Active) | Google Gemini 2.5 Flash | - |
| LLM (Config) | Anthropic Claude Sonnet 4.5 | claude-sonnet-4-5-20250929 |
| Database (Dev) | SQLite | 3.x |
| Database (Prod) | PostgreSQL | 16 Alpine |
| Auth | PyJWT + bcrypt | 2.8.1+ / 4.1.0+ |
| Cache | Redis | 7 Alpine (optional) |
| Charts | Plotly | 5.20.0+ |
| Market Data | yfinance | 0.2.35+ |
| Scraping | requests + BeautifulSoup4 + lxml | - |
| Scheduling | APScheduler | 3.10.4+ |
| Config | pydantic-settings | 2.0.0+ |
| Server | Uvicorn | 0.34.0+ |

### Frontend
| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 14.2.35 |
| Language | TypeScript | 5.x |
| UI Library | React | 18.x |
| Styling | Tailwind CSS | 3.4.1 |
| Data Fetching | SWR | 2.4.0 |
| Charts (TASI) | lightweight-charts | 4.2.3 |
| Charts (Analytics) | Plotly.js (react-plotly.js) | 3.3.1 / 2.6.0 |
| Charts (Stocks) | TradingView Widget | Embedded |
| Markdown | react-markdown | 10.1.0 |
| Testing | Vitest + Testing Library + MSW | 4.0.18 |

### Infrastructure
| Service | Platform | URL |
|---------|----------|-----|
| Backend | Railway | https://raid-ai-app-production.up.railway.app |
| Frontend | Vercel | https://frontend-two-nu-83.vercel.app |
| Database (Prod) | Railway PostgreSQL | postgres.railway.internal |
| Container | Docker Compose | PostgreSQL 16 + Redis 7 + pgAdmin |

---

## 3. Directory Structure

```
.
├── app.py                              # FastAPI server, Vanna agent assembly, all router registrations
├── csv_to_sqlite.py                    # CSV → 10 normalized SQLite tables
│
├── config/
│   ├── __init__.py                     # Singleton get_settings() + re-exports
│   ├── settings.py                     # 7 Pydantic Settings classes (DB, LLM, Auth, Server, etc.)
│   ├── logging.py                      # JSON (prod) / Pretty (dev) logging
│   └── prompts.py                      # System prompt for Vanna agent
│
├── api/routes/
│   ├── health.py                       # GET /health
│   ├── auth.py                         # POST /api/auth/{register,login,refresh}, GET /me
│   ├── news.py                         # /api/news/* (PostgreSQL)
│   ├── news_feed.py                    # /api/v1/news/* (SQLite, always available)
│   ├── reports.py                      # /api/reports/*
│   ├── announcements.py                # /api/announcements/*
│   ├── entities.py                     # /api/entities/*
│   ├── watchlists.py                   # /api/watchlists/* + /api/watchlists/alerts/*
│   ├── charts.py                       # /api/charts/* (sector analytics)
│   ├── tasi_index.py                   # /api/v1/charts/tasi/*
│   ├── stock_ohlcv.py                  # /api/v1/charts/{ticker}/ohlcv
│   ├── market_analytics.py             # /api/v1/market/{movers,summary,sectors,heatmap}
│   ├── stock_data.py                   # /api/v1/stocks/* (SQLite entities)
│   └── sqlite_entities.py              # SQLite-mode entity fallback
│
├── services/
│   ├── health_service.py               # DB + LLM + Redis health checks
│   ├── auth_service.py                 # Registration, login, JWT token creation
│   ├── user_service.py                 # Watchlists, alerts CRUD
│   ├── news_service.py                 # News articles (PostgreSQL)
│   ├── reports_service.py              # Technical reports (PostgreSQL)
│   ├── announcement_service.py         # Announcements (PostgreSQL)
│   ├── news_scraper.py                 # 5-source Arabic news scraper
│   ├── news_store.py                   # SQLite news storage (thread-safe)
│   ├── news_scheduler.py               # 30-min background scrape scheduler
│   ├── news_paraphraser.py             # Arabic synonym substitution
│   ├── tasi_index.py                   # ^TASI yfinance data + caching + circuit breaker
│   ├── stock_ohlcv.py                  # Per-stock OHLCV via yfinance
│   ├── stock_data.py                   # Stock metrics from SQLite
│   └── audit_service.py               # Query audit logging
│
├── auth/
│   ├── jwt_handler.py                  # JWT create/decode (HS256)
│   ├── password.py                     # bcrypt hashing
│   ├── models.py                       # Auth Pydantic models
│   └── dependencies.py                 # FastAPI get_current_user() dependency
│
├── middleware/
│   ├── error_handler.py                # Exception → safe JSON response
│   ├── cors.py                         # Dynamic CORS origin setup
│   ├── rate_limit.py                   # Sliding window per-IP rate limiter
│   └── request_logging.py              # Method, path, status, duration logging
│
├── chart_engine/
│   └── raid_chart_generator.py         # Custom Plotly chart generator (gold/dark theme)
│
├── database/
│   ├── schema.sql                      # Full PostgreSQL DDL (35 tables, 30+ indexes, 2 views)
│   ├── migrate_sqlite_to_pg.py         # SQLite → PostgreSQL migration
│   └── csv_to_postgres.py              # CSV → PostgreSQL direct pipeline
│
├── templates/
│   ├── index.html                      # Legacy frontend (vanna-chat web component)
│   └── favicon.svg                     # App icon
│
├── frontend/                           # Next.js 14 application
│   ├── src/app/                        # 11 pages (App Router)
│   ├── src/components/                 # 39 components (chat, charts, layout, common)
│   ├── src/providers/                  # Theme, Language, Auth providers
│   ├── src/lib/                        # API client, hooks, utilities
│   ├── src/styles/                     # Design system tokens + globals.css
│   ├── next.config.mjs                 # API proxy rewrites
│   ├── tailwind.config.ts              # Tailwind + design tokens
│   └── package.json                    # Dependencies
│
├── Dockerfile                          # Python 3.11 container
├── docker-compose.yml                  # PostgreSQL + Redis + pgAdmin
├── entrypoint.sh                       # Auto-init PG schema + load CSV
├── requirements.txt                    # 25 Python packages
├── .env.example                        # All env vars documented
├── saudi_stocks.db                     # SQLite database (generated)
└── saudi_stocks_yahoo_data.csv         # Source data (500 stocks, 1062 columns)
```

---

## 4. Backend Architecture

### 4.1 Application Assembly (app.py)

The server is assembled in `app.py` (~637 lines) following the **Vanna 2.0 Agent pattern**:

```
┌──────────────────────────────────────────────────┐
│                  Vanna 2.0 Agent                  │
│                                                    │
│  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ AnthropicLlmService│  │ SaudiStocksSystem    │  │
│  │ (Claude Sonnet 4.5)│  │ PromptBuilder        │  │
│  └──────────────────┘  └───────────────────────┘  │
│                                                    │
│  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ ToolRegistry      │  │ JWTUserResolver       │  │
│  │ - RunSqlTool      │  │ (anonymous in SQLite,  │  │
│  │ - VisualizeDataTool│  │  JWT in PostgreSQL)   │  │
│  └──────────────────┘  └───────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ DemoAgentMemory (max_items=10000)            │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  AgentConfig: stream_responses=True               │
│               max_tool_iterations=10              │
└──────────────────────────────────────────────────┘
```

**Startup Sequence:**
1. Load `.env` → `get_settings()` singleton
2. Initialize LLM (AnthropicLlmService)
3. Initialize SQL Runner (SQLite or PostgreSQL based on `DB_BACKEND`)
4. Register tools: `RunSqlTool` + `VisualizeDataTool` (with `RaidChartGenerator`)
5. Assemble Vanna Agent with all 5 components
6. Create FastAPI app via `VannaFastAPIServer.create_app()`
7. Remove Vanna's default `/` route (replace with custom template)
8. Configure middleware stack (4 layers)
9. Register all API routers (always-on + PostgreSQL-conditional)
10. Lifespan startup: connection pool, Redis, health check, news scheduler, yfinance probe

### 4.2 Middleware Stack

Applied outermost → innermost:

```
Request → ErrorHandlerMiddleware
           → RequestLoggingMiddleware
              → RateLimitMiddleware (60/min per IP, sliding window)
                 → CORSMiddleware (dynamic origins)
                    → [PostgreSQL Auth Middleware for /api/vanna/* only]
                       → Route Handler
```

| Middleware | File | Purpose |
|-----------|------|---------|
| `ErrorHandlerMiddleware` | `middleware/error_handler.py` | Catches all exceptions, returns safe JSON. Maps ValueError→400, PermissionError→403, KeyError→404, other→500. |
| `RequestLoggingMiddleware` | `middleware/request_logging.py` | Logs method, path, status, duration_ms, client_ip. Skips /health, /favicon.ico. |
| `RateLimitMiddleware` | `middleware/rate_limit.py` | Sliding window per IP. Default 60 req/min. Returns 429 with `Retry-After` header. |
| `CORSMiddleware` | `middleware/cors.py` | Dynamic origin resolution from `MW_CORS_ORIGINS` + `FRONTEND_URL` + `RAILWAY_PUBLIC_DOMAIN` env vars. |
| PostgreSQL Auth | `app.py` (inline) | Requires Bearer JWT for `/api/vanna/v2/chat_sse` and `/api/vanna/v2/chat_poll` when using PG backend. |

### 4.3 API Routes & Endpoints

#### Always Available (Any Backend)

**Health** (`/health`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Structured health check (DB, LLM, Redis components) |

**TASI Index** (`/api/v1/charts/tasi`) - yfinance-based, no DB dependency
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| GET | `/index` | `period` (1d..max, default 1y) | TASI index OHLCV candlestick data |
| GET | `/health` | - | TASI data source health (ok/degraded) |

**Stock OHLCV** (`/api/v1/charts`) - yfinance-based, no DB dependency
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| GET | `/{ticker}/ohlcv` | `period` (default 1y) | Per-stock OHLCV data (auto-adds .SR) |
| GET | `/{ticker}/health` | - | Stock data source health |

**News Feed** (`/api/v1/news`) - SQLite-backed scraper
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| GET | `/feed` | `limit`, `offset`, `source` | Paginated news articles |
| GET | `/feed/{id}` | - | Single article by ID |
| GET | `/search` | `q` (required), `limit`, `offset` | Full-text search |
| GET | `/sources` | - | Available news sources with counts |

**Market Analytics** (`/api/v1/market`) - SQLite-backed
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| GET | `/movers` | `type` (gainers/losers), `limit` | Top gainers or losers |
| GET | `/summary` | - | Market totals + top 5 movers |
| GET | `/sectors` | - | Sector-level analytics |
| GET | `/heatmap` | - | Market heatmap data |

**Stock Data** (`/api/v1/stocks`) - SQLite entities
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| GET | `/` | `limit`, `offset`, `sector`, `search` | Company list |
| GET | `/{ticker}` | - | Company detail |
| GET | `/{ticker}/summary` | - | Financial summary |
| GET | `/{ticker}/dividends` | - | Dividend data |
| GET | `/{ticker}/financials` | - | Financial statements |
| GET | `/compare` | `tickers` (comma-sep) | Compare multiple stocks |
| GET | `/quotes` | `tickers` (comma-sep) | Batch stock quotes |
| GET | `/sectors` | - | All sectors |

**Vanna AI Chat** (registered by VannaFastAPIServer)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/vanna/v2/chat_sse` | AI chat with SSE streaming |
| POST | `/api/vanna/v2/chat_poll` | AI chat with polling |

#### PostgreSQL-Only (503 stubs in SQLite mode)

**Auth** (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | No | Create account (email, password, name) |
| POST | `/login` | No | Get JWT tokens |
| POST | `/refresh` | No | Refresh access token |
| GET | `/me` | Yes | Current user profile |

**News** (`/api/news`) - PostgreSQL-backed
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Paginated articles |
| GET | `/ticker/{ticker}` | No | News by ticker |
| GET | `/sector/{sector}` | No | News by sector |
| GET | `/{article_id}` | No | Single article |
| POST | `/` | Yes | Create article |

**Reports** (`/api/reports`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Paginated reports |
| GET | `/ticker/{ticker}` | No | Reports by ticker |
| GET | `/{report_id}` | No | Single report |
| POST | `/` | Yes | Create report |

**Announcements** (`/api/announcements`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Paginated announcements |
| GET | `/material` | No | Material events only |
| GET | `/sector/{sector}` | No | By sector |
| GET | `/{id}` | No | Single announcement |
| POST | `/` | Yes | Create announcement |

**Entities** (`/api/entities`) - PostgreSQL-backed
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Company list with search |
| GET | `/sectors` | All sectors |
| GET | `/{ticker}` | Company detail |

**Watchlists** (`/api/watchlists`) - All require JWT
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | User's watchlists |
| POST | `/` | Create watchlist |
| POST | `/{id}/tickers` | Add tickers to watchlist |
| PATCH | `/{id}` | Update watchlist |
| DELETE | `/{id}` | Delete watchlist |
| GET | `/alerts` | User's alerts |
| POST | `/alerts` | Create alert |
| DELETE | `/alerts/{id}` | Delete alert |

**Charts** (`/api/charts`) - PostgreSQL analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/sector-market-cap` | Sector market cap distribution |
| GET | `/top-companies` | Top companies by market cap |
| GET | `/sector-pe` | Sector PE ratios |
| GET | `/dividend-yield-top` | Top dividend yielders |

### 4.4 Services Layer

```
┌─────────────────────────────────────────────────────────┐
│                     Services Layer                        │
├─────────────────────┬────────────────┬──────────────────┤
│  PostgreSQL-backed   │  SQLite-backed  │  External        │
├─────────────────────┼────────────────┼──────────────────┤
│ AuthService          │ NewsStore       │ tasi_index       │
│ UserService          │ StockData       │ stock_ohlcv      │
│ NewsService          │                │                  │
│ ReportsService       │                │                  │
│ AnnouncementService  │                │                  │
│ AuditService         │                │                  │
├─────────────────────┴────────────────┴──────────────────┤
│  Background / Pipeline                                    │
├──────────────────────────────────────────────────────────┤
│ NewsScraper (5 sources)  │  NewsParaphraser (synonyms)   │
│ NewsScheduler (30min)    │  HealthService (aggregated)   │
└──────────────────────────────────────────────────────────┘
```

**Resilience patterns across services:**
- **Circuit breaker** - yfinance services fall back to mock data when API is unreachable
- **In-memory caching** - 5-minute TTL for TASI index and per-stock OHLCV
- **Mock fallback** - Deterministic data generation when live sources unavailable
- **Connection pooling** - PostgreSQL pool (min 2, max 10)
- **Thread safety** - SQLite NewsStore uses threading locks
- **Graceful degradation** - PG-only services return 503 stubs in SQLite mode

### 4.5 Database Schema

#### SQLite (Development) - 10 Tables

Created by `csv_to_sqlite.py` from `saudi_stocks_yahoo_data.csv` (500 stocks, 1062 columns):

**7 Simple Tables** (1 row per ticker):
| Table | Primary Key | Key Columns |
|-------|-------------|-------------|
| `companies` | ticker | short_name, sector, industry, exchange, market |
| `market_data` | ticker | current_price, volume, market_cap, beta, 52w range |
| `valuation_metrics` | ticker | trailing_pe, forward_pe, price_to_book, ev_to_ebitda |
| `profitability_metrics` | ticker | roe, roa, profit_margin, operating_margin, growth |
| `dividend_data` | ticker | dividend_rate, dividend_yield, payout_ratio |
| `financial_summary` | ticker | total_revenue, total_debt, free_cashflow, ebitda |
| `analyst_data` | ticker | target_price, recommendation, analyst_count |

**3 Financial Statement Tables** (multiple rows per ticker, unpivoted):
| Table | Key Columns | Periods |
|-------|-------------|---------|
| `balance_sheet` | ticker, period_type, period_index, period_date | annual/quarterly/ttm |
| `income_statement` | ticker, period_type, period_index, period_date | annual/quarterly/ttm |
| `cash_flow` | ticker, period_type, period_index, period_date | annual/quarterly/ttm |

`period_index`: 0 = most recent, 1 = previous, etc.

#### PostgreSQL (Production) - 35 Tables

Full schema in `database/schema.sql` (796 lines). Includes all 10 SQLite tables plus:

**Reference**: `sectors`, `entities` (enhanced company info with Arabic names)
**Financial**: `filings`, `xbrl_facts`, `computed_metrics`, `price_history`
**Content**: `announcements`, `news_articles`, `technical_reports`
**User/Auth**: `users`, `user_watchlists`, `user_alerts`, `query_audit_log`
**Indexes**: 30+ indexes including GIN trigram for Arabic text search
**Views**: `v_latest_annual_metrics`, `v_company_summary`

### 4.6 Authentication System

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│  Client   │───>│ /auth/   │───>│ AuthSvc  │
│           │    │ register │    │ bcrypt   │
│           │    │ login    │    │ hash/    │
│           │    │ refresh  │    │ verify   │
└──────────┘    └────┬─────┘    └────┬─────┘
                     │               │
                     v               v
              ┌──────────┐    ┌──────────┐
              │ JWT      │    │ users    │
              │ Handler  │    │ table    │
              │ (HS256)  │    │ (PG)    │
              └──────────┘    └──────────┘
```

| Component | File | Purpose |
|-----------|------|---------|
| `jwt_handler.py` | `auth/` | Create/decode HS256 tokens (access: 30min, refresh: 7d) |
| `password.py` | `auth/` | bcrypt password hashing |
| `models.py` | `auth/` | Pydantic models (UserCreate, UserLogin, AuthResponse, etc.) |
| `dependencies.py` | `auth/` | FastAPI `get_current_user()` dependency (Bearer token extraction) |
| `auth_service.py` | `services/` | Registration, login, token creation business logic |

**Behavior by backend:**
- **SQLite mode**: Authentication optional, anonymous users allowed
- **PostgreSQL mode**: JWT required for protected endpoints (watchlists, alerts, Vanna chat)

### 4.7 Configuration System

`config/settings.py` uses **pydantic-settings** with nested classes:

```python
Settings                          # Top-level (.env file loader)
├── DatabaseSettings              # DB_* prefix (backend, SQLite path, PG connection)
├── LLMSettings                   # LLM_* prefix (model, api_key, max_tool_iterations)
├── ServerSettings                # SERVER_* prefix (host, port, debug, environment)
├── PoolSettings                  # PG_POOL_* prefix (min, max connections)
├── CacheSettings                 # CACHE_* prefix (redis_url, enabled, ttl)
├── AuthSettings                  # AUTH_* prefix (jwt_secret, algorithm, token expiry)
└── MiddlewareSettings            # MW_* prefix (cors_origins, rate_limit, log_skip_paths)
```

Accessed via `get_settings()` singleton (LRU-cached).

**Docker compatibility**: PostgreSQL settings accept both `DB_PG_*` and `POSTGRES_*` env var names via `validation_alias`.

### 4.8 Chart Engine

**File**: `chart_engine/raid_chart_generator.py`

Subclasses Vanna's `PlotlyChartGenerator` with Ra'd AI branding:

- **Gold colorscale**: `[#1a1a1a, #3d2e10, #B8860B, #D4A84B, #E8C872]`
- **RAID colorway**: 7-color palette (golds, greens, blues, reds)
- **Column labels**: ~30 human-friendly metric names with units (SAR, %, etc.)
- **Fixes applied**: Table column limit raised from 4→8+, missing-value heatmap detection, grouped bar values (not counts), string-date detection, dark background

### 4.9 News Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌───────────┐
│ NewsScheduler│────>│ NewsScraper   │────>│ Paraphraser  │────>│ NewsStore │
│ (30min loop) │     │ (5 sources)   │     │ (synonyms)   │     │ (SQLite)  │
└─────────────┘     └──────────────┘     └──────────────┘     └───────────┘
                           │
                    ┌──────┼──────┐──────┐──────┐
                    v      v      v      v      v
               العربية  الشرق  أرقام  معال  مباشر
```

- **Scraper**: `requests` + `BeautifulSoup4` + `lxml`, 10s timeout, 1.5s delay between sources
- **Paraphraser**: ~30 Arabic financial synonym pairs for content variation
- **Store**: SQLite `news_feed` table, `UNIQUE(title, source_name)` deduplication
- **Scheduler**: Daemon thread, fetch on startup + every 30 minutes
- **API**: `/api/v1/news/feed` with pagination, source filtering, and full-text search

---

## 5. Frontend Architecture

### 5.1 App Router & Pages

Next.js 14 App Router with 11 pages:

| Path | File | Purpose | Key Features |
|------|------|---------|--------------|
| `/` | `app/page.tsx` | Dashboard/Home | Bilingual hero, platform stats, quick actions, sector list, top movers |
| `/chat` | `app/chat/page.tsx` | AI Chat | SSE streaming, message history, suggestions, follow-ups |
| `/charts` | `app/charts/page.tsx` | Stock Charts | Stock search, TASI candlestick, OHLCV, comparison, analytics |
| `/market` | `app/market/page.tsx` | Market Overview | TASI index, sector filter, company table with sort/pagination |
| `/news` | `app/news/page.tsx` | News Feed | Source filter chips, search, bookmarks, infinite scroll, sentiment |
| `/news/[id]` | `app/news/[id]/page.tsx` | Article Detail | Reading progress, badges, sharing, related articles |
| `/stock/[ticker]` | `app/stock/[ticker]/page.tsx` | Stock Detail | Watchlist, candlestick chart, metrics cards, financials |
| `/reports` | `app/reports/page.tsx` | Research Reports | Type filters, pagination, search |
| `/watchlist` | `app/watchlist/page.tsx` | Watchlists | API + localStorage fallback, CRUD, stock quotes |
| `/announcements` | `app/announcements/page.tsx` | Announcements | Material/general filter, expandable content |
| `not-found.tsx` | `app/not-found.tsx` | 404 Page | Custom error page |

**Root Layout** (`app/layout.tsx`):
```
<html lang="ar" dir="rtl">
  <ThemeProvider>
    <LanguageProvider>
      <AuthProvider>
        <ErrorBoundary>
          <AppShell>
            <Header />
            <Sidebar />
            <main>{children}</main>
            <Footer />
          </AppShell>
          <GlobalKeyboardShortcuts />
          <ScrollToTop />
        </ErrorBoundary>
      </AuthProvider>
    </LanguageProvider>
  </ThemeProvider>
</html>
```

### 5.2 Component Tree

**39 total components** organized by domain:

#### Chat Components (`src/components/chat/`) - 7 components
| Component | Purpose |
|-----------|---------|
| `AIChatInterface.tsx` | Main chat container, SSE connection, message list, input |
| `MessageBubble.tsx` | Individual message rendering (user/assistant) |
| `AssistantContent.tsx` | Rich assistant content renderer (text, charts, tables, SQL) |
| `ChartBlock.tsx` | Plotly chart embedding within chat |
| `DataTable.tsx` | Tabular data rendering |
| `SQLBlock.tsx` | SQL code display with syntax highlighting |
| `LoadingDots.tsx` | Animated typing indicator |

#### Chart Components (`src/components/charts/`) - 21 components
| Component | Purpose |
|-----------|---------|
| `TASIIndexChart.tsx` | TASI index candlestick + volume (lightweight-charts) |
| `StockOHLCVChart.tsx` | Per-stock candlestick with Plotly |
| `StockComparisonChart.tsx` | Multi-stock normalized line comparison |
| `PreBuiltCharts.tsx` | Market analytics pre-built charts |
| `AreaChart.tsx` | Generic area/line chart |
| `LineChart.tsx` | Simple line chart |
| `CandlestickChart.tsx` | Generic candlestick OHLC |
| `MiniSparkline.tsx` | Inline sparkline for tables |
| `TradingViewWidget.tsx` | Embedded TradingView (individual stocks) |
| `TradingViewAttribution.tsx` | TradingView attribution text |
| `ChartWrapper.tsx` | Container with title, source badge |
| `ChartErrorBoundary.tsx` | Error boundary for chart failures |
| `ChartSkeleton.tsx` | Loading skeleton placeholder |
| `ChartEmpty.tsx` | Empty state display |
| `ChartError.tsx` | Error state with retry |
| `DataSourceBadge.tsx` | Data source indicator pill |
| `chart-config.ts` | Chart configuration constants |
| `chart-types.ts` | TypeScript interfaces for chart data |
| `useChart.ts` | Chart utility hook |
| + 2 test files | Unit tests |

> **Note**: TADAWUL:TASI is NOT available in TradingView embedded widgets. The TASI index uses `lightweight-charts` v4.2.3 instead. Individual stocks work fine with TradingView (e.g., `TADAWUL:2222` for Aramco).

#### Layout Components (`src/components/layout/`) - 4 components
| Component | Purpose |
|-----------|---------|
| `AppShell.tsx` | Main layout wrapper (Header + Sidebar + content + Footer) |
| `Header.tsx` | Top bar: brand, desktop nav (md only), language toggle, theme toggle, search hint, status indicator |
| `Sidebar.tsx` | Side nav: 7 links (Home, Market, Charts, News, AI Chat, Reports, Watchlist), collapsible, mobile drawer |
| `Footer.tsx` | Footer with links and Ra'd AI attribution |

**Navigation deduplication**: Header nav shows only on medium screens (`md:flex lg:hidden`), Sidebar shows on large screens (`hidden lg:flex`). Mobile uses hamburger → slide-out sidebar from the end.

#### Common Components (`src/components/common/`) - 9 components
| Component | Purpose |
|-----------|---------|
| `CommandPalette.tsx` | Ctrl+K modal for quick page navigation |
| `GlobalKeyboardShortcuts.tsx` | Global keyboard event handling |
| `MobileBottomNav.tsx` | Mobile-only bottom navigation bar |
| `ScrollToTop.tsx` | Auto-scroll to top on route change |
| `Toast.tsx` | Toast notification system |
| `LoadingSpinner.tsx` | Centered spinner with optional message |
| `ErrorDisplay.tsx` | Error state with retry button |
| `error-boundary.tsx` | React error boundary wrapper |
| `error-display.tsx` | Error display component |

### 5.3 Providers & Context

Three React context providers wrap the entire app:

#### ThemeProvider (`src/providers/ThemeProvider.tsx`)
```typescript
interface ThemeContextValue {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}
```
- **Storage**: `localStorage['rad-ai-theme']`
- **Mechanism**: Toggles `.dark` class on `<html>`, CSS custom properties switch values
- **Default**: Dark mode

#### LanguageProvider (`src/providers/LanguageProvider.tsx`)
```typescript
interface LanguageContextValue {
  language: 'ar' | 'en';
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
  t: (ar: string, en: string) => string;  // Translation helper
  isRTL: boolean;
}
```
- **Storage**: `localStorage['rad-ai-lang']`
- **Mechanism**: Sets `lang` attribute and `dir` (rtl/ltr) on `<html>`, switches font family
- **Default**: English (`en`)

#### AuthProvider (`src/lib/hooks/use-auth.tsx`)
```typescript
interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}
```
- **Storage**: `localStorage['rad-ai-token']`, `localStorage['rad-ai-refresh-token']`, `localStorage['rad-ai-user']`
- **Mechanism**: JWT in Authorization header, client-side payload decode for UI

### 5.4 API Client & Hooks

#### API Client (`src/lib/api-client.ts`)

**Base URL**: `''` (empty string - all requests go through Next.js rewrites as same-origin)

```typescript
const API_BASE = '';  // Requests proxied via next.config.mjs rewrites

function request<T>(path: string, init?: RequestInit): Promise<T>
// Adds auth headers, handles errors, returns typed JSON
```

**Core types defined** (20+ interfaces):
- `NewsArticle`, `NewsFeedItem`, `NewsFeedResponse`
- `ReportItem`, `ReportListResponse`
- `AnnouncementItem`, `AnnouncementListResponse`
- `CompanySummary`, `CompanyDetail`, `EntityListResponse`
- `SectorInfo`, `WatchlistItem`
- `OHLCVData`, `StockOHLCVResponse`, `TasiIndexResponse`
- `MarketMover`, `MarketSummary`
- `HealthResponse`, `HealthComponentResponse`
- `ChartDataPoint`, `ChartResponse`
- `ApiError` class

#### Data Fetching Hooks (`src/lib/hooks/use-api.ts`)

20+ hooks built on a generic `useAsync<T>()` pattern:

| Hook | Endpoint | Auto-Refresh |
|------|----------|-------------|
| `useNews(params)` | `/api/v1/news/feed` | - |
| `useNewsFeed(params)` | `/api/v1/news/feed` | 5 minutes |
| `useNewsArticle(id)` | `/api/v1/news/feed/{id}` | - |
| `useNewsSearch(params)` | `/api/v1/news/search` | - |
| `useNewsSources()` | `/api/v1/news/sources` | - |
| `useReports(params)` | `/api/reports` | - |
| `useEntities(params)` | `/api/entities` | - |
| `useEntityDetail(ticker)` | `/api/entities/{ticker}` | - |
| `useSectors()` | `/api/entities/sectors` | - |
| `useAnnouncements(params)` | `/api/announcements` | - |
| `useMarketMovers(type, limit)` | `/api/v1/market/movers` | 30 seconds |
| `useMarketIndex()` | `/api/v1/charts/tasi/index` | 30 seconds |
| `useMarketSummary()` | `/api/v1/market/summary` | 30 seconds |
| `useSectorPerformance()` | `/api/v1/market/sectors` | - |
| `useStockOHLCV(ticker)` | `/api/v1/charts/{ticker}/ohlcv` | - |
| `useTasiIndex()` | `/api/v1/charts/tasi/index` | - |
| `useStockDividends(ticker)` | `/api/v1/stocks/{ticker}/dividends` | - |
| `useStockFinancials(ticker)` | `/api/v1/stocks/{ticker}/financials` | - |
| `useStockDetail(ticker)` | `/api/v1/stocks/{ticker}` | - |
| `useMiniChartData(ticker)` | Sparkline data | - |
| `useChartData()` | All chart aggregator | - |

#### SSE Chat Hook (`src/lib/use-sse-chat.ts`)
```typescript
function useSSEChat(): {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  stopStreaming: () => void;
  retryLast: () => void;
}
```
- **Endpoint**: POST `/api/vanna/v2/chat_sse`
- **Persistence**: `localStorage['raid-chat-messages']` (max 100 messages)
- **Streaming**: Reads SSE EventSource, parses chunks, handles buffer/malformed JSON
- **Abort**: Uses `AbortController` for cancellation

### 5.5 Design System & Theming

#### Design Tokens (`src/styles/design-system.ts`)

**Color Palette:**
```
Gold:     #D4A84B (primary), #E8C872 (light), #B8860B (dark)
Dark BG:  #0E0E0E (background), #1A1A1A (card), #2A2A2A (input)
Text:     #FFFFFF (primary), #B0B0B0 (secondary), #707070 (muted)
Accents:  #4CAF50 (green), #FF6B6B (red), #4A9FFF (blue), #FFA726 (warning)
```

**Typography:**
- Arabic: `IBM Plex Sans Arabic`, `Tajawal`, sans-serif
- English: `Inter`, sans-serif
- Monospace: `IBM Plex Mono`, `Fira Code`, `Consolas`

**Layout:**
- Header height: 64px (desktop), 56px (mobile)
- Sidebar: 260px expanded, 64px collapsed
- Max content width: 960px (content), 1040px (content-lg)

**Animations:**
- `gold-pulse` - 2s ease-in-out infinite (status indicator)
- `fade-in-up` - 0.6s with staggered delays (page transitions)
- `shimmer` - 2s infinite (skeleton loading)

#### CSS Architecture (`src/app/globals.css`)

```css
/* CSS custom properties for theme switching */
:root {
  --bg-primary: #FFFFFF;     /* Light mode */
  --text-primary: #1A1A1A;
}
.dark {
  --bg-primary: #0E0E0E;    /* Dark mode */
  --text-primary: #FFFFFF;
}
```

Includes:
- Tailwind directives (`@tailwind base, components, utilities`)
- Gold-themed scrollbar styling
- RTL support utilities (`.flip-rtl`)
- Print styles (hide nav, readable colors)
- Utility classes: `.gold-text`, `.gold-border`, `.gold-glow`

### 5.6 Internationalization (i18n)

**Approach**: Inline bilingual strings using the `t(arabic, english)` helper from `LanguageProvider`:

```tsx
const { t, language, isRTL } = useLanguage();

// Simple text
<h1>{t('مرحبا', 'Welcome')}</h1>

// Conditional rendering
<span>{language === 'ar' ? item.labelAr : item.labelEn}</span>
```

**RTL handling:**
- `<html>` root element gets `dir="rtl"` or `dir="ltr"` automatically
- Tailwind logical properties used throughout: `start-0` / `end-0`, `ms-*` / `me-*`, `border-s` / `border-e`
- Font family switches between Arabic and English faces

**localStorage keys for client-side persistence:**
| Key | Purpose |
|-----|---------|
| `rad-ai-theme` | Dark/light mode |
| `rad-ai-lang` | Arabic/English |
| `rad-ai-token` | JWT access token |
| `rad-ai-refresh-token` | JWT refresh token |
| `rad-ai-user` | Serialized user object |
| `raid-chat-messages` | Chat history (max 100) |
| `raid-watchlist-tickers` | Watchlist from stock detail |
| `raid-charts-recent` | Recent chart searches (max 5) |
| `rad-ai-bookmarks` | Bookmarked news articles |

---

## 6. Frontend-Backend Wiring

### 6.1 API Proxy via Next.js Rewrites

The frontend **never makes direct cross-origin requests** to the backend. All API calls go through Next.js server-side rewrites:

```
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│   Browser         │  same    │   Vercel          │  proxy   │   Railway         │
│   (React App)     │──origin──│   Next.js Server  │─────────>│   FastAPI Backend  │
│                    │          │                    │          │   (port 8084)      │
│  fetch('/api/..') │          │  rewrite to        │          │                    │
│                    │          │  BACKEND_URL/api/* │          │                    │
└──────────────────┘          └──────────────────┘          └──────────────────┘
```

**Configuration** (`frontend/next.config.mjs`):
```javascript
const backendUrl = process.env.BACKEND_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://localhost:8084';

const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*',  destination: `${backendUrl}/api/:path*` },
      { source: '/health',      destination: `${backendUrl}/health` },
    ];
  },
};
```

**Key design decisions:**
- `API_BASE = ''` in `api-client.ts` — all frontend requests are same-origin relative paths
- `BACKEND_URL` env var on Vercel points to Railway's public URL (server-side only, never exposed to browser)
- This eliminates CORS issues for the frontend since the browser sees only same-origin requests

### 6.2 CORS Configuration

Even though the proxy pattern avoids most CORS issues, the backend still configures CORS for:
- Direct API access (e.g., testing, mobile apps, legacy frontend)
- The `templates/index.html` legacy UI served from Railway

**Static origins** (`config/settings.py`):
```python
cors_origins = "http://localhost:3000,http://localhost:8084,https://frontend-two-nu-83.vercel.app,https://raid-ai-app-production.up.railway.app"
```

**Dynamic origins** (`app.py`):
```python
# Read from environment variables at startup
frontend_url = os.environ.get("FRONTEND_URL")       # e.g., https://frontend-two-nu-83.vercel.app
railway_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN")  # e.g., raid-ai-app-production.up.railway.app

# Append if not already in the list
if frontend_url and frontend_url not in cors_origins:
    cors_origins.append(frontend_url)
if railway_domain:
    railway_url = f"https://{railway_domain}"
    if railway_url not in cors_origins:
        cors_origins.append(railway_url)
```

**Middleware setup** (`middleware/cors.py`):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With", "X-User-Id"],
)
```

### 6.3 SSE Chat Streaming

The AI chat uses **Server-Sent Events (SSE)** for real-time streaming:

```
Browser                          Vercel Proxy                     Railway Backend
  │                                  │                                  │
  │ POST /api/vanna/v2/chat_sse      │                                  │
  │ {message: "..."}                 │                                  │
  │─────────────────────────────────>│  POST BACKEND_URL/api/vanna/...  │
  │                                  │─────────────────────────────────>│
  │                                  │                                  │
  │                                  │  SSE stream (text/event-stream)  │
  │                                  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
  │  SSE events:                     │                                  │
  │  data: {"type":"progress",...}   │                                  │
  │  data: {"type":"text",...}       │                                  │
  │  data: {"type":"code",...}       │                                  │
  │  data: {"type":"table",...}      │                                  │
  │  data: {"type":"chart",...}      │                                  │
  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │                                  │
  │                                  │                                  │
```

**SSE Event Types:**
| Type | Payload | UI Rendering |
|------|---------|-------------|
| `progress` | Status text | Loading indicator text |
| `text` | Markdown content | `react-markdown` rendering |
| `code` | SQL query | `SQLBlock` with syntax highlighting |
| `table` | Row data | `DataTable` component |
| `chart` | Plotly JSON | `ChartBlock` via `react-plotly.js` |

### 6.4 Authentication Flow

```
┌────────┐  POST /api/auth/login  ┌──────────┐  bcrypt verify  ┌──────────┐
│ Browser │──────────────────────>│ Auth API  │───────────────>│ users DB │
│         │                       │          │                 │ (PG)     │
│         │  {token, refresh}     │          │  JWT create     │          │
│         │<──────────────────────│          │<───────────────│          │
└────────┘                       └──────────┘                 └──────────┘
     │
     │ Store in localStorage:
     │ - rad-ai-token (access, 30min)
     │ - rad-ai-refresh-token (refresh, 7d)
     │ - rad-ai-user (decoded payload)
     │
     │ Subsequent requests:
     │ Authorization: Bearer <access_token>
     │────────────────────────────────────────────────>
```

**Note**: In SQLite mode (local development), authentication is optional. The `JWTUserResolver` allows anonymous access. In PostgreSQL mode (production), JWT is required for protected endpoints.

---

## 7. Complete API Reference

### Endpoint Map

```
/
├── /health                              GET   Health check (always)
│
├── /api/auth/                           Auth (PG only)
│   ├── register                         POST  Create account
│   ├── login                            POST  Get JWT tokens
│   ├── refresh                          POST  Refresh token
│   └── me                               GET   Current user profile [JWT]
│
├── /api/v1/news/                        News Feed (SQLite, always)
│   ├── feed                             GET   Paginated articles
│   ├── feed/{id}                        GET   Single article
│   ├── search?q=                        GET   Full-text search
│   └── sources                          GET   Available sources
│
├── /api/v1/market/                      Market Analytics (SQLite, always)
│   ├── movers?type=gainers              GET   Top gainers/losers
│   ├── summary                          GET   Market totals
│   ├── sectors                          GET   Sector analytics
│   └── heatmap                          GET   Market heatmap
│
├── /api/v1/charts/                      Chart Data (yfinance, always)
│   ├── tasi/index?period=1y             GET   TASI index OHLCV
│   ├── tasi/health                      GET   TASI source health
│   ├── {ticker}/ohlcv?period=1y         GET   Stock OHLCV
│   └── {ticker}/health                  GET   Stock source health
│
├── /api/v1/stocks/                      Stock Data (SQLite, always)
│   ├── /                                GET   Company list
│   ├── /{ticker}                        GET   Company detail
│   ├── /{ticker}/summary                GET   Financial summary
│   ├── /{ticker}/dividends              GET   Dividend data
│   ├── /{ticker}/financials             GET   Financial statements
│   ├── /compare?tickers=                GET   Compare stocks
│   ├── /quotes?tickers=                 GET   Batch quotes
│   └── /sectors                         GET   All sectors
│
├── /api/news/                           News (PG only)
│   ├── /                                GET   Paginated articles
│   ├── /                                POST  Create article [JWT]
│   ├── /ticker/{ticker}                 GET   By ticker
│   ├── /sector/{sector}                 GET   By sector
│   └── /{id}                            GET   Single article
│
├── /api/reports/                        Reports (PG only)
│   ├── /                                GET   Paginated reports
│   ├── /                                POST  Create report [JWT]
│   ├── /ticker/{ticker}                 GET   By ticker
│   └── /{id}                            GET   Single report
│
├── /api/announcements/                  Announcements (PG only)
│   ├── /                                GET   Paginated
│   ├── /                                POST  Create [JWT]
│   ├── /material                        GET   Material events
│   ├── /sector/{sector}                 GET   By sector
│   └── /{id}                            GET   Single
│
├── /api/entities/                       Entities (PG only)
│   ├── /                                GET   Company list
│   ├── /sectors                         GET   All sectors
│   └── /{ticker}                        GET   Company detail
│
├── /api/watchlists/                     Watchlists (PG only, all JWT)
│   ├── /                                GET   User's watchlists
│   ├── /                                POST  Create watchlist
│   ├── /{id}/tickers                    POST  Add tickers
│   ├── /{id}                            PATCH Update
│   ├── /{id}                            DELETE Remove
│   ├── /alerts                          GET   User's alerts
│   ├── /alerts                          POST  Create alert
│   └── /alerts/{id}                     DELETE Remove alert
│
├── /api/charts/                         PG Analytics Charts (PG only)
│   ├── /sector-market-cap               GET   Sector distribution
│   ├── /top-companies                   GET   Top by market cap
│   ├── /sector-pe                       GET   Sector PE ratios
│   └── /dividend-yield-top              GET   Top dividend yielders
│
└── /api/vanna/v2/                       Vanna AI (always)
    ├── chat_sse                         POST  AI chat (SSE streaming)
    └── chat_poll                        POST  AI chat (polling)
```

---

## 8. Data Flow Diagrams

### User Query Flow (AI Chat)
```
User Input (Arabic/English)
  │
  v
Frontend (useSSEChat hook)
  │ POST /api/vanna/v2/chat_sse
  v
Next.js Rewrite (same-origin proxy)
  │
  v
FastAPI Middleware Chain
  │ Error → Logging → Rate Limit → CORS → [Auth]
  v
Vanna 2.0 Agent
  │
  ├──> LLM Service (Claude Sonnet 4.5 / Gemini)
  │      │ Generates SQL from natural language
  │      v
  ├──> RunSqlTool
  │      │ Executes SQL against SQLite/PostgreSQL
  │      v
  ├──> VisualizeDataTool (RaidChartGenerator)
  │      │ Creates Plotly chart from query results
  │      v
  └──> SSE Stream → Client
         │ Events: progress, text, code, table, chart
         v
       Frontend Rendering
         ├── react-markdown (text)
         ├── react-syntax-highlighter (SQL)
         ├── DataTable (results)
         └── react-plotly.js (chart)
```

### Market Data Flow
```
yfinance API (Yahoo Finance)
  │
  ├──> TASI Index Service
  │      │ 5-min cache, circuit breaker, mock fallback
  │      v
  │    /api/v1/charts/tasi/index
  │      │
  │      v
  │    TASIIndexChart (lightweight-charts candlestick)
  │
  └──> Stock OHLCV Service
         │ 5-min cache, circuit breaker, mock fallback
         v
       /api/v1/charts/{ticker}/ohlcv
         │
         v
       StockOHLCVChart (Plotly candlestick)
       TradingViewWidget (embedded, individual stocks)
```

### News Pipeline Flow
```
5 Arabic Sources (scrape every 30 min)
  │
  v
NewsScraper (requests + BeautifulSoup4)
  │ 10s timeout, 1.5s delay between sources
  v
NewsParaphraser (~30 Arabic synonym pairs)
  │
  v
NewsStore (SQLite, UNIQUE dedup)
  │
  v
/api/v1/news/feed (REST API)
  │
  v
Frontend News Page (RTL cards, filter chips, search)
```

---

## 9. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
│                                                              │
│  ┌──────────────────┐              ┌──────────────────────┐  │
│  │ Vercel            │              │ Railway               │  │
│  │                    │              │                        │  │
│  │ Next.js 14         │──rewrites──>│ FastAPI (uvicorn)      │  │
│  │ frontend-two-nu-   │              │ raid-ai-app-           │  │
│  │ 83.vercel.app      │              │ production.up.         │  │
│  │                    │              │ railway.app            │  │
│  │ Env:               │              │                        │  │
│  │ BACKEND_URL=       │              │ Env:                   │  │
│  │   railway_url      │              │ DB_BACKEND=postgres    │  │
│  │                    │              │ POSTGRES_*=...         │  │
│  └──────────────────┘              │ AUTH_JWT_SECRET=...    │  │
│                                     │ GEMINI_API_KEY=...     │  │
│                                     │                        │  │
│                                     │  ┌──────────────────┐  │  │
│                                     │  │ PostgreSQL 16     │  │  │
│                                     │  │ postgres.railway  │  │  │
│                                     │  │ .internal         │  │  │
│                                     │  │                    │  │  │
│                                     │  │ DB: raid_ai        │  │  │
│                                     │  │ User: raid         │  │  │
│                                     │  └──────────────────┘  │  │
│                                     └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Docker Compose (Local Development)
```yaml
services:
  postgres:    # PostgreSQL 16 Alpine, auto-init with schema.sql
  app:         # Python 3.11 FastAPI, depends on postgres
  redis:       # Redis 7 Alpine (optional cache)
  pgadmin:     # pgAdmin 4 (optional, --profile tools)
```

### Dockerfile
```dockerfile
FROM python:3.11-slim
# Install: libpq-dev, gcc, postgresql-client
# Non-root user: appuser (uid 1000)
# Healthcheck: curl http://localhost:8084/health
# CMD: ./entrypoint.sh
```

### entrypoint.sh
1. Map `POSTGRES_*` → `PG_*` env vars
2. Check if DB needs initialization (SELECT from companies)
3. If first run: `psql schema.sql` + `python csv_to_postgres.py`
4. `exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8084}`

---

## 10. Dependencies

### Python (`requirements.txt`)

| Package | Version | Purpose |
|---------|---------|---------|
| vanna | >=2.0.2,<3.0 | AI text-to-SQL framework |
| fastapi | >=0.115.6,<1.0 | Web framework |
| uvicorn[standard] | >=0.34.0,<1.0 | ASGI server |
| openai | >=1.20.0,<2.0 | LLM client (Vanna dependency) |
| anthropic | >=0.41.0,<1.0 | Claude LLM client |
| psycopg2-binary | >=2.9.10,<3.0 | PostgreSQL driver |
| pandas | >=2.1.0,<3.0 | Data processing |
| numpy | >=1.24.0,<3.0 | Numerical computing |
| plotly | >=5.20.0,<6.0 | Chart generation |
| python-dotenv | >=1.0.1,<2.0 | .env file loading |
| pydantic-settings | >=2.0.0,<3.0 | Typed configuration |
| pydantic[email] | >=2.5.0,<3.0 | Data validation |
| pyjwt | >=2.8.1,<3.0 | JWT authentication |
| bcrypt | >=4.1.0,<5.0 | Password hashing |
| redis | >=5.0.0,<6.0 | Cache client |
| apscheduler | >=3.10.4,<4.0 | Background scheduling |
| yfinance | >=0.2.35,<1.0 | Yahoo Finance market data |
| requests | >=2.31.0,<3.0 | HTTP client (scraping) |
| beautifulsoup4 | >=4.12.0,<5.0 | HTML parsing |
| lxml | >=4.10.0,<6.0 | XML/HTML parser backend |
| pytest | >=8.0.0,<9.0 | Testing framework |
| pytest-asyncio | >=0.24.0,<1.0 | Async test support |
| httpx | >=0.27.0,<1.0 | Async HTTP client (testing) |

### Node.js (`frontend/package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| next | 14.2.35 | React framework (App Router) |
| react / react-dom | 18.x | UI library |
| react-markdown | 10.1.0 | Markdown rendering (AI responses) |
| react-plotly.js | 2.6.0 | Plotly chart components |
| plotly.js-dist-min | 3.3.1 | Plotly core library |
| react-syntax-highlighter | 16.1.0 | SQL code highlighting |
| lightweight-charts | 4.2.3 | TradingView candlestick (TASI) |
| swr | 2.4.0 | Data fetching with caching |
| clsx | 2.1.1 | Conditional className |
| tailwind-merge | 3.4.0 | Tailwind class dedup |
| typescript | 5.x | Type checking |
| tailwindcss | 3.4.1 | CSS framework |
| vitest | 4.0.18 | Unit testing |
| msw | 2.12.9 | API mocking |
| @testing-library/react | - | Component testing |

---

## 11. Environment Variables

### Backend (Railway / Docker)

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | `development` / `staging` / `production` |
| `GEMINI_API_KEY` | - | Google Gemini API key (active LLM) |
| `ANTHROPIC_API_KEY` | - | Anthropic Claude API key (legacy) |
| `DB_BACKEND` | `sqlite` | `sqlite` or `postgres` |
| `DB_SQLITE_PATH` | `saudi_stocks.db` | SQLite database path |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `tasi_platform` | Database name |
| `POSTGRES_USER` | `tasi_user` | Database user |
| `POSTGRES_PASSWORD` | - | Database password |
| `SERVER_HOST` | `0.0.0.0` | Bind address |
| `SERVER_PORT` | `8084` | Server port |
| `SERVER_DEBUG` | `false` | Debug mode |
| `AUTH_JWT_SECRET` | auto-generated | JWT signing secret (set in production!) |
| `AUTH_JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token TTL |
| `AUTH_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token TTL |
| `MW_CORS_ORIGINS` | localhost,vercel,railway | Comma-separated CORS origins |
| `MW_RATE_LIMIT_PER_MINUTE` | `60` | Rate limit per IP |
| `FRONTEND_URL` | - | Dynamic CORS origin for frontend |
| `RAILWAY_PUBLIC_DOMAIN` | - | Railway auto-set domain |
| `PG_POOL_MIN` | `2` | Min PostgreSQL connections |
| `PG_POOL_MAX` | `10` | Max PostgreSQL connections |
| `CACHE_ENABLED` | `false` | Enable Redis caching |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |
| `LOG_LEVEL` | `INFO` | Logging level |

### Frontend (Vercel)

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:8084` | Backend URL for Next.js rewrites (server-side only) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8084` | Fallback backend URL |

---

## 12. Summary Statistics

| Metric | Count |
|--------|-------|
| **Backend Python files** | 80+ |
| **Frontend TypeScript files** | 60+ |
| **API endpoints** | 40+ REST + 1 SSE |
| **Database tables (SQLite)** | 10 |
| **Database tables (PostgreSQL)** | 35 |
| **Database indexes** | 30+ |
| **Database views** | 2 |
| **Frontend pages** | 11 |
| **Frontend components** | 39 |
| **Custom React hooks** | 20+ |
| **Context providers** | 3 (Theme, Language, Auth) |
| **Middleware layers** | 4 + 1 conditional |
| **Backend services** | 14 |
| **API route files** | 15 |
| **News sources** | 5 (Arabic financial) |
| **Python dependencies** | 25 |
| **Node.js dependencies** | 15+ |
| **Design tokens (colors)** | 50+ |
| **Animations** | 9 |
| **Tests (backend)** | 496 pass, 18 skipped |
| **Tests (frontend)** | Vitest suite passes |
| **TASI stocks covered** | ~500 |
| **CSV source columns** | 1,062 |

---

*This document provides a complete technical reference for the Ra'd AI TASI Saudi Stock Market Platform. For Vanna 2.0 API patterns, see `vanna-skill/SKILL.md` and `vanna-skill/references/`. For agent behavioral rules, see `AGENTS.md`.*
