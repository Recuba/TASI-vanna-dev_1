# Security Audit Report -- Ra'd AI TASI Platform

**Date:** 2026-02-10
**Scope:** Authentication, authorization, rate limiting, CORS, new TASI endpoints, common web vulnerabilities
**Auditor:** security-audit agent

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 1     |
| MEDIUM   | 2     |
| LOW      | 2     |
| INFO     | 4     |

---

## Findings

### SA-01: Watchlist/Alert Read Endpoints IDOR via X-User-Id Header

**Severity:** CRITICAL
**Affected files:** `api/routes/watchlists.py` (lines 32-42, 134-152)
**Status:** PENDING (requires auth model change)

**Description:**
The `GET /api/watchlists` and `GET /api/watchlists/alerts` endpoints accept a client-supplied `X-User-Id` header to scope data. Any unauthenticated caller can read any user's watchlists and alerts by setting this header to an arbitrary user ID.

**Risk:** Full unauthorized read access to all users' watchlist and alert data (Insecure Direct Object Reference).

**Recommended Fix:**
Replace `X-User-Id` header with `Depends(get_current_user)` on read endpoints, matching the write endpoints. If backward compatibility is needed, gate the `X-User-Id` path behind admin auth.

---

### SA-02: Marked.js Rendering Without HTML Sanitization

**Severity:** HIGH
**Affected files:** `templates/index.html` (lines 1109-1116, 1317, 1321)
**Status:** PENDING

**Description:**
The `renderMd()` function calls `marked.parse(text)` on AI assistant responses and inserts the result via `innerHTML`. While the text originates from the AI (not directly from user input), if the AI echoes user input in its markdown response, crafted payloads could achieve stored XSS.

Marked.js does not sanitize HTML by default since v4.0. The `sanitize` option was removed; users are expected to pair it with DOMPurify.

**Risk:** Potential stored XSS if attacker crafts a prompt that causes the AI to echo malicious HTML/JS in its response.

**Recommended Fix:**
Add DOMPurify and sanitize marked output:
```js
// In <head>:
// <script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>
function renderMd(text) {
    if (window.marked) {
        var raw = marked.parse(text);
        return window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
    }
    return esc(text).replace(/\n/g, '<br>');
}
```

---

### SA-03: TASI Health Endpoint Leaked Infrastructure Details

**Severity:** MEDIUM
**Affected files:** `api/routes/tasi_index.py` (lines 84-126)
**Status:** FIXED

**Description:**
The `GET /api/v1/charts/tasi/health` endpoint previously exposed:
- `yfinance_available` (boolean) -- reveals backend dependency
- `cache_status` (fresh/stale/empty) -- reveals caching strategy and TTL
- `cache_age_seconds` -- reveals exact cache timing
- `circuit_state`, `consecutive_failures` -- reveals circuit breaker internals

**Risk:** Information disclosure enabling targeted attacks (cache timing attacks, dependency fingerprinting).

**Fix applied:**
Response now returns only `{ "status": "ok"|"degraded", "message": "..." }`. Full diagnostics are logged server-side at DEBUG level. Tests updated to verify no internal fields are exposed.

---

### SA-04: JWT Secret Defaults to Random on Each Restart

**Severity:** MEDIUM
**Affected files:** `config/settings.py` (line 105)
**Status:** PENDING (by design for dev, needs production enforcement)

**Description:**
`AuthSettings.jwt_secret` defaults to `secrets.token_urlsafe(32)`, generating a new random secret on every server startup. All issued JWT tokens become invalid after restart. In production on Railway, if `AUTH_JWT_SECRET` is not set, users will be silently logged out on every deploy.

**Risk:** User session instability in production; may go unnoticed since the error manifests as "expired token" rather than a clear misconfiguration error.

**Recommended Fix:**
Add a startup check in `app.py` that warns or fails if `AUTH_JWT_SECRET` is not explicitly set when `DB_BACKEND=postgres` (production mode):
```python
if DB_BACKEND == "postgres" and _settings and _settings.auth.jwt_secret == "change-me-to-a-stable-secret":
    logger.warning("AUTH_JWT_SECRET not configured -- tokens will not persist across restarts")
```

---

### SA-05: CORS Origins Missing Production Domain

**Severity:** LOW
**Affected files:** `config/settings.py` (line 116), `app.py` (lines 408-412)
**Status:** PENDING (deployment config, not code fix)

**Description:**
Default CORS origins are `http://localhost:3000` and `http://localhost:8084`. The production domain (`raid-ai-app-production.up.railway.app`) is not in the defaults. The legacy UI works because it is served from the same origin (no CORS needed), but the Next.js frontend in production would be blocked.

