# Middleware & Cross-cutting Concerns Audit

**Date:** 2026-02-17
**Auditor:** middleware-auditor agent
**Scope:** Middleware stack, CORS, rate limiting, request logging, error handling, GZip, authentication, lifecycle management

---

## 1. Middleware Stack Order

### Registration Order in `app.py` (lines 243-314)

FastAPI/Starlette middleware uses an onion model -- middleware added **later** wraps middleware added **earlier**. The `add_middleware` calls in `app.py` are:

| Order | Middleware | Line | Layer |
|-------|-----------|------|-------|
| 1 | `setup_cors()` (CORSMiddleware) | 285 | Innermost |
| 2 | `GZipMiddleware` | 288 | |
| 3 | `RateLimitMiddleware` | 292 | (skipped in debug mode) |
| 4 | `RequestLoggingMiddleware` | 304 | |
| 5 | `ErrorHandlerMiddleware` | 310 | Outermost |
| 6 | `_require_chat_auth` (http middleware) | 327 | Above ErrorHandler (PG only) |

**Request flow (outermost first):**

```
Client Request
  -> _require_chat_auth (PG mode only, line 327)
  -> ErrorHandlerMiddleware (catches all exceptions)
  -> RequestLoggingMiddleware (logs timing + request_id)
  -> RateLimitMiddleware (429 if exceeded)
  -> GZipMiddleware (compresses responses)
  -> CORSMiddleware (handles preflight + headers)
  -> Route Handler
```

### Assessment: MOSTLY CORRECT, with issues

**[PASS]** ErrorHandlerMiddleware is outermost -- catches exceptions from all inner layers.

**[PASS]** RequestLoggingMiddleware is outside rate limiter -- logs even rate-limited requests so you see 429s.

**[PASS]** GZip is inside rate limiter -- avoids wasting CPU compressing 429 responses.

**[PASS]** CORS is innermost -- ensures CORS headers are added to all responses including error responses.

**[ISSUE-MW-01] (MEDIUM) PG auth middleware registered AFTER the middleware stack.** The `_require_chat_auth` middleware (line 327) is registered via `@app.middleware("http")` which in FastAPI adds it as the **outermost** layer, wrapping even the ErrorHandlerMiddleware. This means:
- If `decode_token()` raises an unexpected exception (not caught by the bare `except Exception`), it would bypass the error handler.
- The auth middleware returns a plain JSONResponse on 401 that does **not** use the standard `{"error": {...}}` shape with `request_id`. It uses `{"detail": "..."}` instead (line 339).
- Request logging will **not** capture requests rejected by this middleware since the logging middleware is inner to it.

**Recommendation:** Move the chat auth logic into a proper `BaseHTTPMiddleware` subclass registered before the ErrorHandlerMiddleware, or better yet, convert it to a FastAPI dependency on the specific routes.

**[ISSUE-MW-02] (LOW) Vanna's default CORSMiddleware removal is fragile.** Lines 236-240 filter `app.user_middleware` to remove Vanna's default `CORSMiddleware(allow_origins=["*"])`. This relies on Vanna's internal implementation detail. If Vanna changes how it adds CORS, the wildcard CORS could leak through.

**Recommendation:** Add an assertion or log warning if the removal didn't find any middleware to remove.

---

## 2. CORS Configuration

**File:** `middleware/cors.py` (41 lines)

### Configuration

```python
allow_origins=allowed_origins,        # From settings/env
allow_credentials=True,
allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With", "X-User-Id"],
```

### Origins (from `config/settings.py` line 153)

Default origins:
- `http://localhost:3000` (frontend dev)
- `http://localhost:8084` (backend)
- `https://frontend-two-nu-83.vercel.app` (production frontend)
- `https://raid-ai-app-production.up.railway.app` (production backend)

Dynamic additions in `app.py` (lines 260-274):
- `FRONTEND_URL` env var
- `RAILWAY_PUBLIC_DOMAIN` env var (auto-prefixed with `https://`)

### Assessment

**[PASS]** No wildcard `"*"` in production origins. Specific origin list is correct.

**[PASS]** The env validator (`config/env_validator.py` line 97) warns if `MW_CORS_ORIGINS` contains `"*"` in production.

**[PASS]** Methods are explicitly listed (no wildcard `["*"]`).

**[PASS]** Headers are explicitly listed and limited to what's needed.

