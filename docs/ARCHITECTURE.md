# Architecture

System architecture documentation for the Ra'd AI TASI Platform.

## System Overview

```
+---------------------------------------------------------------------+
|                          CLIENTS                                     |
|  +------------------+    +-------------------+    +---------------+  |
|  | Next.js Frontend |    | Legacy Template   |    | API Consumers |  |
|  | (Vercel/port 3k) |    | (served by app)   |    | (curl, etc.)  |  |
|  +--------+---------+    +--------+----------+    +-------+-------+  |
|           |                       |                       |          |
+-----------+-----------------------+-----------------------+----------+
            |                       |                       |
            v                       v                       v
+---------------------------------------------------------------------+
|                      MIDDLEWARE STACK                                 |
|  CORS -> RateLimit -> RequestLogging -> ErrorHandler                 |
+---------------------------------------------------------------------+
            |
            v
+---------------------------------------------------------------------+
|                      FastAPI APPLICATION (app.py)                     |
|                                                                      |
|  +-------------------+  +------------------+  +------------------+   |
|  | Vanna 2.0 Agent   |  | API Routes       |  | Auth Module      |   |
|  | (text-to-SQL +    |  | /api/v1/*        |  | JWT + bcrypt     |   |
|  |  chart generation)|  |                  |  |                  |   |
|  +--------+----------+  +--------+---------+  +--------+---------+   |
|           |                      |                      |            |
+---------------------------------------------------------------------+
            |                      |                      |
            v                      v                      v
+---------------------------------------------------------------------+
|                        DATA LAYER                                    |
|                                                                      |
|  +------------------+  +------------------+  +------------------+    |
|  | SQLite (dev)     |  | PostgreSQL (prod)|  | Redis (optional) |    |
|  | saudi_stocks.db  |  | Connection Pool  |  | Response Cache   |    |
|  +------------------+  +------------------+  +------------------+    |
|                                                                      |
+---------------------------------------------------------------------+
            |
            v
+---------------------------------------------------------------------+
|                    EXTERNAL SERVICES                                  |
|                                                                      |
|  +------------------+  +------------------+  +------------------+    |
|  | Anthropic /      |  | Yahoo Finance    |  | Arabic News      |    |
|  | Gemini LLM API   |  | (yfinance)       |  | Sources (5)      |    |
|  +------------------+  +------------------+  +------------------+    |
+---------------------------------------------------------------------+
```

## Component Inventory

### Backend Core (`app.py`)

The central FastAPI application that assembles and wires all components:

| Component | Role | Module |
|-----------|------|--------|
| Vanna Agent | Text-to-SQL + chart generation | `vanna.Agent` |
| AnthropicLlmService | LLM integration (Claude/Gemini) | `vanna.integrations.anthropic` |
| SqliteRunner | SQLite query execution | `vanna.integrations.sqlite` |
| PostgresRunner | PostgreSQL query execution | `vanna.integrations.postgres` |
| ToolRegistry | Registers RunSqlTool + VisualizeDataTool | `vanna.ToolRegistry` |
| DemoAgentMemory | In-memory conversation history | `vanna.integrations.local` |
| SystemPromptBuilder | Schema documentation for LLM | `config/prompts.py` |
| VannaFastAPIServer | Creates FastAPI app with SSE chat | `vanna.servers.fastapi` |

### API Routes (`api/routes/`)

| Route Module | Prefix | DB Requirement | Description |
|-------------|--------|----------------|-------------|
| `health.py` | `/api/v1/health` | PostgreSQL | Full platform health check |
| `charts.py` | `/api/v1/charts` | Any | Chart generation endpoints |
| `tasi_index.py` | `/api/v1/charts/tasi` | Any | TASI index OHLCV data |
| `stock_ohlcv.py` | `/api/v1/charts/{ticker}` | Any | Per-stock OHLCV data |
| `charts_analytics.py` | `/api/v1/charts` | Any | Technical analysis overlays |
| `market_analytics.py` | `/api/v1/market` | Any | Market-wide analytics |
| `entities.py` | `/api/entities` | PostgreSQL | Company CRUD (PG) |
| `sqlite_entities.py` | `/api/v1/entities` | SQLite | Company listings (SQLite) |
| `stock_data.py` | `/api/v1/stock` | Any | Individual stock data |
| `news.py` | `/api/news` | PostgreSQL | News articles (PG) |
| `news_feed.py` | `/api/v1/news` | SQLite | News feed (scraped, SQLite) |
| `reports.py` | `/api/reports` | PostgreSQL | Technical reports |
| `announcements.py` | `/api/announcements` | PostgreSQL | CMA/Tadawul announcements |
| `auth.py` | `/api/auth` | Any | Login, register, refresh |
| `watchlists.py` | `/api/v1/watchlists` | Any | User watchlists |

### Services (`services/`)

