# Security Patterns Audit Report

**Tool:** ast-grep + ripgrep
**Scope:** Full repository (Python backend + TypeScript/TSX frontend + legacy HTML template)
**Date:** 2026-02-17
**Auditor:** ast-grep automated scan with manual triage

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 2 | Hardcoded Anthropic API key in `.env`, hardcoded Redis password in `.env` |
| HIGH     | 3 | DOMPurify conditional bypass (XSS), innerHTML with server content, `iframe` in sanitizer allowlist |
| MEDIUM   | 4 | Dynamic SQL with f-string WHERE clauses, unparameterized table names in migration, MD5 for cache keys, placeholder JWT secret |
| LOW      | 5 | Test-only hardcoded passwords, localhost defaults in production config, Vercel URL in default CORS, DOMPurify loaded async, hardcoded pgAdmin credentials |
| INFO     | 2 | No eval/exec/pickle/subprocess/os.system found, Vanna wildcard CORS properly removed |

**Total findings: 16**

---

## CRITICAL Findings

### C-01: Hardcoded Anthropic API Key in `.env` File

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\.env`
**Line:** 9
**Pattern:** `sk-ant-api03-*` API key committed to disk

```
ANTHROPIC_API_KEY=sk-ant-api03-<REDACTED — key revoked; do not commit real keys>
```

**Risk:** Full Anthropic API key is present on disk. Although `.env` is in `.gitignore` and not currently tracked by git, the key is exposed to anyone with filesystem access. The `PRODUCTION_READINESS_PLAN.md` (line 30) already flagged this key as having been previously committed to git history and needing revocation.

**Remediation:**
1. Immediately revoke this API key in the Anthropic console and generate a new one.
2. Use a secrets manager (e.g., Railway secrets, AWS Secrets Manager) in production.
3. Ensure `.env` is never committed; verify with `git ls-files -- .env` (confirmed clean).
4. Rotate any keys that may have been in git history using `git filter-repo`.

---

### C-02: Hardcoded Redis Password in `.env` File

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\.env`
**Line:** 63

```
REDIS_URL=redis://:j9F50f74cz45GCin1DLm6A@localhost:6379/0
```

**Risk:** The Redis authentication password (`j9F50f74cz45GCin1DLm6A`) is hardcoded in the `.env` file. If this is a production credential, it is exposed to anyone with filesystem access.

**Remediation:**
1. Move Redis credentials to a secrets manager.
2. Use environment variable injection from the deployment platform (Railway, Docker Compose secrets).

---

## HIGH Findings

### H-01: DOMPurify Conditional Bypass -- XSS via `innerHTML` in Legacy Template

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\templates\index.html`
**Lines:** 1116-1130, 1331, 1335, 1434

The `renderMd()` function uses DOMPurify but only conditionally:

```javascript
function renderMd(text) {
    var html;
    if (window.marked) {
        setupMarked();
        html = marked.parse(text);
    } else {
        html = esc(text).replace(/\n/g, '<br>');
    }
    if (window.DOMPurify) {
        return DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'], ADD_ATTR: ['target'] });
    }
    return html;  // <-- UNSANITIZED if DOMPurify fails to load
}
```

Both `marked.js` and `DOMPurify` are loaded with the `async` attribute (lines 15-17), meaning they may not be available when `renderMd()` is first called. If DOMPurify fails to load (CDN outage, ad blocker, network issue), `marked.parse()` output is injected into the DOM unsanitized via `innerHTML` on multiple lines (1331, 1335, 1434).

**Affected `innerHTML` assignments using `renderMd()` output:**
- Line 1331: `existing.innerHTML = html;` (text component update)
- Line 1335: `el.innerHTML = html;` (text component create)
- Line 1434: `el.innerHTML = html;` (dataframe render -- uses `esc()`, safe)

**Risk:** If an attacker can influence server SSE response content (e.g., through a Vanna LLM prompt injection), they could inject malicious HTML/JS that gets rendered without sanitization.

**Remediation:**
1. Load DOMPurify synchronously (remove `async`) or block rendering until it is loaded.
2. Add a fallback that escapes HTML when DOMPurify is unavailable:
   ```javascript
   if (!window.DOMPurify) {
       return esc(html); // Safe fallback
   }
   ```
3. Consider bundling DOMPurify locally instead of loading from CDN.

---

### H-02: DOMPurify `ADD_TAGS: ['iframe']` Allows Iframe Injection

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\templates\index.html`
**Line:** 1127

```javascript
return DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'], ADD_ATTR: ['target'] });
```

**Risk:** Allowing `<iframe>` through DOMPurify enables clickjacking and phishing attacks. An attacker who can influence the markdown content (via LLM response manipulation) could embed an iframe pointing to a credential-harvesting page.

**Remediation:**
1. Remove `ADD_TAGS: ['iframe']` from the DOMPurify config unless there is a specific, validated use case.
2. If iframes are needed for Plotly charts, use a separate sanitization path for chart content only.

---

