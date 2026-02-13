# SECURITY.md

> Security documentation for the Ra'd AI TASI Platform.
> Last updated: 2026-02-13

---

## Table of Contents

1. [Vulnerability Reporting](#vulnerability-reporting)
2. [Security Architecture Overview](#security-architecture-overview)
3. [Authentication Flow](#authentication-flow)
4. [Rate Limiting](#rate-limiting)
5. [SQL Validation Pipeline](#sql-validation-pipeline)
6. [Data Handling](#data-handling)
7. [Environment Variable Requirements](#environment-variable-requirements)
8. [Security Event Types](#security-event-types)

---

## Vulnerability Reporting

If you discover a security vulnerability in this project:

1. **Do NOT** open a public issue.
2. Email the maintainers with the subject line: `[SECURITY] Ra'd AI Vulnerability Report`.
3. Include: description of the vulnerability, steps to reproduce, affected components, and potential impact.
4. You will receive an acknowledgment within 48 hours.
5. Fixes are prioritized based on severity: CRITICAL (24h), HIGH (72h), MEDIUM (1 week), LOW (next release).

---

## Security Architecture Overview

The platform implements a defense-in-depth strategy with multiple security layers:

```
Request Flow:

  Client -> CORS -> Correlation ID -> Error Handler -> Rate Limiter -> Auth -> Route Handler
             |            |               |                |            |           |
             |            |               |                |            |           v
             |            |               |                |            |    SQL Validator
             |            |               |                |            |    + Allowlist
             |            |               |                |            |    + Sanitizer
             |            |               |                |            |           |
             v            v               v                v            v           v
         Blocked      X-Request-ID    Safe JSON       429 + Retry   401/403    Audit Log
         Origins      on all resp.    error shape     After header   JWT err   + Sec Events
```

### Security Layers (in middleware order)

| Layer | Module | Purpose |
|---|---|---|
| **CORS** | `middleware/cors.py` | Restricts cross-origin requests to allowed domains |
| **Correlation ID** | `backend/services/audit/correlation.py` | Assigns `X-Request-ID` for tracing; enables forensic correlation |
| **Error Handler** | `middleware/error_handler.py` | Catches exceptions; returns safe JSON (no stack traces in production) |
| **Rate Limiter** | `middleware/rate_limit.py` + `backend/middleware/rate_limiter.py` | Per-IP sliding window; Redis-backed with in-memory fallback |
| **Authentication** | `auth/jwt_handler.py` + `auth/dependencies.py` | JWT (HS256) access/refresh tokens; bcrypt password hashing |
| **SQL Validation** | `backend/security/sql_validator.py` | Parses AI-generated SQL; blocks write ops, injection, schema probing |
| **Table Allowlist** | `backend/security/allowlist.py` | Restricts queries to explicitly allowed tables |
| **Input Sanitizer** | `backend/security/sanitizer.py` | Cleans NL input; blocks raw SQL injection; HTML-escapes output |
| **Audit Logging** | `backend/services/audit/` | Records all queries and security events for forensic analysis |
| **Circuit Breaker** | `backend/services/resilience/circuit_breaker.py` | Prevents cascading failures from external service outages |
| **Cost Controller** | `backend/middleware/cost_controller.py` | Per-user daily/monthly token and cost limits |

---

## Authentication Flow

### Token Types

| Token | Algorithm | Lifetime | Purpose |
|---|---|---|---|
| Access Token | HS256 | 30 min (configurable) | API authorization; carries user claims |
| Refresh Token | HS256 | 7 days (configurable) | Obtain new access tokens without re-authentication |

### Flow

```
1. POST /api/auth/register  -> Create account (bcrypt-hashed password stored)
2. POST /api/auth/login     -> Verify credentials -> Return {access_token, refresh_token}
3. GET /api/v1/*            -> Authorization: Bearer <access_token>
4. POST /api/auth/refresh   -> Send refresh_token -> Return new {access_token}
```

### Token Validation

- Tokens are signed with `AUTH_JWT_SECRET` using HS256.
- **CRITICAL:** In production (`ENVIRONMENT=production`), `AUTH_JWT_SECRET` MUST be set to a stable, cryptographically random value. In development, a random secret is generated on each startup (sessions are lost on restart).
- Token `type` claim is checked: access tokens cannot be used as refresh tokens and vice versa.
- Expired tokens return `401 UNAUTHORIZED` with `error.code = "UNAUTHORIZED"`.

### Password Security

- Passwords are hashed with **bcrypt** via the `auth/password.py` module.
- No plaintext passwords are ever stored or logged.
- Password hashing cost factor uses bcrypt defaults (12 rounds).

---

## Rate Limiting

### Architecture

Two complementary rate limiting layers:

1. **Existing middleware** (`middleware/rate_limit.py`): In-memory sliding window, per-IP, with path-based tiers. Active now.
2. **New rate limiter** (`backend/middleware/rate_limiter.py`): Redis-backed (db=1) sliding window with in-memory fallback. Supports per-bucket tracking.

### Endpoint Rules

| Path Prefix | Limit | Window | Rationale |
|---|---|---|---|
| `/api/v1/query` | 50 req | 1 hour | LLM-backed queries are expensive ($3-15/M tokens) |
| `/api/auth` | 20 req | 1 minute | Brute-force protection for login/register |
| `/api/v1/export` | 10 req | 1 hour | Heavy data export operations |
| `/api/v1` | 1000 req | 1 hour | General API traffic |
| *(default)* | 60 req | 1 minute | Catch-all for all other endpoints |

### Skipped Paths

Health and documentation endpoints are excluded from rate limiting:
- `/health`, `/health/live`, `/health/ready`
- `/docs`, `/openapi.json`

### Response Headers

When rate-limited (HTTP 429):
- `Retry-After: <seconds>` -- time until the client can retry.
- Body: `{"error": {"code": "RATE_LIMITED", "message": "Too many requests", "request_id": "..."}}`

### Cost Controls

The `CostController` tracks per-user LLM token consumption:
- Daily and monthly token buckets stored in Redis (db=1) or in-memory.
- Configurable limits: `daily_cost_limit_usd`, `monthly_cost_limit_usd`, `daily_token_limit`.
- Cost estimation based on Anthropic Claude pricing (~$3/M input, ~$15/M output tokens).
- Exceeding limits returns a denial with a descriptive reason.

---

## SQL Validation Pipeline

AI-generated SQL queries pass through a three-stage validation pipeline before execution:

```
LLM Output -> SqlQueryValidator -> QueryAllowlist -> Sanitizer -> Execute
                    |                    |               |
                    v                    v               v
              Reject if:           Reject if:      Clean input:
              - Write ops          - Table not      - Strip control chars
              - Stacked queries      in allowlist   - Unicode NFC normalize
              - Injection patterns - Blocked table  - HTML escape
              - Schema probing     - Op not allowed - Truncate to 2000 chars
              - Comment injection                   - Reject raw SQL input
```

### Stage 1: SqlQueryValidator (`backend/security/sql_validator.py`)

Uses `sqlparse` to parse and analyze SQL:

| Check | Risk Weight | Description |
|---|---|---|
| Forbidden operations | 1.0 | INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, EXEC, PRAGMA, VACUUM, etc. |
| Stacked queries | 0.9 | Multiple statements separated by semicolons |
| Schema probing | 0.9 | Access to `sqlite_master`, `information_schema`, `pg_catalog`, `pg_tables` |
| Injection patterns | 0.8 | UNION+SELECT on schema tables, comment-embedded DML, hex payloads, CHAR() obfuscation, CONCAT(), time-based (SLEEP/PG_SLEEP), file access (LOAD_FILE/OUTFILE) |
| UNION SELECT | 0.5 | UNION-based data exfiltration attempts |
| Comment injection | 0.2 | Dangerous keywords hidden inside SQL comments |
| Subquery | 0.1 | Nested subqueries (informational, not blocking) |

Output: `ValidationResult` with `is_valid`, `violations[]`, `risk_score` (0.0-1.0), `sanitized_sql`, `tables_accessed[]`.

### Stage 2: QueryAllowlist (`backend/security/allowlist.py`)

- Loaded from `config/allowed_tables.json` with hot-reload support (30s TTL).
- Three lists: `allowed_tables`, `allowed_operations`, `blocked_tables`.
- A table must be in `allowed_tables` AND NOT in `blocked_tables` to pass.
- Operations default to `SELECT` only.
- Fail-safe: if the config file is missing or corrupt, nothing is allowed.

### Stage 3: Input Sanitizer (`backend/security/sanitizer.py`)

Applied to natural language input before it reaches the LLM:

- Strip C0/C1 control characters (keep `\n`, `\r`, `\t`).
- Unicode NFC normalization (prevents homoglyph attacks).
- Truncate to 2000 characters.
- HTML entity escaping.
- Reject input that begins with SQL keywords (SELECT, INSERT, etc.).

### Security Configuration (`backend/security/config.py`)

| Variable | Default | Description |
|---|---|---|
| `SECURITY_MAX_QUERY_LENGTH` | 5000 | Maximum SQL query length |
| `SECURITY_MAX_RESULT_ROWS` | 1000 | Maximum rows per query result |
| `SECURITY_ENABLE_QUERY_LOGGING` | true | Log all validated queries |
| `SECURITY_BLOCKED_SQL_PATTERNS` | *(empty)* | Additional regex patterns to block |
| `SECURITY_ALLOWED_TABLES_PATH` | `config/allowed_tables.json` | Path to allowlist config |
| `SECURITY_ENABLE_STRICT_MODE` | false | Reject queries with any risk score > 0 |

### Entry Point

All validation is routed through a single function:

```python
from backend.security.vanna_hook import validate_vanna_output

result = validate_vanna_output(generated_sql, original_query)
if not result.is_safe:
    # Block execution, log security event
```

Returns `ValidatedQuery` with `is_safe`, `sql`, `reason`, `risk_score`, `validation_time_ms`.

---

## Data Handling

### Sensitive Data

| Data Type | Storage | Protection |
|---|---|---|
| Passwords | PostgreSQL `users` table | bcrypt hash (12 rounds), never stored in plaintext |
| JWT Secret | Environment variable | `AUTH_JWT_SECRET`; random per-startup in dev, must be stable in prod |
| API Keys | Environment variables | Never logged, never returned in API responses |
| User IPs | Audit logs | Stored in `query_audit_log.ip_address` and `security_events.ip_address` |
| SQL Queries | Audit logs | Full NL query and generated SQL stored for forensic analysis |

### Error Responses

- Production: Generic error messages only. No stack traces, file paths, or internal details.
- Development (`SERVER_DEBUG=true`): Exception messages included for developer convenience.
- All errors include `request_id` for correlation but never expose internal state.

### Logging

- Production logs use JSON format (`LOG_FORMAT=json`) for aggregation.
- Every log line includes `request_id` from the correlation middleware.
- Sensitive fields (passwords, tokens) are never logged.
- IP addresses in request logs are stored for security analysis.

### Database Access

- All AI-generated queries are validated before execution (read-only enforcement).
- Direct database connections use `try/finally` for cleanup.
- PostgreSQL connection pooling with configurable `PG_POOL_MIN`/`PG_POOL_MAX`.
- Query timeouts enforced: default 30s, maximum 120s, with PostgreSQL backend cancellation.

---

## Environment Variable Requirements

### Required in Production

| Variable | Purpose | Generate with |
|---|---|---|
| `AUTH_JWT_SECRET` | JWT signing key | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `GEMINI_API_KEY` | LLM provider API key | Google AI Studio |
| `POSTGRES_PASSWORD` | Database password | Strong random password |

### Security-Related Variables

| Variable | Default | Module | Description |
|---|---|---|---|
| `ENVIRONMENT` | `development` | config | Controls security strictness |
| `AUTH_JWT_SECRET` | *(random)* | auth | JWT signing key |
| `AUTH_JWT_ALGORITHM` | `HS256` | auth | JWT algorithm |
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | auth | Access token lifetime |
| `AUTH_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | auth | Refresh token lifetime |
| `MW_CORS_ORIGINS` | `localhost:3000,localhost:8084` | middleware | Allowed CORS origins |
| `MW_RATE_LIMIT_PER_MINUTE` | `60` | middleware | Default rate limit |
| `RATELIMIT_ENABLED` | `true` | backend/middleware | Enable/disable rate limiting |
| `RATELIMIT_DEFAULT_LIMIT` | `60` | backend/middleware | Requests per window |
| `RATELIMIT_DEFAULT_WINDOW` | `60` | backend/middleware | Window size in seconds |
| `RATELIMIT_REDIS_URL` | `redis://localhost:6379/1` | backend/middleware | Redis for rate limiting |
| `SECURITY_MAX_QUERY_LENGTH` | `5000` | backend/security | Max SQL length |
| `SECURITY_MAX_RESULT_ROWS` | `1000` | backend/security | Max result rows |
| `SECURITY_ENABLE_STRICT_MODE` | `false` | backend/security | Reject all risky queries |
| `LOG_LEVEL` | `INFO` | logging | Log verbosity |
| `LOG_FORMAT` | `json` | logging | `json` or `text` |

---

## Security Event Types

The `SecurityEventLogger` records the following event types to `security_events` and structured logs:

| Event Type | Severity | Trigger |
|---|---|---|
| `sql_injection_attempt` | HIGH | SQL validator detects injection patterns |
| `forbidden_keyword` | MEDIUM | Forbidden SQL operation detected (DDL/DML) |
| `rate_limit_exceeded` | LOW | Client exceeds rate limit threshold |
| `auth_failure` | MEDIUM | Invalid credentials or expired token |
| `invalid_input` | LOW | Input sanitizer rejects malformed input |
| `suspicious_pattern` | MEDIUM | Pattern matching detects anomalous queries |
| `unauthorized_access` | HIGH | Attempt to access restricted resource without proper auth |

Events include: `id`, `timestamp`, `event_type`, `severity`, `user_id`, `ip_address`, `details`, `request_id`.

Severity-to-log-level mapping:
- LOW -> INFO
- MEDIUM -> WARNING
- HIGH -> ERROR
- CRITICAL -> CRITICAL
