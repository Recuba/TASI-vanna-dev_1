# Configuration & Environment Audit Report

**Auditor:** config-auditor
**Date:** 2026-02-17
**Scope:** Environment variables, settings validation, secrets management, Docker, CI/CD, frontend config, Vercel

---

## Executive Summary

The configuration system is well-structured overall, using Pydantic Settings for type-safe config with proper env prefix scoping. However, there are **2 critical findings** (hardcoded secrets in committed `.env`, incomplete `.gitignore`), **5 high-severity issues**, and several medium/low items. The CI/CD pipeline is solid but has some gaps in test coverage and secret hygiene.

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 5     |
| MEDIUM   | 8     |
| LOW      | 6     |
| INFO     | 4     |

---

## 1. Environment Variables

### 1.1 Coverage: `.env.example` vs Actual Usage

**Status: 5 undocumented env vars found**

The following env vars are used in code but NOT documented in `.env.example`:

| Variable | Used In | Issue |
|----------|---------|-------|
| `ERROR_TRACKER` | `config/error_tracking.py:175` | Controls error tracking backend ("log" or "sentry") |
| `SENTRY_DSN` | `config/error_tracking.py:178` | Sentry DSN for error tracking |
| `IS_DEVELOPMENT` | `config/logging_config.py:91` | Alternative debug mode detection |
| `PORT` | `entrypoint.sh:49` | Railway-injected port override (`${PORT:-8084}`) |
| `NEXT_PUBLIC_CDN_URL` | `frontend/src/config/cdn.ts:10` | CDN base URL for static assets |

**[MEDIUM] M-01: Undocumented environment variables.** Five env vars are used in production code paths but absent from `.env.example`, making setup error-prone for new developers.

**Recommendation:** Add all five to `.env.example` with `[optional]` tags and descriptions.

### 1.2 GEMINI_API_KEY Disconnect

**[HIGH] H-01: `GEMINI_API_KEY` is documented in `.env.example` but never read in `config/settings.py`.**

- `.env.example` line 25 marks `GEMINI_API_KEY` as `[REQUIRED]` and says the active LLM provider is Gemini.
- `config/settings.py` only reads `LLM_API_KEY` and `ANTHROPIC_API_KEY`. No `GEMINI_API_KEY` field exists in `LLMSettings`.
- `config/env_validator.py:68` checks for `GEMINI_API_KEY` as a fallback, but the actual settings class never uses it.
- `app.py` uses `AnthropicLlmService` (Anthropic Claude), not Gemini.

This means setting `GEMINI_API_KEY=...` does nothing at runtime -- the app silently ignores it. The `.env.example` documentation is misleading.

### 1.3 Migration Script Env Var Naming

**[LOW] L-01: `database/migrate_sqlite_to_pg.py` and `database/csv_to_postgres.py` read `PG_HOST`, `PG_PORT`, `PG_DBNAME`, `PG_USER`, `PG_PASSWORD` directly from `os.environ.get()`**, not via `config/settings.py`. These differ from the `POSTGRES_*` naming convention in `.env.example` and `docker-compose.yml`. The `entrypoint.sh` bridges this gap by exporting `PG_*` from `POSTGRES_*`, but running the migration scripts outside Docker requires knowing the `PG_*` convention.

### 1.4 `CacheSettings.redis_url` Alias Mismatch

**[MEDIUM] M-02: `CacheSettings.redis_url` uses `validation_alias="REDIS_URL"` but `.env.example` documents `CACHE_REDIS_URL`.**

The `CACHE_` prefix is the expected convention, but the alias only accepts `REDIS_URL`. If a user sets `CACHE_REDIS_URL=redis://...` (as documented), it will be ignored because the pydantic prefix resolution produces `CACHE_REDIS_URL` but the alias only matches `REDIS_URL`. This is confirmed by the `.env` file which uses `REDIS_URL=redis://:j9F50f74cz45GCin1DLm6A@localhost:6379/0` -- the only naming that works.

**Fix:** Change to `validation_alias=AliasChoices("CACHE_REDIS_URL", "REDIS_URL")`.

---

## 2. Settings Validation

### 2.1 Pydantic Settings Structure