**[ISSUE-MW-03] (MEDIUM) `allow_credentials=True` with dynamic origins requires care.** When `allow_credentials=True`, browsers enforce that `Access-Control-Allow-Origin` cannot be `"*"`. FastAPI handles this correctly by echoing back the specific origin. However, the dynamic origin additions (`FRONTEND_URL`, `RAILWAY_PUBLIC_DOMAIN`) are not validated for format. A malicious `FRONTEND_URL=https://evil.com` would be accepted.

**Recommendation:** Validate that dynamically added origins match expected domain patterns (e.g., `*.vercel.app`, `*.railway.app`, or `localhost`). This is an env-var-level attack surface, so the risk is low if the deployment environment is trusted.

**[ISSUE-MW-04] (LOW) `expose_headers` not configured.** The `X-Request-ID` header is set on responses by the logging middleware (line 67), but it's not in `expose_headers`. This means JavaScript in the browser cannot read `X-Request-ID` from `fetch()` responses via CORS.

**Recommendation:** Add `expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]` to the CORS configuration.

**[PASS]** `max_age` is not set, defaulting to 600 seconds (10 minutes). Acceptable for development/early production.

---

## 3. Rate Limiting

**File:** `middleware/rate_limit.py` (139 lines)

### Configuration (from `app.py` lines 291-301)

| Path prefix | Limit | Notes |
|-------------|-------|-------|
| `/api/auth/login` | 10 rpm | Brute-force protection |
| `/api/auth/register` | 10 rpm | Registration spam protection |
| `/api/v1/charts` | 120 rpm | Higher for chart data |
| Default (all others) | 60 rpm | General rate limit |

**Skipped paths:** `/health`

**Disabled entirely in debug mode** (`SERVER_DEBUG=true`, line 291).

### Implementation

- **Per-IP**: Uses `request.client.host` (line 83). No user-level rate limiting.
- **Sliding window**: Uses `collections.deque` of `time.monotonic()` timestamps.
- **Longest prefix match**: Path limits are sorted by prefix length descending (line 60).
- **Periodic cleanup**: Every 500 requests, stale entries are removed (line 88).

### Assessment

**[PASS]** Tiers are appropriate: auth endpoints have strict limits (10 rpm), charts have higher limits (120 rpm), general endpoints at 60 rpm.

**[PASS]** Returns standard `429` with `Retry-After` header and consistent JSON error shape.

**[PASS]** Sliding window algorithm is correct and efficient with `deque`.

**[ISSUE-MW-05] (MEDIUM) Rate limiting is per-IP only, not per-user.** Authenticated users hitting the API from different IPs could circumvent the rate limit. The `backend/middleware/rate_limit_middleware.py` (a different, more advanced version) extracts JWT `user_id` for per-user rate limiting, but the active middleware in `middleware/rate_limit.py` does not.

**Recommendation:** Consider extracting the user identifier from the JWT `Authorization` header (when present) and using `user:{user_id}` as the rate limit key, falling back to IP. The `backend/middleware/rate_limit_middleware.py` already implements this pattern.

**[ISSUE-MW-06] (MEDIUM) In-memory rate limiter doesn't survive restarts and doesn't work across multiple instances.** The `defaultdict(deque)` storage is process-local. In a multi-instance Railway deployment, each instance tracks limits independently, effectively multiplying the allowed rate by the number of instances.

**Recommendation:** For single-instance deployments this is acceptable. For multi-instance, integrate Redis-backed rate limiting (the `backend/middleware/rate_limiter.py` already provides a `RedisRateLimiter` implementation).

**[ISSUE-MW-07] (LOW) `/health/live` and `/health/ready` are not in skip_paths.** Only `/health` is skipped (line 296). The liveness and readiness probes (`/health/live`, `/health/ready`) hit the rate limiter. Under heavy health-check polling (e.g., from a load balancer), this could consume rate limit budget.

**Recommendation:** Add `/health/live` and `/health/ready` to `skip_paths`.

**[ISSUE-MW-08] (LOW) No rate limit response headers on allowed requests.** The active rate limiter does not set `X-RateLimit-*` headers on successful responses. Clients have no visibility into their remaining budget. The `backend/middleware/rate_limit_middleware.py` does set these headers (lines 164-166).