### H-03: TradingView Widget `innerHTML` and External Script Injection

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\frontend\src\components\charts\TradingViewWidget.tsx`
**Lines:** 55, 86, 94

```typescript
container.innerHTML = '';                    // Line 55, 94 -- clearing, acceptable
script.innerHTML = JSON.stringify(config);   // Line 86 -- config injection into script tag
```

The widget loads an external script from `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js` and passes configuration via `script.innerHTML = JSON.stringify(config)`. While the `symbol` prop is the main external input, and JSON.stringify provides some protection, this pattern bypasses React's virtual DOM and sanitization.

**Risk:** If the `symbol` prop contains crafted content, it could potentially influence the TradingView widget behavior. The risk is mitigated by `JSON.stringify` encoding, but the pattern of using `innerHTML` with external scripts is inherently fragile.

**Remediation:**
1. Consider using the official TradingView React component or `textContent` instead of `innerHTML` for the config.
2. Validate the `symbol` prop against the ticker pattern before passing to the widget.

---

## MEDIUM Findings

### M-01: Dynamic SQL with f-string WHERE Clause Construction

**Files (all using parameterized values, but f-string clause assembly):**
- `services/announcement_service.py` (lines 167, 204, 241, 292)
- `services/news_service.py` (lines 156, 198, 238, 292)
- `services/reports_service.py` (lines 449, 460)
- `services/user_service.py` (lines 321, 431)
- `services/audit_service.py` (line 170)
- `api/routes/sqlite_entities.py` (lines 153, 161)
- `api/routes/stock_data.py` (line 389)

**Pattern:**
```python
where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
sql = f"""
    SELECT a.*
    FROM announcements a
    {where}
    ORDER BY a.announcement_date DESC NULLS LAST
    LIMIT %(limit)s OFFSET %(offset)s
"""
cur.execute(sql, params)
```

**Risk:** While the actual values are parameterized (using `%(name)s` for PostgreSQL and `?` for SQLite), the WHERE clause structure itself is assembled via f-strings. The clause column names are hardcoded strings, not user input, so the actual SQL injection risk is LOW. However, this pattern is fragile -- a future developer could accidentally interpolate user input into a clause string.

**Remediation:**
1. Consider using a query builder library (e.g., `sqlalchemy.text()` with named params).
2. Add code review guidelines to flag any `f"..."` usage in SQL construction.

---

### M-02: Unparameterized Table Name in Migration Script

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\database\migrate_sqlite_to_pg.py`
**Lines:** 118, 163

```python
def build_insert_sql(table: str, columns: list) -> str:
    return f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})"

rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
```

**Risk:** Table names are interpolated directly into SQL. While `table` comes from an internal hardcoded list (not user input), this pattern would be dangerous if the migration script were ever exposed to external input.

**Remediation:**
1. Add a whitelist check: `assert table in KNOWN_TABLES` before interpolation.
2. Document that this script is for internal/admin use only.

---

### M-03: MD5 Used for Cache Key Hashing

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\cache\decorators.py`
**Line:** 91

```python
arg_hash = hashlib.md5(raw.encode()).hexdigest()[:12]
```

**Risk:** MD5 is cryptographically broken and collision-prone. While this usage is for cache key generation (not security), MD5 collisions could theoretically cause cache poisoning -- two different queries returning the same cached result.

**Remediation:**
1. Replace with `hashlib.sha256` (negligible performance difference for short strings).
2. Use `hashlib.blake2b(digest_size=8)` for a faster, collision-resistant alternative.

---

### M-04: Placeholder JWT Secret in `.env`

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\.env`
**Line:** 49

```
AUTH_JWT_SECRET=change-me-to-a-stable-secret
```

**Risk:** The placeholder secret is already detected by the config validator (`scripts/validate_config.py` line 92), but it remains in the `.env` file. If deployed without changing, JWT tokens would use a publicly known secret.

**Mitigating factors:**
- `config/settings.py` lines 115-144 validate the JWT secret and warn/error in production.
- `config/env_validator.py` lines 84-90 check for missing JWT secret in production.

**Remediation:**
1. Generate a proper secret: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Add a pre-deploy CI check that rejects placeholder values.

---

## LOW Findings

### L-01: Test-Only Hardcoded Passwords

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\tests\test_auth.py`
**Lines:** 40, 54, 74, 236, 246, 261, 278

```python
password = "mysecretpassword"
password = "correcthorsebatterystaple"
password = "securepass123"
```

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\tests\test_connection_pool.py`
**Lines:** 42, 53, 66, 86, 118, 146, 187, 216, 245

```python
mock_settings.pg_password = "testpass"
```

**Risk:** These are test-only fixtures, not production credentials. Acceptable for unit tests but should never appear in production code.

**Status:** ACCEPTABLE -- test files only.

---

### L-02: Localhost and `0.0.0.0` Defaults in Production Config

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\config\settings.py`
**Lines:** 33, 193

```python
# DatabaseSettings
default="localhost"  # pg_host default

# ServerSettings
host: str = "0.0.0.0"
```

**Risk:** `0.0.0.0` binding exposes the server on all network interfaces. While this is standard for containerized deployments (Docker/Railway), it could expose services on development machines.

**Status:** ACCEPTABLE for Docker deployment. Add documentation noting this.

---

### L-03: Vercel URL Hardcoded in Default CORS Origins

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\config\settings.py`
**Line:** 153