**Status: Generally well-designed**

- 8 settings classes with proper `env_prefix` scoping
- `get_settings()` uses `@lru_cache(maxsize=1)` for singleton pattern
- `DatabaseSettings` uses `AliasChoices` for Docker compatibility
- `AuthSettings` has a model validator for JWT secret in production

### 2.2 Missing Validators

**[MEDIUM] M-03: Several settings lack validation:**

| Setting | Issue |
|---------|-------|
| `PoolSettings.min/max` | No validation that `min <= max` |
| `CacheSettings.default_ttl` | No `ge=0` constraint |
| `ServerSettings.port` | No `ge=1, le=65535` range constraint |
| `ScraperSettings.dedup_threshold` | No `ge=0.0, le=1.0` constraint |
| `MiddlewareSettings.rate_limit_per_minute` | No `ge=1` constraint |

### 2.3 `AuthSettings._is_auto_generated` Private Field

**[LOW] L-02: `_is_auto_generated` is set as a class attribute (`bool = True`) but then mutated via `object.__setattr__` in the validator.** This works but is fragile. Using a `PrivateAttr` from pydantic would be more idiomatic.

---

## 3. Secrets Management

### 3.1 Hardcoded Secrets in `.env`

**[CRITICAL] C-01: The `.env` file is committed to the repository and contains real credentials:**

| Secret | Location | Value (redacted) |
|--------|----------|-------------------|
| `ANTHROPIC_API_KEY` | `.env:9` | `sk-ant-api03-AOT8iw...` (full Anthropic API key) |
| `REDIS_URL` | `.env:63` | `redis://:j9F50f74cz45GCin1DLm6A@localhost:6379/0` (contains Redis password) |
| `PGADMIN_DEFAULT_PASSWORD` | `.env:78` | `admin` (plaintext password) |
| `AUTH_JWT_SECRET` | `.env:49` | `change-me-to-a-stable-secret` (insecure default) |
| `POSTGRES_PASSWORD` | `.env:27` | `changeme` (insecure default) |

### 3.2 `.gitignore` Coverage

**[CRITICAL] C-02: `.gitignore` lists `.env` but does NOT exclude `.env.local`, `.env.production`, `.env.*.local`, or `frontend/.env.local`.**

Current `.gitignore` content:
```
__pycache__/
.pytest_cache/
.benchmarks/
*.pyc
nul
f8c88490871f6169/
.env
```

Missing entries:
- `.env.*` (except `.env.example`)
- `frontend/.env.local`
- `frontend/.env.local.*`
- `*.pem`, `*.key` (certificate files)
- `saudi_stocks.db` (generated database, currently tracked)

The `.dockerignore` is more comprehensive (has `.env.*` with `!.env.example`).

### 3.3 No Hardcoded Secrets in Source Code

**Status: PASS** -- No hardcoded API keys, passwords, or tokens found in `.py`, `.ts`, `.tsx`, `.yml` source files (only test fixtures use dummy values).

### 3.4 CI/CD Secret Exposure

**[LOW] L-03: `ci.yml` hardcodes the PostgreSQL test password `tasi_pass` in plain text** (lines 89, 104). This is acceptable for CI test databases but should use GitHub secrets for consistency if the workflow is public.

---

## 4. Docker Configuration

### 4.1 Dockerfile

**Status: Well-structured**

Positives:
- Multi-stage build (builder + runtime)
- `tini` as PID 1 init process for signal handling
- Non-root user (`appuser`, UID 1000)
- `HEALTHCHECK` defined with appropriate intervals
- `--no-cache-dir` for pip installs
- `--no-install-recommends` for apt packages

**[LOW] L-04: `curl` is installed in the runtime image solely for the `HEALTHCHECK`.** Consider using a Python-based health check (`python -c "import urllib.request; ..."`) to avoid the extra dependency and reduce attack surface.

### 4.2 Docker Compose

**Status: Good with minor issues**

Positives:
- Required env vars enforced with `${VAR:?message}` syntax
- Health checks on all services
- PostgreSQL port bound to `127.0.0.1` only (not exposed externally)
- Redis port bound to `127.0.0.1` only
- Resource limits defined (`deploy.resources.limits`)
- Named volumes for data persistence