**Recommendation:** Add `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers to successful responses.

**[PASS]** Cannot be trivially bypassed -- IP is read from `request.client.host` which is set by uvicorn from the socket. However, behind a reverse proxy (Railway), the real IP may be in `X-Forwarded-For`. This is handled by uvicorn's `--proxy-headers` flag, not the middleware.

---

## 4. Request Logging

**File:** `middleware/request_logging.py` (92 lines)

### What is logged

```json
{
  "method": "GET",
  "path": "/api/v1/stocks/2222",
  "status_code": 200,
  "response_time_ms": 12.3,
  "client_ip": "192.168.1.xxx",
  "request_id": "a1b2c3d4e5f6g7h8"
}
```

### Assessment

**[PASS]** IP anonymization is correct. IPv4 last octet replaced with `xxx`. IPv6 last segment replaced with `xxxx`.

**[PASS]** No sensitive data logged. No query parameters, headers, request body, or response body.

**[PASS]** JSON structure is consistent -- always the same 6 fields.

**[PASS]** Log level varies by status code: INFO (2xx/3xx), WARNING (4xx), ERROR (5xx).

**[PASS]** Skips noise paths: `/health`, `/favicon.ico`, `/docs`, `/redoc`, `/openapi.json`.

**[ISSUE-MW-09] (MEDIUM) X-Request-ID is set but not generated by this middleware.** The `request_id` is read from `request.state.request_id` (line 63) with a default of `"unknown"`. The actual generation happens in `ErrorHandlerMiddleware._get_request_id()` (line 107-108), which is the outermost middleware. This creates a dependency: if `RequestLoggingMiddleware` runs without `ErrorHandlerMiddleware`, all logs will show `request_id="unknown"`.

**Recommendation:** Either generate the request_id in the logging middleware if not already present, or document this dependency explicitly.

**[ISSUE-MW-10] (LOW) Query string is not logged.** While this is good for security (avoids leaking tokens in query params), it can make debugging harder. Consider logging the path without query parameters but adding a boolean `has_query_params` field.

**[PASS]** Uses a separate logger name (`tasi.access`) which allows configuring access log level independently from application logs.

---

## 5. Error Handler

**File:** `middleware/error_handler.py` (187 lines)

### Exception mapping

| Exception type | HTTP Status | Error Code |
|---------------|-------------|------------|
| `ValueError` | 400 | BAD_REQUEST |
| `PermissionError` | 403 | FORBIDDEN |
| `FileNotFoundError` | 404 | NOT_FOUND |
| `KeyError` | 404 | NOT_FOUND |
| `ConnectionError` | 503 | SERVICE_UNAVAILABLE |
| All others | 500 | INTERNAL_ERROR |

### Response shape

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "request_id": "a1b2c3d4e5f6g7h8"
  }
}
```

### Assessment

**[PASS]** Catches ALL unhandled exceptions. The `except Exception` block (line 112) is comprehensive.

**[PASS]** Consistent JSON response shape across all error types, including HTTPException and RequestValidationError (via `install_exception_handlers`).

**[PASS]** Request ID is always included in error responses for correlation.

**[PASS]** Logs with context: exception type, HTTP method, path, and request_id.

**[PASS]** Stack traces are logged server-side via `logger.exception()` (line 127) but never exposed to clients.

**[PASS]** Debug mode toggle: in production, generic "Internal server error" message; in debug, actual exception message.

**[ISSUE-MW-11] (LOW) `KeyError` mapped to 404 may be surprising.** A `KeyError` from a dictionary lookup bug in application code would return 404 instead of 500. This could mask real bugs as "not found" responses.

**Recommendation:** Consider removing `KeyError` from the exception map, or narrowing it to a custom `ResourceNotFoundError`.

**[ISSUE-MW-12] (LOW) Validation error handler truncates to 5 errors.** Line 171 limits to first 5 validation errors. While reasonable, the client has no indication that more errors were truncated.

**Recommendation:** Add a `"truncated": true` field or a count when errors exceed 5.

**[PASS]** `_get_request_id()` correctly checks `request.state`, then incoming `x-request-id` header, then generates a new UUID. This provides full request tracing.

---

## 6. GZip Middleware

**Configuration:** `app.add_middleware(GZipMiddleware, minimum_size=1000)` (line 288)

### Assessment

**[PASS]** 1000 byte minimum is appropriate. Below 1KB, compression overhead exceeds the size savings, and many API responses (health checks, simple JSON) are under 1KB.

**[PASS]** GZip is inside the rate limiter -- rate-limited requests don't waste CPU on compression.

