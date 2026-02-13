# ARCHITECTURE.md

> System architecture documentation for the Ra'd AI TASI Platform.
> Last updated: 2026-02-13

---

## System Diagram

```
                           +-------------------+
                           |    Client / UI    |
                           | (Next.js / Legacy)|
                           +--------+----------+
                                    |
                                    | HTTPS (port 8084)
                                    v
+-----------------------------------------------------------------------+
|                          MIDDLEWARE PIPELINE                           |
|                                                                       |
|  +--------+    +-----------+    +--------+    +--------+    +------+  |
|  |  CORS  | -> | Correlat. | -> | Error  | -> |  Rate  | -> | Auth |  |
|  |        |    |    ID     |    |Handler |    |Limiter |    | JWT  |  |
|  +--------+    +-----------+    +--------+    +--------+    +------+  |
|       |              |               |             |            |     |
|       |         X-Request-ID    Safe JSON      429 + HDR    401/403  |
|       |         on all resp     errors         Retry-After           |
+-------+------+-------+--------+-------+---------+-------+----+------+
               |                                           |
               v                                           v
+------------------------------+          +-------------------------------+
|      FastAPI Router          |          |      Vanna 2.0 Agent          |
|                              |          |                               |
|  /health, /ready, /metrics   |          |  NL Query -> LLM -> SQL      |
|  /api/auth/* (login, reg.)   |          |                               |
|  /api/v1/news/*              |          |  +-------------------------+  |
|  /api/v1/tasi-index/*        |          |  | SQL Validation Pipeline |  |
|  /api/v1/charts/*            |          |  |                         |  |
|  /api/v1/entities/*          |          |  |  Sanitizer -> Validator |  |
|  /api/v1/stock-ohlcv/*       |          |  |  -> Allowlist -> Exec   |  |
|  /api/v1/announcements/*     |          |  +------------+------------+  |
+------------------------------+          +---------------+---------------+
               |                                          |
               v                                          v
+-----------------------------------------------------------------------+
|                         SERVICE LAYER                                 |
|                                                                       |
|  +----------+  +---------+  +---------+  +-----------+  +----------+  |
|  |  Query   |  | Circuit |  |  Retry  |  |  Timeout  |  |   Cost   |  |
|  |  Cache   |  | Breaker |  |  Logic  |  |  Manager  |  | Control  |  |
|  +----+-----+  +----+----+  +----+----+  +-----+-----+  +----+-----+  |
|       |             |            |              |             |        |
|  +----+-----+  +----+----+  +---+---+                                 |
|  | Compress.|  |  Maint.  |  | Audit |                                |
|  +----------+  +----------+  | Logger|                                |
|                              +---+---+                                |
+-----------------------------------------------------------------------+
               |                   |
               v                   v
+---------------------------+  +---------------------------+
|      DATA LAYER           |  |      AUDIT / SECURITY     |
|                           |  |                           |
|  SQLite (dev)             |  |  query_audit_log (PG)     |
|    saudi_stocks.db        |  |  security_events (PG)     |
|    10 normalized tables   |  |  Structured JSON logs     |
|                           |  |                           |
|  PostgreSQL (prod)        |  +---------------------------+
|    All core + PG-only     |
|    Connection pool        |  +---------------------------+
|    WAL archiving          |  |      EXTERNAL SERVICES    |
|                           |  |                           |
|  Redis                    |  |  Gemini / Anthropic LLM   |
|    db=0: Query cache      |  |  Yahoo Finance (TASI)     |
|    db=1: Rate limits +    |  |  5 Arabic news sources    |
|          cost tracking    |  +---------------------------+
+---------------------------+
```

---

## Component Descriptions

### Middleware Pipeline

Middleware executes in registration order for every HTTP request:

| Order | Component | Module | Purpose |
|---|---|---|---|
| 1 | **CORS** | `middleware/cors.py` | Validates `Origin` header against `MW_CORS_ORIGINS`; blocks unauthorized cross-origin requests |
| 2 | **Correlation ID** | `backend/services/audit/correlation.py` | Assigns UUID4 `X-Request-ID`; stores in contextvar for request-scoped tracing |
| 3 | **Error Handler** | `middleware/error_handler.py` | Catches unhandled exceptions; returns uniform `{"error": {...}}` JSON; hides stack traces in production |
| 4 | **Request Logging** | `middleware/request_logging.py` | Logs method, path, status, duration, IP for every request (JSON format) |
| 5 | **Rate Limiter** (existing) | `middleware/rate_limit.py` | In-memory sliding window per IP with tiered path limits |
| 6 | **Rate Limiter** (new) | `backend/middleware/rate_limit_middleware.py` | Redis-backed sliding window; JWT user ID or IP identification; `X-RateLimit-*` headers |
| 7 | **GZip Compression** | `backend/services/cache/compression.py` | Compresses responses above threshold; `Content-Encoding: gzip` |