| Service | Purpose | Dependencies |
|---------|---------|-------------|
| `health_service.py` | DB + LLM health checks | psycopg2 |
| `news_service.py` | PG-backed news CRUD | psycopg2 |
| `reports_service.py` | PG-backed reports CRUD | psycopg2 |
| `announcement_service.py` | PG-backed announcement CRUD | psycopg2 |
| `auth_service.py` | User registration/login | psycopg2, bcrypt |
| `user_service.py` | User management | psycopg2 |
| `tasi_index.py` | TASI index OHLCV via yfinance | yfinance |
| `stock_ohlcv.py` | Per-stock OHLCV via yfinance | yfinance |
| `news_scraper.py` | 5-source Arabic news scraper | requests, bs4 |
| `news_store.py` | SQLite news storage | sqlite3 |
| `news_scheduler.py` | Background news fetch (30min) | threading |
| `news_paraphraser.py` | Arabic synonym substitution | (built-in) |
| `db_compat.py` | SQLite/PG compatibility layer | sqlite3, psycopg2 |
| `audit_service.py` | Audit logging | psycopg2 |

### Authentication (`auth/`)

| Module | Purpose |
|--------|---------|
| `jwt_handler.py` | JWT token creation/validation |
| `password.py` | bcrypt password hashing |
| `models.py` | Auth data models |
| `dependencies.py` | FastAPI auth dependencies |

### Configuration (`config/`)

| Module | Purpose |
|--------|---------|
| `settings.py` | Pydantic settings (DB, LLM, Server, Auth, Pool, Cache, Middleware) |
| `logging_config.py` | Structured logging (JSON prod, pretty dev) |
| `error_tracking.py` | Pluggable error tracking (log/Sentry) |
| `prompts.py` | System prompt for Vanna agent |
| `lifecycle.py` | Startup diagnostics and env validation |

### Middleware (`middleware/`)

| Module | Purpose | Order |
|--------|---------|-------|
| `cors.py` | CORS header management | 1st |
| `rate_limit.py` | Per-IP rate limiting | 2nd |
| `request_logging.py` | Request/response logging | 3rd |
| `error_handler.py` | Global exception handler | 4th |

Middleware executes in reverse registration order (last registered = outermost). The error handler wraps everything to catch unhandled exceptions.

### Chart Engine (`chart_engine/`)

| Module | Purpose |
|--------|---------|
| `raid_chart_generator.py` | Custom Plotly chart generator for Vanna |

### Cache (`cache/`)

| Module | Purpose |
|--------|---------|
| `redis_client.py` | Redis connection management |
| `decorators.py` | `@cached` decorator for route handlers |

### Database (`database/`)

| Module | Purpose |
|--------|---------|
| `pool.py` | PG connection pool (psycopg2) |
| `manager.py` | Database manager abstraction |
| `schema.sql` | Full PostgreSQL DDL |
| `csv_to_postgres.py` | CSV data loader for PG |
| `migrate_sqlite_to_pg.py` | SQLite to PG migration |

### Frontend (`frontend/`)

Next.js 14 application with TypeScript and Tailwind CSS:

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Dashboard landing page |
| Chat | `/chat` | AI chat interface (SSE) |
| Market | `/market` | TASI index chart (lightweight-charts) |
| Charts | `/charts` | TradingView embedded charts |
| Stock | `/stock/[ticker]` | Individual stock view |
| News | `/news` | Arabic news feed |
| News Detail | `/news/[id]` | Single news article |
| Reports | `/reports` | Technical reports |
| Announcements | `/announcements` | CMA/Tadawul announcements |
| Watchlist | `/watchlist` | User stock watchlists |
| Login | `/login` | Authentication page |

## Data Flow Diagrams

### Text-to-SQL Chat Flow

```
User Query (Arabic/English)
       |
       v
[Next.js Frontend] -- POST /api/vanna/v2/chat_sse -->
       |
       v
[FastAPI SSE Endpoint]
       |
       v
[Vanna Agent]
  |-- 1. SystemPromptBuilder: inject schema + instructions
  |-- 2. LLM Service: generate SQL from natural language
  |-- 3. RunSqlTool: execute SQL against SQLite/PostgreSQL
  |-- 4. VisualizeDataTool: generate Plotly chart (if applicable)
  |-- 5. LLM Service: summarize results in natural language
       |
       v
[SSE Stream] -- text/event-stream -->
       |
       v
[Frontend: render text + chart]
```

### Chart Request Flow (TASI Index)

```
[Frontend TASIIndexChart.tsx]
       |
       | GET /api/v1/charts/tasi/index?period=1mo
       v
[tasi_index route]
       |
       v
[tasi_index service]
  |-- Check circuit breaker state
  |-- If CLOSED: call yfinance (^TASI.SR)
  |   |-- Success: return OHLCV data, reset failure count
  |   |-- Failure: increment failures, open breaker if threshold hit
  |-- If OPEN: return cached/mock data
       |
       v
[JSON response: {dates, open, high, low, close, volume}]
       |
       v
[Frontend: render candlestick + volume with lightweight-charts]
```

### Authentication Flow