**[MEDIUM] M-04: Redis health check doesn't account for password-protected instances.** When `REDIS_PASSWORD` is set, `redis-cli ping` will fail because it doesn't include `--pass`. Fix:
```yaml
test: ["CMD-SHELL", "redis-cli ${REDIS_PASSWORD:+-a $REDIS_PASSWORD} ping"]
```

**[MEDIUM] M-05: `docker-compose.yml` sets `CACHE_REDIS_URL: redis://redis:6379/0` for the app service but doesn't pass `REDIS_PASSWORD`.** When the Redis container requires a password, the app's Redis URL won't work. Should use: `CACHE_REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0`

**[HIGH] H-02: The `app` service has a hard dependency on `redis` (`depends_on: redis: condition: service_healthy`), but Redis is described as optional.** If someone wants to run without Redis, they cannot start the app via Docker Compose without also starting Redis. Consider making this conditional or removing the hard dependency.

### 4.3 Railway Configuration

**Status: Minimal but correct**

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
startCommand = "./entrypoint.sh"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
numReplicas = 1
```

**[INFO] I-01:** No `region` or `memorySizeBytes` specified. Railway defaults may be sufficient but should be explicitly documented.

---

## 5. CI/CD Pipeline

### 5.1 `ci.yml` Analysis

**Status: Comprehensive with gaps**

Jobs:
| Job | Purpose | Status |
|-----|---------|--------|
| `lint` | Python ruff check + format | Good |
| `security` | `pip-audit` dependency scan | Weak (`\|\| true` swallows failures) |
| `python-tests` | SQLite backend tests | Good |
| `test-pg` | PostgreSQL backend tests | Weak (tests allowed to fail) |
| `docker` | Docker build + non-root check | Good |
| `frontend-lint` | ESLint | Good |
| `frontend-build` | Build + Vitest | Good |

**[HIGH] H-03: `pip-audit` uses `|| true`, meaning vulnerability findings never fail the build.** This makes the security audit purely informational.

**[HIGH] H-04: PostgreSQL integration tests use `|| true` on both `test_services.py` and `test_api_routes.py`.** These tests are allowed to fail silently, providing no CI safety net for integration regressions.

**[MEDIUM] M-06: `npm run lint:rtl` is not included in the CI pipeline.** The RTL lint enforces critical Tailwind direction class rules but is only documented as a manual step.

**[MEDIUM] M-07: No test coverage reporting in CI.** Neither `pytest --cov` nor Vitest `--coverage` are used, so coverage trends are not tracked.

### 5.2 `deploy.yml` Analysis

**Status: Good**

Positives:
- Only deploys after CI passes (`workflow_run ... completed ... success`)
- Uses GitHub `environment: production` for approval gates
- Post-deploy health check with 5 retries
- Secrets via `${{ secrets.RAILWAY_TOKEN }}`

**[LOW] L-05: `vars.DEPLOY_URL` fallback hardcodes `raid-ai-app-production.up.railway.app`.** If the deployment URL changes, this fallback must be manually updated.

### 5.3 Build Caching

- Python: `cache: pip` in `setup-python` action
- Node: `cache: npm` with `cache-dependency-path`
- Docker: `cache-from: type=gha` / `cache-to: type=gha,mode=max`

**Status: PASS** -- All three build systems use GitHub Actions cache.

---

## 6. `env_validator.py` Analysis

**Status: Functional but incomplete**

The validator checks:
- `DB_BACKEND` valid values
- `POSTGRES_PASSWORD` required when PG mode
- LLM API key presence (warns if missing)
- `LOG_LEVEL` valid values
- `AUTH_JWT_SECRET` in production
- `MW_CORS_ORIGINS` wildcard in production

**[MEDIUM] M-08: Missing validation checks:**

| Check | Reason |
|-------|--------|
| `SERVER_PORT` range | Could be set to invalid port (0, 99999) |
| `CACHE_REDIS_URL` format | Malformed URL causes runtime crash |
| `MW_CORS_ORIGINS` format | Invalid URLs pass silently |
| `POSTGRES_PORT` range | Non-numeric or out-of-range values accepted |
| `RATELIMIT_*` vars | Not validated at all (delegated to middleware) |
| `SERVER_DEBUG=true` in production | Dangerous default not flagged |
| `POSTGRES_PASSWORD=changeme` warning | Common insecure default not flagged |

---

## 7. Frontend Configuration

### 7.1 `.env.local.example`

**Status: Well-documented with one gap**

Documented vars:
- `NEXT_PUBLIC_API_URL` -- Required, backend URL
- `BACKEND_URL` -- Server-side override
- `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_API_TIMEOUT_MS`, `NEXT_PUBLIC_API_CACHE_TTL_MS`, `NEXT_PUBLIC_HEALTH_POLL_INTERVAL_MS`
- `NEXT_PUBLIC_ALLOWED_HOSTS`, `NEXT_PUBLIC_CSP_REPORT_URI`
- `NEXT_PUBLIC_SESSION_TIMEOUT`, `NEXT_PUBLIC_AUTH_REDIRECT`
- `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_ENABLE_MONITORING`
- `ANALYZE`

**[MEDIUM] M-09 (duplicate of M-01): `NEXT_PUBLIC_CDN_URL` is used in `frontend/src/config/cdn.ts` but not documented in `.env.local.example`.**

### 7.2 `config.ts` Runtime Config

**Status: PASS** -- Clean pattern using `process.env.NEXT_PUBLIC_*` with `??` defaults. Build-time inlining is correctly noted in comments.

### 7.3 CSP Configuration

**Status: Good but notable**

`next.config.mjs` has a proper Content Security Policy with:
- `frame-ancestors 'none'` (clickjacking protection)
- HSTS with preload
- Referrer-Policy
- Permissions-Policy

**[INFO] I-02: CSP allows `'unsafe-eval'` and `'unsafe-inline'` for scripts.** This weakens XSS protection but may be required by TradingView and Next.js dev mode. Consider nonce-based CSP for production.

---

## 8. Development vs Production

### 8.1 Configuration Differences

| Setting | Development | Production | Enforced? |
|---------|-------------|------------|-----------|
| `SERVER_DEBUG` | `false` (default) | `false` | No enforcement |
| `AUTH_JWT_SECRET` | Auto-generated | Required | Warning only, not error |
| `CORS origins` | `localhost:3000,8084` | Should be restricted | Wildcard warned |
| `POSTGRES_PASSWORD` | `changeme` | Should be strong | Not validated |
| `ENVIRONMENT` | `development` | `production` | Manual |

**[HIGH] H-05: `AUTH_JWT_SECRET` is only warned, not errored, in production.** The `config/settings.py:132-138` validator logs a warning but allows the app to start with an auto-generated secret. This means production can run with ephemeral JWT secrets, invalidating all sessions on restart. The `env_validator.py:87-92` also only warns.

### 8.2 Dangerous Defaults

**[INFO] I-03: `MiddlewareSettings.cors_origins` defaults include `https://frontend-two-nu-83.vercel.app` and `https://raid-ai-app-production.up.railway.app`.** Hardcoding deployment URLs as defaults means any instance with default config allows cross-origin requests from these specific domains. This should be empty by default, populated via env vars.