### FastAPI Routes

| Router | Prefix | Auth | Description |
|---|---|---|---|
| `api/routes/health.py` | `/health`, `/health/live`, `/health/ready` | No | Liveness, readiness, full health report |
| `backend/routes/health.py` | `/health`, `/ready`, `/metrics/basic` | No | Enhanced health + operational metrics + circuit breaker states |
| `api/routes/auth.py` | `/api/auth` | No | Register, login, refresh, logout |
| `api/routes/news.py` | `/api/v1/news` | Optional | News articles CRUD |
| `api/routes/news_feed.py` | `/api/v1/news/feed` | No | Scraped Arabic news feed |
| `api/routes/announcements.py` | `/api/v1/announcements` | Optional | CMA/Tadawul announcements |
| `api/routes/tasi_index.py` | `/api/v1/tasi-index` | No | TASI index data (OHLCV + health) |
| `api/routes/charts.py` | `/api/v1/charts` | No | Chart generation |
| `api/routes/charts_analytics.py` | `/api/v1/charts/analytics` | No | Chart analytics |
| `api/routes/entities.py` | `/api/v1/entities` | No | Company entity lookup (PG) |
| `api/routes/sqlite_entities.py` | `/api/v1/sqlite/entities` | No | Company entity lookup (SQLite) |
| `api/routes/stock_ohlcv.py` | `/api/v1/stock-ohlcv` | No | Individual stock OHLCV data |
| `api/routes/stock_data.py` | `/api/v1/stock-data` | No | Stock data endpoints |
| `api/routes/market_analytics.py` | `/api/v1/market-analytics` | No | Market analytics |
| `api/routes/reports.py` | `/api/v1/reports` | Optional | Technical reports |
| `api/routes/watchlists.py` | `/api/v1/watchlists` | Yes | User watchlists (JWT required) |
| Vanna SSE | `/api/v1/chat` (SSE) | No | Natural language to SQL chat (Vanna 2.0 agent) |

### Vanna 2.0 Agent

The core AI pipeline assembled in `app.py`:

```
User NL Query
    |
    v
SaudiStocksSystemPromptBuilder  -- schema docs + constraints
    |
    v
AnthropicLlmService / Gemini   -- NL -> SQL generation
    |
    v
ToolRegistry
    |-- RunSqlTool              -- executes validated SQL
    |-- VisualizeDataTool       -- Plotly chart generation
    |
    v
Agent (stream_responses=True, max_tool_iterations=10)
    |
    v
SSE Response
```

### SQL Validation Pipeline

Three-stage defense for AI-generated SQL:

```
Stage 1: Input Sanitizer (backend/security/sanitizer.py)
    - Strip control chars, Unicode NFC normalize
    - HTML escape, truncate to 2000 chars
    - Reject raw SQL input
         |
         v
Stage 2: SqlQueryValidator (backend/security/sql_validator.py)
    - sqlparse parsing + analysis
    - Forbidden operation detection (28+ operations)
    - Injection pattern matching (9 regex patterns)
    - Stacked query detection
    - Comment injection scanning
    - Schema probing detection
    - Risk score calculation (0.0-1.0)
         |
         v
Stage 3: QueryAllowlist (backend/security/allowlist.py)
    - Table allowlist enforcement (hot-reload from JSON)
    - Operation allowlist (SELECT only by default)
    - Blocked table rejection
         |
         v
validate_vanna_output() -> ValidatedQuery {is_safe, sql, reason, risk_score}
```

### Resilience Pipeline

Protection against cascading failures:

```
External Call (LLM, DB, Yahoo Finance)
    |
    v
Circuit Breaker (backend/services/resilience/circuit_breaker.py)
    - States: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
    - failure_threshold=5, recovery_timeout=30s
    - Global registry for health reporting
         |
         v
Retry with Backoff (backend/services/resilience/retry.py)
    - @with_retry: exponential backoff + jitter
    - max_attempts=3, base_delay=1s, max_delay=30s
    - Configurable retryable_exceptions
         |
         v
Timeout Manager (backend/services/resilience/timeout_manager.py)
    - Default: 30s, Max: 120s
    - Slow query logging (threshold: 5s)
    - PG backend cancellation on timeout
         |
         v
Result or CircuitBreakerOpen / TimeoutError / RetryExhausted
```

### Caching Pipeline

```
SQL Query
    |
    v
QueryCache.get(sql)  -- SHA-256 key, msgpack deserialization
    |
    +-- HIT  -> Return cached data (hit_rate tracked)
    |
    +-- MISS -> Execute query
                    |
                    v
               classify_tier(sql)
                    |
                    +-- MARKET:     60s TTL
                    +-- HISTORICAL: 3600s TTL
                    +-- SCHEMA:     86400s TTL
                    |
                    v
               QueryCache.set(sql, data, tier)
                    |
                    v
               compress_large_response() if > 1024 bytes
                    |
                    v
               RedisManager.set(key, packed, ttl)  (db=0)
```