```python
cors_origins: str = "http://localhost:3000,http://localhost:8084,https://frontend-two-nu-83.vercel.app,https://raid-ai-app-production.up.railway.app"
```

**Risk:** The Vercel URL (`frontend-two-nu-83.vercel.app`) is a specific deployment URL that may become stale. More importantly, having production URLs in default config means development environments accept cross-origin requests from production origins.

**Remediation:**
1. Remove production URLs from defaults; set them via `MW_CORS_ORIGINS` environment variable in production.

---

### L-04: DOMPurify Loaded Asynchronously

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\templates\index.html`
**Line:** 17

```html
<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js" async crossorigin="anonymous"></script>
```

**Risk:** The `async` attribute means DOMPurify may not be loaded when first needed. This compounds the XSS risk in H-01.

**Remediation:** Remove `async` or add a load check before rendering markdown.

---

### L-05: Hardcoded pgAdmin Credentials in `.env`

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\.env`
**Lines:** 77-78

```
PGADMIN_DEFAULT_EMAIL=admin@tasi.local
PGADMIN_DEFAULT_PASSWORD=admin
```

**Risk:** Default pgAdmin credentials are trivially guessable. While pgAdmin is optional (`--profile tools`), if exposed these would allow full database management access.

**Remediation:**
1. Use strong credentials even for development pgAdmin instances.
2. Ensure pgAdmin is never exposed to the internet.

---

## INFO -- Clean Patterns (No Findings)

### I-01: No Dangerous Builtins Found

The following patterns returned zero results across all Python files:
- `eval()` -- no usage found
- `exec()` -- no usage found
- `pickle.load()` / `pickle.loads()` -- no usage found
- `subprocess.run/call/Popen(shell=True)` -- no usage found
- `os.system()` -- no usage found
- `verify=False` (disabled SSL) -- no usage found

**Status:** CLEAN

---

### I-02: Vanna Default Wildcard CORS Properly Removed

**File:** `C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\app.py`
**Lines:** 234-239

```python
# Remove Vanna's default CORSMiddleware (allow_origins=["*"]) so our
# configured CORS settings (from MiddlewareSettings) take effect.
from fastapi.middleware.cors import CORSMiddleware as _CORSMiddleware
app.user_middleware = [
    m for m in app.user_middleware if m.cls is not _CORSMiddleware
]
```

The app correctly removes Vanna's permissive `allow_origins=["*"]` CORS middleware and replaces it with a configured allowlist. The `config/env_validator.py` (line 95-99) also checks for and warns about wildcard CORS in production.

**Status:** CLEAN

---

## Additional Observations

### Frontend: No `dangerouslySetInnerHTML` in React Components

A scan of all `.tsx` and `.ts` files in `frontend/src/` found zero instances of `dangerouslySetInnerHTML`. All innerHTML usage in the frontend is in the TradingView widget (H-03) which operates outside React's virtual DOM by necessity.

### Backend: Ticker Validation in Place

All stock data endpoints use `models/validators.py` which enforces a strict regex pattern (`^\d{4}(\.SR)?|\^TASI$`) on ticker inputs before they reach SQL queries. This mitigates SQL injection via ticker parameters.

### Backend: No Hardcoded Bearer Tokens

A search for `Bearer` followed by long token strings found zero matches in source code.

### Backend: API Keys Loaded from Environment

The main `app.py` loads API keys exclusively from environment variables via `os.environ.get()` or pydantic-settings, with no hardcoded keys in source code (only in the `.env` file and documentation examples using `"sk-ant-..."` placeholders).

---

## Severity Definitions

| Severity | Description |
|----------|-------------|
| CRITICAL | Actual secrets exposed; immediate exploitation possible |
| HIGH     | Code injection vectors (XSS, SQL injection) in production paths |
| MEDIUM   | Potential injection vectors, weak crypto, or fragile security patterns |
| LOW      | Informational findings, test-only issues, or minor configuration concerns |
| INFO     | Clean patterns -- confirmed absence of anti-patterns |

---

## Recommendations Summary (Priority Order)

1. **IMMEDIATE**: Revoke and rotate the Anthropic API key (`C-01`) and Redis password (`C-02`).
2. **HIGH**: Fix DOMPurify conditional bypass in legacy template (`H-01`, `H-02`, `L-04`).
3. **HIGH**: Add TradingView symbol prop validation (`H-03`).
4. **MEDIUM**: Replace MD5 with SHA-256 for cache key hashing (`M-03`).
5. **MEDIUM**: Add table name whitelist to migration script (`M-02`).
6. **MEDIUM**: Document f-string SQL pattern as acceptable but fragile (`M-01`).
7. **LOW**: Rotate placeholder JWT secret before any deployment (`M-04`).
8. **LOW**: Remove production URLs from default CORS config (`L-03`).
9. **LOW**: Use strong pgAdmin credentials even in development (`L-05`).