```
[Login Page]
       |
       | POST /api/auth/login {username, password}
       v
[auth route]
       |
       v
[auth_service]
  |-- Look up user in database
  |-- Verify password (bcrypt)
  |-- Generate JWT access token + refresh token
       |
       v
[Response: {access_token, refresh_token, token_type}]
       |
       v
[Frontend: store tokens, attach to subsequent requests]
       |
       | Authorization: Bearer <access_token>
       v
[Auth dependency: verify JWT, extract user]
       |
       v
[Protected route handler]
```

### News Scraping Flow

```
[NewsScheduler (daemon thread)]
  |-- Startup: immediate fetch
  |-- Then: every 30 minutes
       |
       v
[NewsScraper]
  |-- For each of 5 sources:
  |   |-- HTTP GET with requests + BeautifulSoup
  |   |-- Parse title, body, date, source URL
  |   |-- 1.5s delay between sources
       |
       v
[NewsParaphraser]
  |-- Apply Arabic synonym substitutions (~30 pairs)
       |
       v
[NewsStore (SQLite)]
  |-- INSERT OR IGNORE (dedup by title + source_name)
       |
       v
[/api/v1/news/feed]
  |-- Frontend polls for latest articles
  |-- Supports source filtering, search, pagination
```

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI Framework | Vanna 2.0 | Purpose-built for text-to-SQL with tool calling and agent memory |
| LLM | Gemini 2.5 Flash / Claude Sonnet 4.5 | Fast, accurate SQL generation; supports tool use |
| Backend Framework | FastAPI | Async, auto-docs, SSE support, Python ecosystem |
| Dev Database | SQLite | Zero-config local development, single-file portability |
| Prod Database | PostgreSQL 16 | ACID compliance, connection pooling, Railway plugin |
| Frontend | Next.js 14 | App router, RSC, TypeScript, Vercel deployment |
| Charts (TASI) | lightweight-charts v4 | TradingView open-source, candlestick + volume |
| Charts (Stocks) | TradingView Widget | Rich embedded charts for TADAWUL symbols |
| Charts (AI) | Plotly | Vanna-native visualization via VisualizeDataTool |
| Cache | Redis (optional) | Low-latency response caching, graceful degradation |
| Auth | JWT + bcrypt | Stateless tokens, industry-standard password hashing |
| Deployment | Railway + Docker | PaaS with PostgreSQL plugin, Dockerfile-based builds |
| CI/CD | GitHub Actions | Two-stage: CI (test) -> Deploy (Railway) |
| Language (UI) | Arabic (RTL) | Target audience is Saudi market participants |
| Design | Gold/dark theme | Financial industry aesthetic, brand identity |

## Database Schema

10 normalized tables derived from a 1062-column flat CSV of ~500 TASI-listed companies:

```
+-------------------+     +---------------------+     +--------------------+
| companies         |     | market_data         |     | valuation_metrics  |
| (ticker, name,    |<--->| (price, volume,     |<--->| (pe, pb, ps,       |
|  sector, industry)|     |  market_cap, beta)  |     |  ev_ebitda)        |
+-------------------+     +---------------------+     +--------------------+
         |
         +---> profitability_metrics (margins, ROE, ROA)
         +---> dividend_data (yield, payout, growth)
         +---> financial_summary (revenue, earnings, debt)
         +---> analyst_data (target price, recommendations)
         +---> balance_sheet (multi-period, annual/quarterly/TTM)
         +---> income_statement (multi-period, annual/quarterly/TTM)
         +---> cash_flow (multi-period, annual/quarterly/TTM)
```

Financial statement tables use `period_type` (annual/quarterly/ttm) and `period_index` (0=most recent) for time-series queries.

## Known Limitations

1. **yfinance dependency**: Yahoo Finance API is unofficial and may be rate-limited or blocked. Circuit breaker pattern mitigates this with fallback to cached/mock data.

2. **News scraping fragility**: The 5 Arabic news sources may change their HTML structure, breaking scrapers. Each source is independent; failures are isolated.

3. **Single-node deployment**: Currently runs as a single Railway instance. No horizontal scaling or load balancing configured.

4. **In-memory agent memory**: `DemoAgentMemory` does not persist across restarts. Conversation history is lost on redeployment.

5. **SQLite concurrency**: SQLite backend does not support concurrent writes. Suitable for development only.

6. **TradingView TASI**: TADAWUL:TASI is not available in TradingView embedded widgets. TASI index uses lightweight-charts with yfinance data instead.

7. **No database migrations**: Schema changes require manual DDL or a fresh init. No migration framework (Alembic) is integrated.

8. **JWT secret rotation**: Changing `AUTH_JWT_SECRET` invalidates all existing tokens. No graceful rotation mechanism.

## Related Documents

- [Deployment Runbook](./DEPLOYMENT_RUNBOOK.md) - Full deployment procedures
- [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md) - Pre/post deploy steps
- [Metrics and Monitoring](./METRICS_AND_MONITORING.md) - Observability guide
- [API Contracts](./api-contracts.md) - API endpoint specifications
- [Data Freshness](./data-freshness.md) - Data pipeline documentation
- [UI Transition](./ui-transition.md) - Frontend migration notes