### Data Layer

**SQLite (development):**
- 10 normalized tables from 1062-column CSV
- 500 TASI-listed companies
- 7 single-row tables + 3 financial statement tables (unpivoted)
- Path: `saudi_stocks.db` (script-relative)

**PostgreSQL (production):**
- All SQLite tables + enrichment tables (sectors, entities, filings, XBRL)
- User management (users, watchlists, alerts)
- Content tables (news_articles, technical_reports, announcements)
- Audit tables (query_audit_log, security_events)
- Connection pool: SQLAlchemy async engine (pool_size=5, max_overflow=10)
- Indexes: 9 production indexes for audit/security tables

**Redis:**
- db=0: Query cache (msgpack serialized, tiered TTLs)
- db=1: Rate limiting (sorted sets) + cost tracking (hash maps)
- Optional: all Redis-dependent features fall back to in-memory

### Audit System

```
Every Request
    |
    v
CorrelationMiddleware -> request_id (contextvar)
    |
    +-> Structured Logger (JSON)
    |     - timestamp, level, logger, message, request_id
    |     - Extra fields merged from caller
    |
    +-> QueryAuditLogger
    |     - Logs to tasi.audit.query
    |     - Persists to query_audit_log (PG, best-effort)
    |     - Fields: nl_query, generated_sql, validation_result,
    |       execution_time_ms, row_count, risk_score, ip_address
    |
    +-> SecurityEventLogger
          - Logs to tasi.audit.security
          - Persists to security_events (PG, best-effort)
          - Types: sql_injection_attempt, forbidden_keyword,
            rate_limit_exceeded, auth_failure, invalid_input,
            suspicious_pattern, unauthorized_access
          - Severity: LOW, MEDIUM, HIGH, CRITICAL
```

---

## Technology Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| **Runtime** | Python | 3.11+ | Vanna 2.0 + FastAPI compatibility |
| **Web Framework** | FastAPI | 0.115.6+ | Async, OpenAPI docs, SSE streaming |
| **AI Agent** | Vanna 2.0 | 2.0.2 | NL-to-SQL with tool calling |
| **LLM** | Gemini 2.5 Flash / Claude Sonnet 4.5 | Current | Primary: Gemini; fallback: Anthropic |
| **Frontend** | Next.js 14 + TypeScript + Tailwind CSS | 14.x | RSC, app router, RTL Arabic support |
| **Legacy UI** | HTML + vanna-chat web component | - | CDN-loaded, gold/dark theme |
| **Database (dev)** | SQLite | 3.x | Zero-config local development |
| **Database (prod)** | PostgreSQL | 16 | Full schema, extensions, connection pooling |
| **Cache** | Redis | 5.0+ | Query cache (db=0), rate limiting (db=1) |
| **SQL Parsing** | sqlparse | 0.5+ | Query validation and table extraction |
| **Auth** | PyJWT + bcrypt | - | HS256 tokens, password hashing |
| **Serialization** | msgpack | - | Compact cache storage |
| **ORM/Pool** | SQLAlchemy (async) | 2.x | Async connection pool with QueuePool |
| **Config** | pydantic-settings | 2.x | Typed env var management |
| **Container** | Docker + Docker Compose | - | PostgreSQL + app + pgAdmin |
| **Deployment** | Railway | - | PaaS hosting with auto-deploy |
| **CI/CD** | GitHub Actions | - | CI (lint, test) + Deploy workflows |
| **Charts** | Plotly + lightweight-charts + TradingView | - | AI charts, TASI index, individual stocks |
| **News Scraping** | requests + BeautifulSoup4 + lxml | - | 5 Arabic news sources, 30min scheduler |

---

## Key Design Decisions

1. **Dual database backend**: SQLite for zero-config development; PostgreSQL for production. Controlled by `DB_BACKEND` env var with shared service interfaces.

2. **Redis is optional**: All Redis-dependent features (caching, distributed rate limiting, cost tracking) fall back to in-memory implementations. Development works without Redis.

3. **Defense-in-depth SQL security**: Three-stage validation pipeline (sanitizer + validator + allowlist) prevents SQL injection even when the LLM generates malicious output.

4. **Fire-and-forget audit logging**: Audit persistence failures are logged but never block requests. The audit trail is a reliability asset, not a liability.

5. **Circuit breaker registry**: All circuit breakers register globally, enabling health endpoints to report their states for monitoring dashboards.

6. **Correlation ID everywhere**: A single `X-Request-ID` flows through middleware, logs, audit tables, and error responses, enabling end-to-end request tracing.

7. **Tiered caching**: Query results are automatically classified into market (60s), historical (1h), or schema (24h) tiers based on SQL content heuristics.

8. **Cost controls**: Per-user daily/monthly token budgets prevent runaway LLM costs with Redis-backed tracking.
