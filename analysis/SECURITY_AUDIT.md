# Security Vulnerability Audit Report

**Project:** Ra'd AI -- TASI Saudi Stock Market Platform
**Date:** 2026-02-17
**Auditor:** security-auditor (automated)
**Scope:** Full codebase (backend Python, frontend Next.js, templates, configuration)

---

## Executive Summary

The codebase has been audited across 11 security categories. The platform demonstrates a generally good security posture with parameterized queries, bcrypt password hashing, JWT authentication, input validation on most ticker endpoints, rate limiting, and structured error handling. However, several findings require attention, including a **critical hardcoded API key in the committed `.env` file**, missing ticker validation on select routes, an iframe sandbox misconfiguration, and several medium-severity issues around authentication coverage and CSRF protection.

**Finding Summary:**

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 3     |
| Medium   | 6     |
| Low      | 5     |
| Info     | 4     |
| **Total**| **19**|

---

## Findings

### CRITICAL

#### SEC-01: Hardcoded Anthropic API Key in Committed `.env` File

- **Severity:** Critical
- **Location:** `.env:9`
- **Description:** The `.env` file contains a live Anthropic API key (`sk-ant-api03-AOT8...`) and is tracked by git (it appears in `git status` as modified, meaning it was committed at some point). The `.gitignore` does list `.env`, but the file already exists in the working tree. Additionally, the `.env` file contains a Redis URL with an embedded password (`redis://:j9F50f74cz45GCin1DLm6A@localhost:6379/0`), a JWT secret (`change-me-to-a-stable-secret`), and a PostgreSQL password (`changeme`).
- **Impact:** Anyone with repository access can extract the API key and incur charges against the account. The API key should be considered compromised. Credentials for Redis and PostgreSQL are also exposed.
- **Recommendation:**
  1. Immediately rotate the Anthropic API key.
  2. Rotate the Redis password and PostgreSQL password.
  3. Remove `.env` from git history using `git filter-branch` or BFG Repo-Cleaner.
  4. Verify `.env` is in `.gitignore` (it is) and ensure it is never re-committed.
  5. Use environment variables or a secrets manager in production.

---

### HIGH

#### SEC-02: Missing Ticker Validation on Multiple Routes

- **Severity:** High
- **Location:** `api/routes/sqlite_entities.py:228-231`, `api/routes/reports.py:82-88`, `api/routes/entities.py:52-70`
- **Description:** Several routes accept ticker parameters without using `validate_ticker()`:
  - `sqlite_entities.py` `GET /api/entities/{ticker}` uses `_normalize_ticker()` which only checks `isdigit()` and appends `.SR` but does not validate against the `_TICKER_PATTERN` regex. It accepts arbitrary strings like `../../../etc/passwd` or SQL-like payloads.
  - `reports.py` `GET /api/reports/ticker/{ticker}` passes the raw ticker string directly to `svc.get_reports_by_ticker()` with no validation at all.
  - `entities.py` (PG-backed) `list_entities` accepts `sector` and `search` query params that are interpolated into ILIKE patterns with `%{sector}%` -- while parameterized, there is no length or character validation.
- **Impact:** While SQL injection is mitigated by parameterized queries, the lack of input validation means unexpected or malicious values flow through the system, potentially causing confusing error messages or information disclosure. The `_normalize_ticker` function would pass through arbitrary strings into the SQL query parameter.
- **Recommendation:** Apply `validate_ticker()` consistently to all route handlers accepting ticker path parameters. Add length limits to `sector` and `search` query parameters.

#### SEC-03: Iframe Sandbox Allows `allow-same-origin` for AI-Generated Content

- **Severity:** High
- **Location:** `templates/index.html:1393`
- **Description:** The `renderArtifact()` function creates iframes with `sandbox = 'allow-same-origin'` for rendering HTML/SVG artifacts from the AI chat. The `allow-same-origin` sandbox permission allows the iframe content to access the parent page's cookies, localStorage, and session storage. Since the artifact content comes from AI-generated responses, a prompt injection or compromised LLM response could inject malicious HTML that reads the parent page's data.
- **Impact:** An attacker who can influence LLM output (via prompt injection in a query) could craft an artifact that exfiltrates session data, JWT tokens stored in the page, or manipulates the parent page's state.
- **Recommendation:** Change `iframe.sandbox = 'allow-same-origin'` to `iframe.sandbox = ''` (fully sandboxed) or at minimum use `iframe.sandbox = 'allow-scripts'` without `allow-same-origin`. Content that needs interactivity can use `srcdoc` with a CSP meta tag inside the iframe.

