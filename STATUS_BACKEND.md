# STATUS_BACKEND.md

> Backend hardening status for the Ra'd AI TASI Platform.
> Last updated: 2026-02-13

---

## Completed (Phase 1)

### 1. SQL Query Validator (`backend/security/sql_validator.py`)
- **Owner:** sql-guard
- **Status:** Complete
- Parses AI-generated SQL with `sqlparse` to enforce read-only queries.
- Detects: forbidden operations (INSERT/UPDATE/DELETE/DROP/...), stacked queries, UNION injection, comment-embedded keywords, schema probing, time-based/file-based injection patterns.
- Returns `ValidationResult` with `is_valid`, `violations`, `risk_score` (0.0-1.0), `sanitized_sql`, and `tables_accessed`.
- Models in `backend/security/models.py`: `ValidationResult`, `ValidatedQuery`.

### 2. Rate Limiter Core (`backend/middleware/rate_limiter.py`)
- **Owner:** rate-limiter
- **Status:** Complete
- Sliding window rate limiter with Redis backend (db=1) and in-memory fallback.
- Returns `RateLimitResult` with `allowed`, `limit`, `remaining`, `reset_after`, `identifier`, `bucket`.
- Redis failure triggers automatic fallback to in-memory deque-of-timestamps.
- Model in `backend/middleware/models.py`: `RateLimitResult`.

### 3. Circuit Breaker (`backend/services/resilience/circuit_breaker.py`)
- **Owner:** reliability-eng
- **Status:** Complete
- Three-state circuit breaker: CLOSED -> OPEN -> HALF_OPEN.
- Configurable `failure_threshold`, `recovery_timeout`, `half_open_max_calls`, `success_threshold`.
- Global registry via `get_or_create(name)` for health reporting.
- `get_all_stats()` returns `CircuitStats` for every registered breaker.
- Raises `CircuitBreakerOpen` with `retry_after` when circuit is open.

### 4. Correlation ID Middleware (`backend/services/audit/correlation.py`)
- **Owner:** audit-logger
- **Status:** Complete
- ASGI middleware that assigns UUID4 `request_id` to every HTTP request.
- Reads incoming `X-Request-ID` header for distributed tracing; generates UUID4 otherwise.
- Stores in `contextvars` (accessible via `get_current_request_id()`) and `request.state.request_id`.
- Sets `X-Request-ID` on all response headers.

### 5. Structured Logger (`backend/services/audit/structured_logger.py`)
- **Owner:** audit-logger
- **Status:** Complete
- JSON formatter (`JSONFormatter`) for production log aggregators.
- Injects `request_id` from correlation contextvar into every log line.
- Merges `extra={}` fields into JSON output.
- `_PrettyFormatter` for development (human-readable). Controlled by `LOG_FORMAT` env var.
- `configure_logging(log_level, json_format)` replaces root handlers; safe to call multiple times.

### 6. Redis Client Manager (`cache/redis_client.py`)
- **Owner:** cache-perf
- **Status:** Complete
- Module-level singleton with `init_redis(url)` / `close_redis()` / `is_redis_available()`.
- Fail-safe cache operations: `cache_get`, `cache_set`, `cache_delete`, `cache_invalidate_pattern`.
- Uses `SCAN` for pattern invalidation to avoid blocking Redis.
- All operations return `None`/`False`/`0` on failure -- cache issues never crash the app.

### 7. Database Indexes (`infrastructure/database/indexes.sql`)
- **Owner:** db-hardener
- **Status:** Complete
- Creates `security_events` table (if not exists) for audit logging.
- Adds `request_id` column to `query_audit_log` (if not exists).
- 4 indexes on `query_audit_log`: user+ts, request_id, created_at, success+ts.
- 5 indexes on `security_events`: event_type+ts, user+ts, severity+ts, ip+ts, timestamp.
- All statements idempotent (`CREATE INDEX IF NOT EXISTS`).
- `CONCURRENTLY` variants provided as comments for zero-downtime application.

---

## In Progress (Phase 1 - nearing completion)

