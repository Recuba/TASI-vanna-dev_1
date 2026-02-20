[![CI](https://github.com/Recuba/TASI-vanna-dev_1/actions/workflows/ci.yml/badge.svg)](https://github.com/Recuba/TASI-vanna-dev_1/actions/workflows/ci.yml)

# Ra'd AI - TASI Saudi Stock Market Platform

AI-powered financial analyst for the Saudi stock market (TASI - Tadawul All Share Index). Ask questions in natural language, get SQL-backed answers with interactive Plotly charts.

Built on [Vanna 2.0](https://vanna.ai/) with Google Gemini, supporting dual SQLite/PostgreSQL backends.

## Features

- Natural language to SQL query generation via Google Gemini
- Interactive Plotly chart visualization (bar, line, scatter, heatmap)
- Comprehensive data for ~500 Saudi-listed companies
- Financial statements (balance sheet, income statement, cash flow) with multi-period history
- Market data, valuation metrics, analyst consensus, dividends
- **Live Market Widgets**: Real-time crypto, metals, oil, and global indices via SSE with auto-reconnection
- Real-time news feed with Server-Sent Events (SSE) from 5 Arabic sources
- **Connection status indicators**: Live/reconnecting/offline badge on SSE streams
- Full Arabic RTL support with Tailwind CSS logical properties and lint enforcement
- **Navigation progress bar**: Gold-themed top-loading indicator for page transitions
- Virtual scrolling for high-performance list rendering
- **Mobile-responsive market view**: Card layout for small screens
- **GZip compression**: Automatic response compression for payloads >1KB
- **Route-level loading/error states**: Dedicated loading skeletons and error boundaries per route
- News aggregation, announcement tracking, technical reports
- Dual database backend: SQLite for development, PostgreSQL for production
- Async I/O wrappers (`asyncio.to_thread`) for non-blocking database access
- JWT authentication with production secret enforcement
- **SQL security pipeline**: Input sanitization, table/column allowlisting, query validation with Vanna integration hook
- **Resilience**: Circuit breaker, retry with backoff, timeout management, graceful degradation for external services
- **Query caching**: Tiered Redis cache with GZip compression and connection pooling
- **Audit logging**: Structured JSON logging, correlation IDs, query audit trail, security event tracking
- **Cost control**: LLM spend tracking middleware with configurable limits
- **Component decomposition**: Charts and Markets pages split into focused subcomponents for maintainability
- **Modular API client**: Domain-scoped API modules under `lib/api/` with backward-compatible shim
- **Auth enhancements**: Token refresh, guest login, profile enrichment
- **Enriched stock detail**: Financials, dividends, reports, news, and watchlist in one page
- **Prometheus metrics**: `/metrics` endpoint via `prometheus-fastapi-instrumentator` (graceful fallback if not installed)
- **Pool stats**: Connection pool size (SQLite or PostgreSQL) reported in `/health` response
- **Structured request tracing**: `ContextVar`-based request ID injected into all log records within a request
- **Security scan CI**: bandit static analysis with medium severity/confidence thresholds
- **Type check CI**: mypy type checking across all backend modules
- **Dependency lockfile**: `pip-compile`-managed `requirements.lock` with CI verification

## Quick Start

### Local Development (SQLite)

```bash
# Clone and install
git clone <repo-url>
cd vanna-ai-testing
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env and set GEMINI_API_KEY

# Build database and start
python csv_to_sqlite.py
python app.py
```

Open http://localhost:8084

### Docker (PostgreSQL)

```bash
cp .env.example .env
# Edit .env: set GEMINI_API_KEY and POSTGRES_PASSWORD

docker compose up -d
```

Services:
- App: http://localhost:8084
- pgAdmin (optional): `docker compose --profile tools up -d` then http://localhost:5050

## Architecture

```
        +-------------------+          +-------------------+
        |  Next.js 14 (3000)|          |   Browser/User    |
        |  - RTL Arabic UI  |          |   (Legacy UI)     |
        |  - SSE News Feed  |          +--------+----------+
        |  - Market Widgets |                   |
        |  - Virtual Scroll |                   |
        +--------+----------+                   |
                 |                              |
                 +----------+  +----------------+
                            |  |
                   +--------v--v-------+
                   |  FastAPI (8084)    |
                   |  - GZip Middleware |
                   |  - Chat SSE       |
                   |  - News Stream    |
                   |  - Widgets Stream |
                   |  - REST API       |
                   +----+--------+-----+
                        |        |
           +------------+        +------------+
           |                                  |
  +--------v----------+            +----------v--------+
  |  Vanna 2.0 Agent  |            |   QuotesHub       |
  |  - Gemini LLM     |            |   - 4 Providers   |
  |  - RunSqlTool     |            |   (crypto, metals,|
  |  - VisualizeTool  |            |   oil, indices)   |
  +--------+----------+            |   - Redis pub/sub |
           |                       +-------------------+
  +--------v----------+
  | backend/ module   |
  | - SQL validation  |
  | - Cost controller |
  | - Circuit breaker |
  | - Query cache     |
  | - Audit logging   |
  +--------+----------+
           |
  +--------v----------+
  |  Async I/O Layer  |
  |  asyncio.to_thread|
  +--------+----------+
           |
  +--------+--------------+
  |                        |
  +--------v--------+  +--v--------------+
  |     SQLite       |  |   PostgreSQL    |
  | (saudi_stocks.db)|  |  (tasi_platform)|
  |  10 core tables  |  |  10 core + 14   |
  +-----------------+  |  extended tables |
                        +-----------------+
```

### Backend Module (`backend/`)

Enterprise-grade infrastructure providing security, resilience, caching, and observability:

| Package | Purpose |
|---|---|
| `backend/security/` | SQL validation pipeline: input sanitizer, table/column allowlist, SQL query validator, Vanna output hook |
| `backend/middleware/` | Cost controller (LLM spend tracking), Redis-backed sliding window rate limiter, FastAPI middleware registration |
| `backend/services/audit/` | Query audit logging, security event tracking, structured JSON logger, correlation ID middleware |
| `backend/services/cache/` | Tiered query cache, GZip compression, Redis connection management, database connection pooling, cache maintenance |
| `backend/services/resilience/` | Circuit breaker, retry with backoff, timeout manager, graceful degradation |

## Database

### Core Tables (10 tables, both backends)

| Table | Description | Rows |
|---|---|---|
| `companies` | Company info, sector, industry | 500 |
| `market_data` | Price, volume, market cap, beta | 500 |
| `valuation_metrics` | PE, PB, EV ratios, EPS | 500 |
| `profitability_metrics` | Margins, ROA, ROE, growth | 500 |
| `dividend_data` | Yields, payout ratio, dates | 500 |
| `financial_summary` | Revenue, debt, cash flow summary | 500 |
| `analyst_data` | Target prices, recommendations | 500 |
| `balance_sheet` | Assets, liabilities, equity (multi-period) | ~2,527 |
| `income_statement` | Revenue, expenses, net income (multi-period) | ~2,632 |
| `cash_flow` | Operating, investing, financing (multi-period) | ~2,604 |

### PostgreSQL Extended Tables

The PostgreSQL schema (`database/schema.sql`) adds tables for XBRL data, price history, news/announcements, user management, and audit logging.

## Configuration

All settings via environment variables. See `.env.example` for the complete reference.

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | (required) | Gemini API key |
| `ANTHROPIC_API_KEY` | (optional) | Legacy fallback key |
| `DB_BACKEND` | `sqlite` | Database backend (`sqlite` or `postgres`) |
| `DB_SQLITE_PATH` | `saudi_stocks.db` | SQLite file path |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `tasi_platform` | PostgreSQL database name |
| `POSTGRES_USER` | `tasi_user` | PostgreSQL user |
| `POSTGRES_PASSWORD` | (required for PG) | PostgreSQL password |
| `SERVER_PORT` | `8084` | FastAPI server port |
| `LOG_LEVEL` | `INFO` | Logging level |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis URL (optional, for widgets pub/sub) |
| `CACHE_ENABLED` | `false` | Enable Redis-based caching |
| `JWT_SECRET_KEY` | (required in prod) | JWT signing secret (enforced in PG mode) |

## Testing

1571+ backend tests (unit, integration, security, performance) and 231 frontend Vitest tests plus Playwright E2E specs.

```bash
# Backend tests (all)
python -m pytest tests/ -q

# Backend tests with coverage
python -m pytest tests/ --cov=api --cov=services --cov=backend --cov-report=term-missing

# Frontend unit tests (Vitest)
cd frontend && npx vitest run

# Frontend E2E tests (Playwright)
cd frontend && npx playwright test

# Frontend build verification (15 pages)
cd frontend && npx next build

# RTL lint check (catch physical direction classes)
cd frontend && npm run lint:rtl
```

### E2E Test Specs

Playwright specs under `frontend/e2e/`:

| Spec | Coverage |
|---|---|
| `news.spec.ts` | News portal: RTL, virtual scroll, SSE, source filters |
| `markets.spec.ts` | Markets: sector filter, sort, pagination, search, mobile card view |
| `stock-detail.spec.ts` | Stock detail: financials, dividends, watchlist, news, reports |

## Project Structure

See `CLAUDE.md` for the full directory tree and detailed architecture documentation.

## Contributing

1. Read `AGENTS.md` and `CLAUDE.md` before making changes
2. For Vanna 2.0 code, consult `vanna-skill/references/` first
3. All tests must pass before merging
4. Never commit `.env` or API keys
5. Update the system prompt in `app.py` if you change the database schema

## License

Proprietary. All rights reserved.