#### SEC-04: No CSRF Protection on State-Changing Endpoints

- **Severity:** High
- **Location:** All POST/PUT/DELETE endpoints
- **Description:** The application uses JWT Bearer tokens for authentication but has no CSRF protection mechanism. POST endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/guest`, `/api/reports`, `/api/news`, `/api/announcements`) are vulnerable to CSRF attacks if:
  1. Tokens are stored in cookies (the frontend stores the JWT in localStorage based on code review, which mitigates this for most cases).
  2. The CORS policy is misconfigured to allow attacker origins.

  Currently CORS is configured with specific origins, which provides partial protection. However, the Vanna chat endpoint (`/api/vanna/v2/chat_sse`) does not require authentication in SQLite mode at all.
- **Impact:** In production PostgreSQL mode, if CORS origins are broadened or if the application transitions to cookie-based auth, CSRF attacks could create reports, submit chat queries, or register users.
- **Recommendation:**
  1. Implement CSRF tokens for all state-changing endpoints, or ensure JWT is always sent via `Authorization` header (never cookies).
  2. Add `SameSite=Strict` to any future cookie-based auth.
  3. Consider adding a CSRF middleware for defense-in-depth.

---

### MEDIUM

#### SEC-05: DOMPurify Fallback Missing When Library Fails to Load

- **Severity:** Medium
- **Location:** `templates/index.html:1116-1129` (`renderMd` function)
- **Description:** The `renderMd()` function renders markdown from the AI chat into HTML using `marked.parse()`, then sanitizes with `DOMPurify.sanitize()`. However, both `marked.js` and `DOMPurify` are loaded with the `async` attribute from CDN. If DOMPurify fails to load (CDN outage, network issue, ad blocker), the function falls through to returning unsanitized HTML: `return html;` (line 1129). This means any XSS payload in the AI's response would be rendered as raw HTML.
- **Impact:** If DOMPurify fails to load, AI-generated responses containing `<script>`, `<img onerror>`, or other XSS payloads would execute in the user's browser, potentially stealing session data or performing actions on their behalf.
- **Recommendation:** Never return unsanitized HTML. If DOMPurify is unavailable, fall back to the `esc()` text-escaping function instead of returning raw `marked.parse()` output. Change:
  ```javascript
  if (window.DOMPurify) {
      return DOMPurify.sanitize(html, ...);
  }
  return html; // UNSAFE
  ```
  to:
  ```javascript
  if (window.DOMPurify) {
      return DOMPurify.sanitize(html, ...);
  }
  return esc(text); // Safe fallback
  ```

#### SEC-06: Unauthenticated Vanna Chat Endpoint in SQLite Mode

- **Severity:** Medium
- **Location:** `app.py:322-343`
- **Description:** The Vanna chat SSE endpoint (`/api/vanna/v2/chat_sse`) only has authentication middleware applied in PostgreSQL mode. In SQLite mode (the default for development and potentially some deployments), the endpoint is completely unauthenticated. The `JWTUserResolver` (line 116-150) returns an anonymous user when no token is provided, granting `user` group access to `RunSqlTool` and `VisualizeDataTool`.
- **Impact:** Any unauthenticated user can execute arbitrary SQL queries against the database through the AI chat. While the AI mediates what SQL is generated, prompt injection techniques could potentially extract data or generate unintended queries. The `RunSqlTool` has broad read access to all 10 tables.
- **Recommendation:**
  1. Apply authentication middleware to chat endpoints regardless of backend.
  2. At minimum, require the guest token flow (`/api/auth/guest`) to rate-limit and track anonymous usage.
  3. Consider adding SQL query allow-listing or read-only constraints at the database connection level.

#### SEC-07: Entity Search and Sector LIKE Injection (Minor)

- **Severity:** Medium
- **Location:** `api/routes/sqlite_entities.py:141-147`, `api/routes/entities.py:64-70`
- **Description:** The `search` and `sector` query parameters are used in LIKE/ILIKE patterns with `%{search}%` formatting. While they use parameterized queries (safe from SQL injection), the `%` and `_` wildcards within the search value are not escaped. A user can submit `search=%25%25%25` to create `%%%` patterns that may cause performance issues or return unintended results. The SQLite `news_store.py:search_articles()` properly escapes LIKE wildcards, but the entity routes do not.
- **Impact:** Potential for slow LIKE queries with crafted wildcard patterns. No data breach risk due to parameterization.
- **Recommendation:** Escape `%` and `_` in the `search` and `sector` parameters before embedding in LIKE patterns, consistent with the pattern used in `news_store.py`.

#### SEC-08: Rate Limiting Disabled in Debug Mode

- **Severity:** Medium
- **Location:** `app.py:290-301`
- **Description:** Rate limiting is completely disabled when `SERVER_DEBUG=true`. If a deployment is accidentally left in debug mode, all rate limiting protections (including brute-force protection on `/api/auth/login` at 10 req/min) are removed.
- **Impact:** Brute-force attacks on authentication endpoints, DoS attacks via expensive AI chat queries, and general API abuse become possible.
- **Recommendation:** Never fully disable rate limiting. In debug mode, increase the limits (e.g., 10x) rather than removing them entirely. Add a startup warning and consider a separate `RATE_LIMIT_ENABLED` flag.

#### SEC-09: Password Hash Stored in `auth_provider_id` Column

- **Severity:** Medium
- **Location:** `services/auth_service.py:55-59`
- **Description:** The bcrypt password hash is stored in the `auth_provider_id` column of the `users` table. This column is semantically intended for provider-specific identifiers (e.g., OAuth provider IDs). Storing the password hash here means:
  1. Any query that `SELECT *` from users will include password hashes.
  2. The `auth/dependencies.py:get_current_user()` (line 84-89) selects this column and includes it in the user dict returned to route handlers.
  3. Log statements or error messages that serialize the user object could inadvertently expose password hashes.
- **Impact:** Password hashes may be inadvertently exposed in logs, API responses, or error reports.
- **Recommendation:** Use a dedicated `password_hash` column, or at minimum ensure the `auth_provider_id` column is never included in user profile responses or logged.

#### SEC-10: In-Memory Rate Limiter Not Shared Across Workers

- **Severity:** Medium
- **Location:** `middleware/rate_limit.py:30-66`
- **Description:** The rate limiter uses an in-memory `defaultdict(deque)` for tracking request timestamps. In multi-worker deployments (e.g., `uvicorn --workers 4` or gunicorn), each worker has its own rate limit state. An attacker can effectively multiply their rate limit by the number of workers.
- **Impact:** Rate limits are effectively `N * limit` where N is the number of workers. In a 4-worker deployment, the 10 req/min limit on `/api/auth/login` becomes 40 req/min.
- **Recommendation:** Use a shared backend (Redis) for rate limiting state in production. The `.env.example` shows `RATELIMIT_REDIS_URL` which suggests a Redis-backed rate limiter exists in `backend/middleware/rate_limiter.py` but it is not currently wired into the main `app.py` middleware stack.

---

### LOW

#### SEC-11: `allow_credentials=True` in CORS Configuration

- **Severity:** Low
- **Location:** `middleware/cors.py:28-29`
- **Description:** CORS is configured with `allow_credentials=True`. While the allowed origins list is explicit (not `*`), this enables cross-origin requests to include credentials (cookies). If the origin list is ever broadened or if wildcard patterns are used, this could enable credential theft.
- **Impact:** Low risk given the current explicit origin list. Would become high risk if origins are changed to `*`.
- **Recommendation:** Review whether `allow_credentials=True` is necessary. If the API only uses Bearer tokens via `Authorization` header, credentials mode is not needed.

#### SEC-12: JWT Secret Auto-Generated in Development

- **Severity:** Low
- **Location:** `config/settings.py:108`
- **Description:** When `AUTH_JWT_SECRET` is not set, a random secret is generated via `secrets.token_urlsafe(32)`. This means all JWT tokens are invalidated on every server restart during development. While not a vulnerability per se, if a developer copy-pastes the `.env.example` without changing `change-me-to-a-stable-secret`, this default secret is weak and predictable.
- **Impact:** The `.env` file (which is committed -- see SEC-01) contains `AUTH_JWT_SECRET=change-me-to-a-stable-secret`. If this value is used in production, tokens are trivially forgeable.
- **Recommendation:** The startup validation already enforces `AUTH_JWT_SECRET` in production (postgres + non-debug mode). Extend this check to always reject the literal string `change-me-to-a-stable-secret`.

#### SEC-13: `SELECT *` in Financial Statements Query

- **Severity:** Low
- **Location:** `api/routes/stock_data.py:283`
- **Description:** The financials endpoint uses `SELECT * FROM {statement}` where `statement` is validated against the `_STATEMENT_TABLES` whitelist. While the table name is safe (whitelisted), `SELECT *` returns all columns including `id` which is then stripped. If new sensitive columns are added to these tables, they will be automatically exposed.
- **Impact:** Potential future information disclosure if sensitive columns are added to financial statement tables.
- **Recommendation:** Explicitly list the columns to select rather than using `SELECT *`.

#### SEC-14: No Account Lockout After Failed Login Attempts

- **Severity:** Low
- **Location:** `services/auth_service.py:70-99`, `api/routes/auth.py:92-123`
- **Description:** The login endpoint has no account lockout mechanism after repeated failed attempts. While rate limiting at 10 req/min on `/api/auth/login` provides some protection, there is no per-account lockout. An attacker can try 10 different passwords per minute indefinitely without triggering any account-level protection.
- **Impact:** Slow brute-force attacks are possible over extended periods.
- **Recommendation:** Implement progressive delays or temporary account lockout after N consecutive failed login attempts (e.g., 5 failures triggers a 15-minute lockout).

#### SEC-15: Static Files Served from Templates Directory

- **Severity:** Low
- **Location:** `app.py:562`
- **Description:** The entire `templates/` directory is mounted as static files at `/static`. This directory contains `index.html` which is also served at `/`. While no sensitive files are currently in this directory, any file placed there would be publicly accessible.
- **Impact:** Any file added to the `templates/` directory would be served publicly. No current sensitive files are present.
- **Recommendation:** Create a dedicated `static/` directory for assets and only mount that, rather than mounting the entire templates directory.

---

### INFO

#### SEC-16: Missing Content-Security-Policy Header

- **Severity:** Info
- **Location:** Global (no CSP header configured)
- **Description:** The application does not set a `Content-Security-Policy` header. The legacy template loads scripts from CDNs (`cdn.jsdelivr.net`, `cdn.plot.ly`, `fonts.googleapis.com`) and uses inline styles. A CSP header would provide defense-in-depth against XSS.
- **Impact:** No direct vulnerability, but a missed defense-in-depth measure.
- **Recommendation:** Add a CSP header allowing the specific CDN origins and `'self'`. Consider using nonces for inline scripts.

#### SEC-17: No Security Headers (HSTS, X-Frame-Options, etc.)

- **Severity:** Info
- **Location:** Global
- **Description:** The application does not set common security headers:
  - `Strict-Transport-Security` (HSTS) -- not set
  - `X-Frame-Options` -- not set (pages can be embedded in iframes on any origin)
  - `X-Content-Type-Options: nosniff` -- not set
  - `Referrer-Policy` -- not set

  The `X-Request-ID` header is properly set for request tracing.
- **Impact:** Missing defense-in-depth headers. Clickjacking possible via iframe embedding.
- **Recommendation:** Add a security headers middleware setting HSTS, X-Frame-Options (DENY or SAMEORIGIN), X-Content-Type-Options, and Referrer-Policy.

#### SEC-18: Error Handler Exposes Internal Messages in Debug Mode

- **Severity:** Info
- **Location:** `middleware/error_handler.py:133`
- **Description:** When `SERVER_DEBUG=true`, unhandled exception messages are returned to the client: `message = str(exc) if _DEBUG else "Internal server error"`. Exception messages may contain internal paths, database schema details, or other sensitive information.
- **Impact:** Information disclosure during development. Properly disabled in production.
- **Recommendation:** This is acceptable behavior for development. Ensure `SERVER_DEBUG=false` in all production deployments.

#### SEC-19: `psycopg2-binary` Used Instead of `psycopg2`

- **Severity:** Info
- **Location:** `requirements.txt:7`
- **Description:** The project uses `psycopg2-binary` which bundles its own libpq. In production, `psycopg2` (compiled from source against system libpq) is recommended for security updates to be applied via the system package manager.
- **Impact:** Delayed security patches for the bundled libpq library.
- **Recommendation:** Use `psycopg2` (not `-binary`) in production Docker images where build tools are available.

---

## Summary of SQL Injection Analysis

All database queries were reviewed for SQL injection:

| Location | Pattern | Safe? |
|----------|---------|-------|
| `database/queries.py` | All queries use `?` placeholders | Yes |
| `api/db_helper.py` | Converts `?` to `%s` for PG; uses parameterized execution | Yes |
| `services/auth_service.py` | Uses `%s` parameterized queries | Yes |
| `services/news_store.py` | Uses `?` parameterized queries; LIKE wildcards properly escaped | Yes |
| `services/reports_service.py` | Uses `?`/`%(name)s` parameterized queries | Yes |
| `services/news_service.py` | Uses `%s`/`%(name)s` parameterized queries | Yes |
| `services/announcement_service.py` | Uses `%s`/`%(name)s` parameterized queries | Yes |
| `api/routes/stock_data.py:283` | `f"SELECT * FROM {statement}"` -- table name from whitelist | Yes (whitelisted) |
| `api/routes/stock_data.py:355` | `f"SELECT {col_list} FROM {table}"` -- from `_METRIC_MAP` hardcoded values | Yes (hardcoded) |
| `csv_to_sqlite.py` | Table names from hardcoded constants | Yes (offline tool) |

No SQL injection vulnerabilities were found. All user-controlled values are properly parameterized.

---

## Summary of XSS Analysis

| Location | Vector | Safe? |
|----------|--------|-------|
| `templates/index.html` `renderMd()` | AI chat responses rendered as HTML | Conditional -- safe when DOMPurify loads (SEC-05) |
| `templates/index.html` `esc()` | User message text | Yes -- uses DOM `createTextNode` |
| `templates/index.html` `renderArtifact()` | AI artifacts in iframe | Partially -- `allow-same-origin` is risky (SEC-03) |
| `templates/index.html` `renderDataframe()` | DataFrame cell values | Yes -- uses `esc()` |
| `templates/index.html` `renderNotification()` | Notification text | Yes -- uses `esc()` |
| `templates/raid-features.js` `escapeHtml()` | Toast messages | Yes -- uses DOM `createTextNode` |
| Frontend React components | No `dangerouslySetInnerHTML` found | Yes |

---

## Authentication Coverage Summary

| Route | Auth Required? | Notes |
|-------|---------------|-------|
| `POST /api/auth/register` | No | By design |
| `POST /api/auth/login` | No | By design |
| `POST /api/auth/guest` | No | By design |
| `POST /api/auth/refresh` | Refresh token | Correct |
| `GET /api/auth/me` | Yes | Correct |
| `GET /api/reports` | No | Read endpoints are public |
| `POST /api/reports` | Yes | Write requires auth |
| `POST /api/news` (PG) | Yes | Write requires auth |
| `POST /api/announcements` (PG) | Yes | Write requires auth |
| `GET/POST /api/watchlists/*` | Yes | All routes require auth |
| `POST /api/vanna/v2/chat_sse` | Optional (PG only) | **No auth in SQLite mode** (SEC-06) |
| `GET /api/v1/stocks/*` | No | Read-only data |
| `GET /api/v1/market/*` | No | Read-only data |
| `GET /api/v1/news/*` | No | Read-only data |
| `GET /api/v1/charts/*` | No | Read-only data |
| `GET /api/entities/*` | No | Read-only data |
| `GET /health*` | No | By design |

---

## Recommendations Priority

| Priority | Finding | Action |
|----------|---------|--------|
| **P0 - Immediate** | SEC-01 | Rotate all exposed credentials, remove `.env` from git history |
| **P1 - This Sprint** | SEC-03 | Fix iframe sandbox to remove `allow-same-origin` |
| **P1 - This Sprint** | SEC-05 | Add safe fallback when DOMPurify unavailable |
| **P1 - This Sprint** | SEC-02 | Apply `validate_ticker()` to all ticker-accepting routes |
| **P2 - Next Sprint** | SEC-04 | Document CSRF mitigation strategy |
| **P2 - Next Sprint** | SEC-06 | Require at least guest tokens for chat in all modes |
| **P2 - Next Sprint** | SEC-10 | Wire Redis-backed rate limiter for production |
| **P3 - Backlog** | SEC-07 | Escape LIKE wildcards in entity search |
| **P3 - Backlog** | SEC-08 | Never fully disable rate limiting in debug mode |
| **P3 - Backlog** | SEC-09 | Rename `auth_provider_id` to `password_hash` |
| **P3 - Backlog** | SEC-14 | Implement account lockout mechanism |
| **P4 - Nice to Have** | SEC-16, SEC-17 | Add CSP and security headers |