**[PASS]** Uses FastAPI's built-in `GZipMiddleware` from Starlette, which is well-tested.

**[ISSUE-MW-13] (LOW) SSE streams may not benefit from GZip.** Server-Sent Events (`text/event-stream`) are streaming responses. GZip middleware may buffer SSE chunks, adding latency. Starlette's `GZipMiddleware` does handle streaming responses, but the compression ratio on small SSE events is poor.

**Recommendation:** This is a minor concern. If SSE latency is observed, consider excluding SSE paths from compression.

---

## 7. Authentication Architecture

### Overview

Authentication is **not** a global middleware. It's implemented at two levels:

**A. Route-level (FastAPI Dependencies):**
- `Depends(get_current_user)` on write endpoints (POST/PUT/DELETE) for reports, news, announcements, watchlists.
- Read endpoints (GET) are publicly accessible (no auth required).
- `auth/dependencies.py` provides the `get_current_user` dependency.

**B. Chat endpoint middleware (PG mode only, `app.py` lines 324-343):**
- Only applies to `/api/vanna/v2/chat_sse` and `/api/vanna/v2/chat_poll`.
- Optional auth: no token = anonymous access; invalid token = 401.
- Implemented as an `@app.middleware("http")` function.

**C. Vanna Agent resolver (`JWTUserResolver`, `app.py` lines 116-150):**
- Resolves user identity for the Vanna agent.
- Optional auth: no token = anonymous user with `["user"]` group; invalid token = `ValueError`.

### Assessment

**[PASS]** Write operations require authentication.

**[PASS]** Read operations are public -- appropriate for a market data platform.

**[ISSUE-MW-14] (MEDIUM) Inconsistent auth error shapes.** Three different auth rejection formats exist:
1. `_require_chat_auth` returns `{"detail": "Invalid or expired authentication token"}` (line 339)
2. `JWTUserResolver` raises `ValueError("Invalid or expired authentication token")` which the error handler maps to 400 (not 401)
3. `get_current_user` dependency (in `auth/dependencies.py`) presumably raises `HTTPException(401)` with `{"detail": "..."}`

**Recommendation:** Standardize all auth failures to return 401 with the `{"error": {..., "code": "UNAUTHORIZED"}}` shape.

**[ISSUE-MW-15] (LOW) No CSRF protection.** The platform uses JWT bearer tokens (not cookies), so CSRF is not a primary concern. However, the `allow_credentials=True` CORS setting combined with any cookie-based session data could be vulnerable.

**Recommendation:** Since auth uses bearer tokens, CSRF risk is minimal. No action needed unless cookie-based auth is added.

---

## 8. Lifecycle Management

**File:** `config/lifecycle.py` (75 lines)
**Lifespan handler:** `app.py` lines 576-769

### Startup sequence

| Step | Component | Line | Error handling |
|------|-----------|------|----------------|
| 1 | `setup_logging()` | 581 | `ImportError` caught |
| 2 | `init_error_tracking()` | 589 | `ImportError` caught |
| 3 | `on_startup()` diagnostics | 597 | `ImportError` caught |
| 4 | PostgreSQL pool init | 604-619 | `ImportError` + `Exception` caught |
| 5 | Redis init | 624-639 | `ImportError` + `Exception` caught |
| 6 | Diagnostics logging | 644-646 | Always runs |
| 7 | JWT secret enforcement | 648-659 | `RuntimeError` on missing secret in prod PG mode |
| 8 | News scheduler start | 667-679 | `ImportError` + `Exception` caught |
| 9 | Quotes hub start | 682-697 | `ImportError` + `Exception` caught |
| 10 | yfinance reachability check | 700-717 | Runs in daemon thread, non-blocking |

### Shutdown sequence

| Step | Component | Line | Error handling |
|------|-----------|------|----------------|
| 1 | Cancel quotes hub task | 722-728 | `CancelledError` caught |
| 2 | Stop news scheduler | 731-736 | `Exception` caught |
| 3 | Close PostgreSQL pool | 739-748 | `ImportError` + `Exception` caught |
| 4 | Close Redis | 750-757 | `ImportError` + `Exception` caught |
| 5 | `on_shutdown()` | 760-765 | `ImportError` caught |

### Assessment

**[PASS]** Startup is resilient -- every step has try/except, so a failed optional component doesn't block the server.

**[PASS]** Shutdown cleans up resources in correct order: background tasks first, then connection pools, then logging.