**[INFO] I-04: `RATELIMIT_ENABLED=true` by default in `.env.example` but requires Redis.** If Redis is not available and the rate limiter has no fallback, this could cause startup failures.

---

## 9. Vercel Configuration

**File:** `vercel.json`
```json
{
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/.next",
  "installCommand": "cd frontend && npm install",
  "framework": "nextjs",
  "rootDirectory": "frontend"
}
```

**[LOW] L-06: `rootDirectory` is set to `frontend` but build/install commands use `cd frontend`.** When `rootDirectory` is set, Vercel already changes to that directory before running commands. The `cd frontend &&` prefix is redundant and could cause a "directory not found" error if Vercel's behavior changes. Either remove `rootDirectory` or remove the `cd frontend &&` prefix from commands.

---

## Findings Summary

### CRITICAL

| ID | Finding | Location |
|----|---------|----------|
| C-01 | Hardcoded Anthropic API key and Redis password in committed `.env` file | `.env:9,63` |
| C-02 | `.gitignore` only excludes `.env` -- missing `.env.*`, `frontend/.env.local` patterns | `.gitignore` |

### HIGH

| ID | Finding | Location |
|----|---------|----------|
| H-01 | `GEMINI_API_KEY` documented as required but never used by settings or app | `.env.example:25`, `config/settings.py` |
| H-02 | Docker Compose hard-depends on Redis despite it being optional | `docker-compose.yml:64-65` |
| H-03 | `pip-audit` failures swallowed by `\|\| true` in CI | `.github/workflows/ci.yml:49` |
| H-04 | PostgreSQL integration tests swallowed by `\|\| true` in CI | `.github/workflows/ci.yml:141-144` |
| H-05 | `AUTH_JWT_SECRET` only warned, not errored, in production mode | `config/settings.py:132`, `config/env_validator.py:87` |