**Risk:** Next.js frontend in production cannot call the API (CORS preflight failures).

**Recommended Fix:**
Set `MW_CORS_ORIGINS` in Railway environment variables to include the production domain:
```
MW_CORS_ORIGINS=http://localhost:3000,http://localhost:8084,https://raid-ai-app-production.up.railway.app
```

---

### SA-06: Rate Limiting Disabled in Debug Mode

**Severity:** LOW
**Affected files:** `app.py` (lines 428-434)
**Status:** PENDING (acceptable for dev, verify production config)

**Description:**
Rate limiting middleware is skipped when `SERVER_DEBUG=true`. If debug mode is accidentally enabled in production, the rate limiter is bypassed entirely.

**Risk:** If `SERVER_DEBUG=true` leaks into production config, no rate limiting protection.

**Recommended Fix:**
Verify Railway deployment does NOT set `SERVER_DEBUG=true`. Consider logging a warning when debug mode is active.

---

### SA-07: All Chart Endpoints Are Unauthenticated

**Severity:** INFO
**Affected files:** `api/routes/charts.py`, `api/routes/tasi_index.py`
**Status:** ACCEPTED (by design)

**Description:**
All chart endpoints (`/api/charts/*` and `/api/v1/charts/tasi/*`) are public, requiring no authentication. This is consistent across both existing chart endpoints and the new TASI endpoints.

**Assessment:** Market data charts are public by nature. Consistent behavior across all chart routes. No action needed.

---

### SA-08: SQL Injection Assessment -- PASS

**Severity:** INFO
**Affected files:** All `api/routes/*.py`, `services/*.py`
**Status:** PASS

**Description:**
All API routes use parameterized queries (`%(param)s` with psycopg2). No user-supplied input is interpolated into SQL via f-strings or `.format()`. The f-strings used in `entities.py`, `charts.py`, and service files construct only WHERE clause scaffolding from hardcoded strings; actual values are always parameterized.

Migration and CSV scripts (`database/migrate_sqlite_to_pg.py`, `csv_to_sqlite.py`) use f-strings for table names, but these are hardcoded constants (not user input) and are offline tools.

---

### SA-09: XSS Assessment -- Mostly Safe

**Severity:** INFO
**Affected files:** `templates/index.html`
**Status:** PASS (with SA-02 caveat)

**Description:**
- User messages: escaped via `esc()` function before innerHTML insertion (safe)
- Error messages: escaped via `esc()` (safe)
- Notification messages: escaped via `esc()` (safe)
- DataFrame rendering: cell values escaped via `esc()` (safe)
- Artifact rendering: uses `iframe` with `sandbox="allow-scripts"` (acceptable for AI-generated content)
- Markdown rendering: see SA-02 (marked.js without DOMPurify)

---

### SA-10: Secrets and Configuration Assessment -- PASS

**Severity:** INFO
**Affected files:** `.gitignore`, `.env.example`
**Status:** PASS

**Description:**
- `.env` is in `.gitignore` (confirmed)
- `.env.example` contains only placeholder values (no real secrets)
- No hardcoded API keys in source code (API key loaded from environment)
- No SSRF risk: yfinance only fetches from Yahoo Finance APIs with hardcoded symbols
- No path traversal: no endpoints accept user-supplied file paths
- Error handler middleware catches unhandled exceptions and returns generic 500 (no stack trace leakage)

---

## Rate Limiting Assessment

The rate limiting middleware (`middleware/rate_limit.py`) provides:
- Per-IP sliding window (60 req/min default)
- Applies to all routes except `/health`
- `Retry-After` header on 429 responses
- Periodic cleanup of stale IP entries

The TASI endpoint has an additional protection via `threading.Lock` in `services/tasi_index.py` (line 137) that serializes yfinance API calls, preventing thundering herd on cold cache.

**Verdict:** Rate limiting is properly applied to TASI endpoints. No changes needed.

---

## CORS Assessment

CORS middleware (`middleware/cors.py`) via FastAPI's `CORSMiddleware`:
- `allow_credentials=True`
- `allow_methods=["*"]`
- `allow_headers=["*"]`
- Origins configurable via `MW_CORS_ORIGINS` env var

Default origins include `localhost:3000` (Next.js dev) and `localhost:8084` (backend). Production domain must be added via environment variable (see SA-05).

---

## Recommendations Priority

1. **CRITICAL** -- Fix SA-01 (Watchlist IDOR) before production launch
2. **HIGH** -- Fix SA-02 (add DOMPurify to marked.js rendering)
3. **MEDIUM** -- SA-04 (add startup warning for unstable JWT secret)
4. **LOW** -- SA-05 (set MW_CORS_ORIGINS in Railway), SA-06 (verify no debug in prod)