**[PASS]** JWT secret enforcement correctly raises `RuntimeError` only in production PG mode (non-debug).

**[PASS]** `on_shutdown()` flushes all log handlers -- no log messages are lost.

**[PASS]** yfinance check runs in a daemon thread -- doesn't block startup.

**[ISSUE-MW-16] (MEDIUM) No shutdown timeout.** If the quotes hub task or news scheduler hangs during cancellation, shutdown will block indefinitely. The `await _quotes_hub_task` (line 725) has no timeout.

**Recommendation:** Add `asyncio.wait_for(_quotes_hub_task, timeout=5.0)` to enforce a 5-second shutdown deadline for background tasks.

**[ISSUE-MW-17] (LOW) `on_startup()` version is hardcoded.** `config/lifecycle.py` line 23 has `_APP_VERSION = "1.0.0"` while `app.py` line 204 has `app.version = "2.0.0"`. These should be unified.

**Recommendation:** Define version in one place (e.g., `config/__init__.py`) and import it everywhere.

---

## 9. Duplicate Middleware Code

**[ISSUE-MW-18] (INFO) Two rate limiter implementations exist.**
1. `middleware/rate_limit.py` -- Active, in-memory, per-IP only (139 lines)
2. `backend/middleware/rate_limit_middleware.py` -- Unused in `app.py`, supports Redis + per-user rate limiting (168 lines)

The `backend/` version is more feature-complete:
- Extracts JWT `user_id` for per-user rate limiting
- Sets `X-RateLimit-*` headers on all responses
- Supports configurable time windows per path
- Integrates with a `RateLimiter` abstraction (supports Redis)

**Recommendation:** Migrate to the `backend/middleware/rate_limit_middleware.py` implementation when Redis is available. Alternatively, backport the per-user extraction and rate limit headers to the active middleware.

---

## 10. Summary of Findings

### By Severity

| ID | Severity | Component | Description |
|----|----------|-----------|-------------|
| MW-01 | MEDIUM | Auth middleware | PG auth middleware outside error handler, inconsistent error shape |
| MW-03 | MEDIUM | CORS | Dynamic origins not validated |
| MW-05 | MEDIUM | Rate Limit | Per-IP only, no per-user rate limiting |
| MW-06 | MEDIUM | Rate Limit | In-memory storage, doesn't work across instances |
| MW-09 | MEDIUM | Logging | request_id generation depends on error handler |
| MW-14 | MEDIUM | Auth | Inconsistent auth error response shapes |
| MW-16 | MEDIUM | Lifecycle | No shutdown timeout for background tasks |
| MW-02 | LOW | CORS | Vanna CORSMiddleware removal is fragile |
| MW-04 | LOW | CORS | expose_headers not configured |
| MW-07 | LOW | Rate Limit | Health sub-paths not in skip_paths |
| MW-08 | LOW | Rate Limit | No rate limit headers on successful responses |
| MW-10 | LOW | Logging | Query string not logged |
| MW-11 | LOW | Error Handler | KeyError mapped to 404 |
| MW-12 | LOW | Error Handler | Validation error truncation not indicated |
| MW-13 | LOW | GZip | SSE streams may not benefit |
| MW-15 | LOW | Auth | No CSRF protection (acceptable with bearer tokens) |
| MW-17 | LOW | Lifecycle | Version mismatch between lifecycle and app |
| MW-18 | INFO | Rate Limit | Duplicate rate limiter implementations |

### Statistics

- **Total findings:** 18
- **MEDIUM:** 7
- **LOW:** 10
- **INFO:** 1
- **Components passing cleanly:** GZip configuration, IP anonymization, structured logging format, error response consistency, shutdown resource ordering, startup resilience

### Priority Recommendations

1. **Fix MW-01:** Move PG chat auth to a route dependency or register it within the middleware stack, and use the standard error shape.
2. **Fix MW-14:** Standardize all auth rejection to 401 + `{"error": {...}}` shape.
3. **Fix MW-04:** Add `expose_headers` for `X-Request-ID` so frontend can access correlation IDs.
4. **Fix MW-16:** Add `asyncio.wait_for()` with timeout to shutdown sequence.
5. **Fix MW-07:** Add `/health/live` and `/health/ready` to rate limiter skip paths.
6. **Consider MW-05/MW-06:** Plan migration path to Redis-backed per-user rate limiting before scaling to multiple instances.