### MEDIUM

| ID | Finding | Location |
|----|---------|----------|
| M-01 | 5 undocumented env vars (`ERROR_TRACKER`, `SENTRY_DSN`, `IS_DEVELOPMENT`, `PORT`, `NEXT_PUBLIC_CDN_URL`) | Various |
| M-02 | `CacheSettings.redis_url` alias only accepts `REDIS_URL`, not `CACHE_REDIS_URL` | `config/settings.py:93-96` |
| M-03 | Missing range validators on `PoolSettings`, `CacheSettings`, `ServerSettings`, `ScraperSettings` | `config/settings.py` |
| M-04 | Redis health check fails when password is set | `docker-compose.yml:97` |
| M-05 | Docker Compose Redis URL doesn't include password | `docker-compose.yml:46` |
| M-06 | `npm run lint:rtl` not included in CI pipeline | `.github/workflows/ci.yml` |
| M-07 | No test coverage reporting in CI | `.github/workflows/ci.yml` |
| M-08 | `env_validator.py` missing checks for port ranges, URL formats, insecure defaults | `config/env_validator.py` |

### LOW

| ID | Finding | Location |
|----|---------|----------|
| L-01 | Migration scripts use `PG_*` env vars, not `POSTGRES_*` | `database/migrate_sqlite_to_pg.py:325-331` |
| L-02 | `AuthSettings._is_auto_generated` should use `PrivateAttr` | `config/settings.py:112` |
| L-03 | CI hardcodes PG test password in plain text | `.github/workflows/ci.yml:89,104` |
| L-04 | `curl` installed in Docker image solely for health check | `Dockerfile:24` |
| L-05 | Deploy URL fallback hardcoded in deploy workflow | `.github/workflows/deploy.yml:31` |
| L-06 | Vercel `rootDirectory` + `cd frontend` commands are redundant | `vercel.json` |

### INFO

| ID | Finding | Location |
|----|---------|----------|
| I-01 | Railway config lacks explicit region/memory settings | `railway.toml` |
| I-02 | CSP allows `unsafe-eval` and `unsafe-inline` | `frontend/next.config.mjs:16` |
| I-03 | CORS defaults hardcode deployment URLs | `config/settings.py:153` |
| I-04 | `RATELIMIT_ENABLED=true` default requires Redis | `.env.example:140` |

---

## Recommended Priority Actions

1. **Immediately rotate the Anthropic API key** exposed in `.env` (C-01). Run `git filter-branch` or BFG to remove from history.
2. **Expand `.gitignore`** to cover `.env.*`, `!.env.example`, `frontend/.env.local`, `*.pem`, `*.key` (C-02).
3. **Add `GEMINI_API_KEY` to `LLMSettings`** or update `.env.example` to stop documenting it as required (H-01).
4. **Make `AUTH_JWT_SECRET` a hard error in production** -- change the warning to `raise RuntimeError(...)` (H-05).
5. **Remove `|| true` from `pip-audit` and PG tests** in CI, or at minimum use `continue-on-error: true` at the job level so failures are visible (H-03, H-04).
6. **Fix `CacheSettings.redis_url` alias** to accept both `CACHE_REDIS_URL` and `REDIS_URL` (M-02).
7. **Add `lint:rtl` to CI** in the `frontend-build` job (M-06).
8. **Document the 5 missing env vars** in `.env.example` (M-01).