### 8. Query Allowlist + Vanna Integration Hook
- **Owner:** sql-guard (Task #8)
- Table allowlist enforcement and hook into Vanna agent tool pipeline.

### 9. Endpoint Rate Limits + Cost Control
- **Owner:** rate-limiter (Task #9)
- Path-based tiered limits and LLM cost controls.

### 10. Retry Logic + Query Timeout Manager
- **Owner:** reliability-eng (Task #10)
- Exponential backoff for external calls; query execution timeouts.

### 11. Query Audit Logger + Security Event Logger
- **Owner:** audit-logger (Task #11)
- Write audit events to `query_audit_log` and `security_events` tables.

### 12. Query Cache + Database Pool Tuning
- **Owner:** cache-perf (Task #12)
- Query result caching layer and PostgreSQL connection pool configuration.

### 13. Backup Scripts + WAL Archiving
- **Owner:** db-hardener (Task #13)
- PostgreSQL backup automation and WAL configuration docs.

---

## Pending (Phase 3 - Integration)

| Task | Owner | Blocked By |
|---|---|---|
| SQL Security Configuration | sql-guard | #8 |
| Rate Limiter Registration | rate-limiter | #9 |
| Degradation Handler + Resilience Config | reliability-eng | #10 |
| Audit Configuration | audit-logger | #11 |
| Response Compression + Cache Maintenance | cache-perf | #12 |
| DB Health Checks + Tuning Docs | db-hardener | #13 |

---

## New Environment Variables

These environment variables are introduced by the new backend modules. All are optional with sensible defaults.

| Variable | Default | Module | Purpose |
|---|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | cache/redis_client | Redis connection URL for cache (db=0) |
| `REDIS_PASSWORD` | *(empty)* | cache/redis_client | Redis authentication |
| `CACHE_ENABLED` | `false` | config/settings | Enable/disable Redis caching |
| `CACHE_DEFAULT_TTL` | `300` | config/settings | Default cache TTL in seconds |
| `LOG_LEVEL` | `INFO` | audit/structured_logger | Root log level |
| `LOG_FORMAT` | `json` | audit/structured_logger | `json` or `text` for log output |
| `MW_RATE_LIMIT_PER_MINUTE` | `60` | middleware/rate_limit | Default per-IP rate limit |
| `MW_CORS_ORIGINS` | `localhost:3000,localhost:8084` | middleware/cors | Allowed CORS origins |
| `MW_LOG_SKIP_PATHS` | `/health,/favicon.ico` | middleware/request_logging | Paths to skip in request logs |

> **Note:** The rate limiter uses Redis db=1 (separate from cache on db=0) when Redis is available. No additional env var is needed -- it derives the URL from `REDIS_URL` with the db number changed.

---

## New Dependencies

| Package | Version | Purpose |
|---|---|---|
| `sqlparse` | >=0.5.0 | SQL parsing for query validation |
| `redis` | >=5.0.0 | Redis client for caching + rate limiting |
| `pydantic` | >=2.0 | Already present; models for ValidationResult, RateLimitResult, CircuitStats |

> **Note:** `redis` is a soft dependency. The cache and rate limiter fall back to in-memory implementations when Redis is unavailable.

---

## Interface Contracts for Frontend / Integration

### Health Endpoints

| Endpoint | Method | Purpose | Response |
|---|---|---|---|
| `GET /health` | GET | Full health report with all component checks | `HealthResponse` (see below) |
| `GET /health/live` | GET | Liveness probe (always 200 if process running) | `{"status": "alive", "uptime_seconds": float}` |
| `GET /health/ready` | GET | Readiness probe (200 if DB reachable) | `{"status": "ready"}` or 503 `{"status": "not_ready", "reason": "..."}` |

**HealthResponse shape:**
```json
{
  "status": "healthy | degraded | unhealthy",
  "service": "raid-ai-tasi",
  "version": "1.0.0",
  "uptime_seconds": 1234.5,
  "components": [
    {
      "name": "database | llm | redis | entities | market_data | news | tasi_index | news_scraper",
      "status": "healthy | degraded | unhealthy",
      "latency_ms": 1.23,
      "message": "sqlite connected"
    }
  ]
}
```

### Rate Limit Headers

All rate-limited responses include these headers:

| Header | Value | Description |
|---|---|---|
| `Retry-After` | integer (seconds) | Seconds until the client can retry (on 429) |

**429 response body:**
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "request_id": "abc123"
  }
}
```

**Tiered path limits** (existing middleware):

| Path Prefix | Limit | Rationale |
|---|---|---|
| `/api/auth` | 10 rpm | Authentication brute-force protection |
| `/api/v1/charts` | 30 rpm | Chart generation is expensive |
| *(default)* | 60 rpm | General API traffic |

**New rate limiter** (`backend/middleware/rate_limiter.py`) adds Redis-backed sliding window with per-bucket tracking. Pending registration in Phase 3 (Task #15).

### Correlation Header

| Header | Direction | Value |
|---|---|---|
| `X-Request-ID` | Request (optional) | Client-supplied UUID for distributed tracing |
| `X-Request-ID` | Response (always) | Server-assigned or echoed UUID |

Every response includes `X-Request-ID`. If the client sends one, it is reused. Otherwise a UUID4 is generated. This ID appears in:
- All JSON log lines (`request_id` field)
- Error responses (`error.request_id` field)
- Audit log entries (`query_audit_log.request_id` column)

### Error Response Format

All error responses use a consistent shape:

```json
{
  "error": {
    "code": "BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | RATE_LIMITED | INTERNAL_ERROR | SERVICE_UNAVAILABLE",
    "message": "Human-readable description",
    "request_id": "correlation-uuid"
  }
}
```

### Audit Tables (PostgreSQL)

**`query_audit_log`** (existing, extended):

| Column | Type | New? | Description |
|---|---|---|---|
| `id` | UUID (PK) | No | Auto-generated |
| `user_id` | UUID (FK -> users) | No | Nullable |
| `natural_language_query` | TEXT | No | User's original question |
| `generated_sql` | TEXT | No | AI-generated SQL |
| `was_successful` | BOOLEAN | No | Execution success flag |
| `error_message` | TEXT | No | Error details (nullable) |
| `execution_time_ms` | NUMERIC | No | Query execution time |
| `created_at` | TIMESTAMPTZ | No | Row creation time |
| `request_id` | TEXT | **Yes** | Correlation ID from middleware |

**`security_events`** (new table):

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `event_type` | TEXT (NOT NULL) | `auth_failure`, `rate_limit`, `sql_injection`, `forbidden_table`, etc. |
| `severity` | TEXT (NOT NULL) | `low`, `medium`, `high`, `critical` |
| `user_id` | UUID (FK -> users) | Nullable |
| `ip_address` | INET | Client IP |
| `user_agent` | TEXT | Client user agent |
| `request_path` | TEXT | Request path |
| `request_method` | TEXT | HTTP method |
| `detail` | JSONB | Event-specific payload |
| `timestamp` | TIMESTAMPTZ (NOT NULL) | Event time |
| `created_at` | TIMESTAMPTZ (NOT NULL) | Row creation time |

**Indexes** (all in `infrastructure/database/indexes.sql`):

| Index | Table | Columns | Purpose |
|---|---|---|---|
| `idx_audit_log_user_ts` | query_audit_log | `(user_id, created_at DESC)` | Per-user query history |
| `idx_audit_log_request_id` | query_audit_log | `(request_id)` | Correlation lookup |
| `idx_audit_created` | query_audit_log | `(created_at)` | Time-range scans |
| `idx_audit_log_success` | query_audit_log | `(was_successful, created_at DESC)` | Failed query dashboard |
| `idx_security_event_type_ts` | security_events | `(event_type, timestamp DESC)` | Filter by event type |
| `idx_security_user_ts` | security_events | `(user_id, timestamp DESC)` | Per-user security events |
| `idx_security_severity_ts` | security_events | `(severity, timestamp DESC)` | Severity-based alerting |
| `idx_security_ip` | security_events | `(ip_address, timestamp DESC)` | IP-based investigation |
| `idx_security_timestamp` | security_events | `(timestamp)` | Retention cleanup |

---

## Database Schema Changes

1. **New column:** `query_audit_log.request_id` (TEXT) -- links audit entries to HTTP request correlation IDs.
2. **New table:** `security_events` -- stores security-relevant events (auth failures, rate limits, SQL injection attempts, schema probing).
3. **New indexes:** 9 production indexes across both tables (see Audit Tables section above).

All schema changes are idempotent and safe to re-run (`IF NOT EXISTS` / `DO $$ ... END $$`).

---

## Notes for Frontend / Integration

1. **X-Request-ID is always present.** Frontend can read `X-Request-ID` from any response header for debugging or support tickets. Optionally send it in requests for end-to-end tracing.

2. **429 includes Retry-After.** When rate-limited, the `Retry-After` header gives the number of seconds to wait. Frontend should implement backoff based on this value.

3. **Error responses are uniform.** All errors (400, 401, 403, 404, 422, 429, 500, 503) use the `{"error": {"code", "message", "request_id"}}` shape. Frontend can rely on this for consistent error handling.

4. **Health endpoints are unauthenticated.** `/health`, `/health/live`, and `/health/ready` do not require authentication and are excluded from rate limiting.

5. **Circuit breaker stats** will be exposed via health endpoints in Phase 3. The `get_all_stats()` function returns the state of all registered breakers (LLM, DB, external APIs).

6. **Redis is optional.** All Redis-dependent features (caching, distributed rate limiting) fall back gracefully to in-memory implementations. No Redis required for development.

7. **New security_events table** is PostgreSQL-only. It will not exist in the SQLite development database. Frontend code querying audit/security data should handle this gracefully.

8. **Log format** defaults to JSON for production log aggregation. Set `LOG_FORMAT=text` for human-readable development logs.
