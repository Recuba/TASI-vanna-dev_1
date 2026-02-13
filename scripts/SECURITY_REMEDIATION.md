# Security Remediation Plan -- Ra'd AI TASI Platform

**Date:** 2026-02-13
**Based on:** `scripts/SECURITY_AUDIT.md` (2026-02-10) + middleware/route code review
**Author:** security-harden agent

---

## Remediation Priority Table

| # | Finding | Severity | Priority | File(s) | Current State | Fix Required | Status |
|---|---------|----------|----------|---------|---------------|-------------|--------|
| SA-01 | Watchlist/Alert IDOR via X-User-Id | CRITICAL | P0 | `api/routes/watchlists.py` | **FIXED** -- All read endpoints now use `Depends(get_current_user)` instead of X-User-Id header | No further action | RESOLVED |
| SA-02 | Marked.js without DOMPurify | HIGH | P1 | `templates/index.html` | `marked.parse()` output inserted via innerHTML without sanitization | Add DOMPurify CDN + sanitize in `renderMd()` | PENDING (DO NOT MODIFY -- templates/index.html is out of scope) |
| SA-03 | TASI health leaked infra details | MEDIUM | P1 | `api/routes/tasi_index.py` | **FIXED** -- Returns only `{status, message}`, diagnostics logged server-side | No further action | RESOLVED |
| SA-04 | JWT secret defaults to random on restart | MEDIUM | P1 | `config/settings.py`, `app.py` | **FIXED** -- `AuthSettings` has `model_validator` warning; `app.py` lifespan checks `AUTH_JWT_SECRET` in PG mode | No further action | RESOLVED |
| SA-05 | CORS origins missing production domain | LOW | P2 | `config/settings.py` | **FIXED** -- Default `cors_origins` now includes `raid-ai-app-production.up.railway.app` and Vercel frontend | No further action | RESOLVED |
| SA-06 | Rate limiting disabled in debug mode | LOW | P2 | `app.py` | **FIXED** -- `app.py` lifespan logs warning when debug mode is ON | Verify Railway config does not set `SERVER_DEBUG=true` | RESOLVED (with ops verification needed) |
| SA-07 | Chart endpoints unauthenticated | INFO | -- | `api/routes/charts*.py`, `tasi_index.py` | By design: market data is public | No action | ACCEPTED |
| SA-08 | SQL injection assessment | INFO | -- | All routes | PASS: all queries use parameterized placeholders | No action | PASS |
| SA-09 | XSS assessment | INFO | -- | `templates/index.html` | PASS (except SA-02 caveat) | See SA-02 | PASS |
| SA-10 | Secrets/config assessment | INFO | -- | `.gitignore`, `.env.example` | PASS: no hardcoded secrets | No action | PASS |

---

## Current Security Posture Summary

### Middleware Stack (app.py lines 216-279)

The middleware stack is properly ordered (outermost first):
1. **ErrorHandlerMiddleware** -- catches unhandled exceptions, returns safe JSON
2. **RequestLoggingMiddleware** -- logs method/path/status/duration per request
3. **RateLimitMiddleware** -- 60 req/min per IP, sliding window (skipped in debug)
4. **CORSMiddleware** -- configured origins, credentials enabled, specific methods/headers

### Rate Limiting (`middleware/rate_limit.py`)

- **Algorithm**: Per-IP sliding window using `deque` of timestamps
- **Default limit**: 60 requests/minute (configurable via `MW_RATE_LIMIT_PER_MINUTE`)
- **Skip paths**: `/health` only
- **Coverage**: All routes except health. No differentiated limits for chart data or auth endpoints.
- **Gap**: Single rate limit tier for all endpoints. Auth endpoints (login, register) and chart data endpoints share the same 60 req/min limit. Consider adding:
  - 10 req/min for `/api/auth/login` and `/api/auth/register` (brute force protection)
  - 30 req/min for chart data endpoints (yfinance upstream protection)

### CORS (`middleware/cors.py`)

- **Origins**: Configurable via `MW_CORS_ORIGINS`. Defaults include localhost:3000, localhost:8084, Vercel frontend, and Railway production domain.
- **Dynamic origins**: `app.py` also adds `FRONTEND_URL` and `RAILWAY_PUBLIC_DOMAIN` env vars at startup.
- **Methods**: Specific list: GET, POST, PUT, PATCH, DELETE, OPTIONS (good -- not wildcard)
- **Headers**: Specific list: Authorization, Content-Type, Accept, Origin, X-Requested-With, X-User-Id (good -- not wildcard)
- **Credentials**: `allow_credentials=True` (correct for JWT auth)

### Error Handler (`middleware/error_handler.py`)

- Maps known exception types to appropriate HTTP codes (400, 403, 404)
- Unknown exceptions return 500 with generic message (no stack trace)
- Debug mode exposes error message (not traceback) for developer convenience
- Properly logs full traceback server-side

### Authentication

- **JWT-based**: `auth/jwt_handler.py` creates access/refresh tokens
- **Dependency injection**: `auth/dependencies.py` provides `get_current_user`, `get_optional_current_user`, `require_admin`
- **Watchlist endpoints**: All use `Depends(get_current_user)` (SA-01 was fixed)
- **Write endpoints**: news POST, reports POST, announcements POST all require auth
- **Read endpoints**: Market data, charts, entities, news feeds are public (by design)
- **Vanna chat**: In PG mode, invalid tokens rejected; anonymous access allowed

---

## Remaining Action Items

### P1: DOMPurify for Marked.js (SA-02)
- **Owner**: frontend-harden team
- **Note**: `templates/index.html` is marked as DO NOT MODIFY for this agent
- **Action**: Add DOMPurify script tag and wrap `marked.parse()` output in `DOMPurify.sanitize()`

### P2: Tiered Rate Limiting
- **Owner**: security-harden agent (Task 3)
- **Action**: Review and extend rate limiting to support endpoint-specific limits

### P2: Production Configuration Verification
- **Owner**: infra-deploy team
- **Action**: Verify Railway environment does NOT have `SERVER_DEBUG=true`
- **Action**: Verify `AUTH_JWT_SECRET` is set in Railway environment variables

---

## Appendix: Files Audited

- `scripts/SECURITY_AUDIT.md` -- source audit report
- `middleware/rate_limit.py` -- rate limiting implementation
- `middleware/error_handler.py` -- error handling implementation
- `middleware/cors.py` -- CORS configuration
- `middleware/request_logging.py` -- request logging
- `config/settings.py` -- all application settings with defaults
- `app.py` -- middleware registration, route registration, lifespan
- `auth/dependencies.py` -- auth dependency injection
- `auth/jwt_handler.py` -- JWT token creation/validation
- `api/routes/*.py` -- all 16 route files audited for auth and validation
