# Ra'd AI TASI Platform - Production Readiness Audit & Enhancement Plan

**Audit Date:** 2026-02-13
**Auditor:** Senior Full-Stack / DevOps Consultant
**Platform:** Ra'd AI - TASI Saudi Stock Market AI Platform
**Stack:** Vanna 2.0 + FastAPI (Python 3.11) | Next.js 14 (TypeScript) | PostgreSQL 16 | Redis 7
**Deployment:** Railway PaaS (current) | Docker Compose (local)

---

## 1. Executive Summary

### What's Good

The Ra'd AI platform demonstrates solid engineering foundations:

- **Well-structured Python backend** with typed settings via pydantic-settings, proper config separation, and a clean dual-backend (SQLite/PostgreSQL) architecture
- **Comprehensive database schema** (796 lines, 10+ tables, 58 indexes, GIN full-text search, UUID PKs, foreign keys)
- **Good test coverage baseline** (496 tests passing, 18 PG-dependent skips)
- **Security-conscious auth layer** with JWT (access + refresh tokens), bcrypt password hashing, and role-based admin tiers
- **Mature CI pipeline** with lint, test, Docker build verification, and non-root user checks
- **Docker best practices** including non-root user, health checks, resource limits, named volumes, and proper network isolation
- **Feature-rich frontend** with RTL Arabic support, bilingual i18n, dark/gold design system, and toast notifications
- **Existing security audit** (`scripts/SECURITY_AUDIT.md`) showing awareness of OWASP concerns

### Top Risks (Blockers)

| # | Risk | Severity | Impact |
|---|------|----------|--------|
| 1 | **API key exposed in `.env` git history** | CRITICAL | Active `sk-ant-api03-*` Anthropic key committed |
| 2 | **No distributed rate limiting** | CRITICAL | In-memory rate limiter fails with multiple instances; brute-force auth attacks possible |
| 3 | **IDOR vulnerability in watchlists** | CRITICAL | Users can access/modify other users' watchlists by ID guessing |
| 4 | **XSS via Markdown rendering fallback** | HIGH | If DOMPurify CDN fails, raw HTML from `marked.parse()` is injected unsanitized |
| 5 | **No container image scanning in CI** | HIGH | Vulnerable dependencies shipped to production undetected |
| 6 | **No database backup/restore strategy** | HIGH | Single point of data loss with no PITR or automated backups |
| 7 | **JWT secret resets on deploy** | HIGH | Random secret generation when `AUTH_JWT_SECRET` unset invalidates all sessions |
| 8 | **pip-audit failures silenced** (`|| true`) | HIGH | Known CVEs pass CI unchecked |

### Top Priorities

1. **Immediate (Day 0):** Revoke exposed API key, set production secrets in Railway
2. **Week 1:** Fix auth security (rate limiting, IDOR, timing attacks), add container scanning
3. **Week 2-3:** Implement Redis-backed rate limiting, database backups, monitoring
4. **Month 2-3:** Performance testing, staging environment, operational runbooks

---

## 2. Gap Analysis: Current State vs. Production Target

### Backend

| Area | Current State | Target State | Gap |
|------|--------------|--------------|-----|
| **Secrets Management** | `.env` file, some defaults like `changeme` | External secrets manager, no defaults in prod | CRITICAL |
| **Rate Limiting** | In-memory `defaultdict(deque)` per-process | Redis sliding window, distributed across instances | CRITICAL |
| **Auth Security** | JWT with bcrypt, no lockout/rate limit | Account lockout, constant-time login, CAPTCHA | HIGH |
| **CORS** | `localhost:3000,8084` hardcoded default | Production domains configured, strict origin list | HIGH |
| **Error Handling** | Debug mode leaks stack traces | Error IDs returned, traces only in logs | MEDIUM |
| **Connection Pooling** | `ThreadedConnectionPool(min=2, max=10)` | pgBouncer or pool tuned to deployment topology | LOW |
| **API Versioning** | `/api/v1/` prefix present | Contract testing, deprecation headers | LOW |
| **Graceful Shutdown** | `exec uvicorn` (signal forwarding) | `--timeout-graceful-shutdown 30`, connection draining | MEDIUM |

### Frontend

| Area | Current State | Target State | Gap |
|------|--------------|--------------|-----|
| **Error Boundaries** | None | React error boundaries on all route segments | HIGH |
| **API Error Handling** | Basic try/catch in fetch calls | Centralized error handler with retry, toast feedback | HIGH |
| **Image Optimization** | 0 uses of `next/image` | All images through `<Image>` with proper sizing | MEDIUM |
| **Token Storage** | `localStorage` (68 references) | HttpOnly cookies or secure token refresh flow | HIGH |
| **SEO/OG Tags** | Basic metadata in layout | Per-page OG images, Twitter cards, structured data | MEDIUM |
| **PWA Manifest** | Missing | `manifest.json` with icons, theme color, offline stub | LOW |
| **Bundle Size** | No analysis | Lighthouse CI, bundle analyzer in CI | MEDIUM |
| **Accessibility** | Partial ARIA, keyboard nav present | WCAG 2.1 AA compliance, axe-core in CI | MEDIUM |

### Infrastructure

| Area | Current State | Target State | Gap |
|------|--------------|--------------|-----|
| **Docker Image** | Single-stage, ~500MB+, gcc in prod | Multi-stage, ~200MB, no build tools | HIGH |
| **Image Pinning** | `python:3.11-slim` (no digest) | `python:3.11-slim@sha256:...` pinned | MEDIUM |
| **CI Security** | pip-audit silenced, no Trivy | Strict vulnerability gates, container scanning | HIGH |
| **Rollback** | No automated rollback | Health-check-gated deploys with `railway rollback` | MEDIUM |
| **Monitoring** | stdout JSON logs only | Prometheus `/metrics`, Sentry errors, structured traces | HIGH |
| **Backups** | None | Daily `pg_dump`, weekly restore test, PITR | HIGH |
| **Staging Env** | None (dev + prod only) | Railway staging service with promotion workflow | MEDIUM |

### Database

| Area | Current State | Target State | Gap |
|------|--------------|--------------|-----|
| **Schema Constraints** | FKs and UNIQUE present | CHECK constraints for ranges, date types | MEDIUM |
| **Indexes** | 58 indexes defined | Add missing indexes for `news_articles.published_at`, audit composite | MEDIUM |
| **Migrations** | Manual SQL, no versioning | Alembic or dbmate with versioned migrations | HIGH |
| **Partitioning** | None | Range partition `price_history` and `query_audit_log` by month | LOW |
| **Connection Limits** | PostgreSQL default (100) | `max_connections=50`, `statement_timeout=30s` | MEDIUM |

---

## 3. Prioritized Checklist

### P0 - Critical (Must fix before any production traffic)

- [ ] **SEC-01: Revoke exposed Anthropic API key**
  - *File:* `.env` line 9 (`sk-ant-api03-AOT8iwK...` committed to git history)
  - *Action:* Revoke at console.anthropic.com, use `git filter-branch` to purge from history, force push
  - *Acceptance:* `git log -p --all -S 'sk-ant'` returns zero results; new key set exclusively in Railway env vars
  - *Effort:* 2 hours | *Owner:* DevOps

- [ ] **SEC-02: Fix IDOR in watchlist endpoints**
  - *File:* `api/routes/watchlists.py` lines 64-74
  - *Issue:* `add_ticker_to_watchlist` fetches by watchlist ID, then checks ownership - allows timing-based enumeration
  - *Action:* Query with `WHERE watchlist_id = %s AND user_id = %s` atomically
  - *Acceptance:* Test that user A cannot access user B's watchlist by ID; return 404 not 403
  - *Effort:* 4 hours | *Owner:* Backend

- [x] **SEC-03: Enforce production secrets**
  - *Files:* `config/settings.py` line 105, `app.py` line 549
  - *Issue:* `AUTH_JWT_SECRET` defaults to random value (sessions lost on restart); `POSTGRES_PASSWORD=changeme`
  - *Action:* Add startup validator that fails with clear error if `AUTH_JWT_SECRET` not explicitly set when `ENVIRONMENT=production`
  - *Acceptance:* App refuses to start in production with default/empty JWT secret; Railway env vars documented
  - *Effort:* 2 hours | *Owner:* Backend
  - *Resolved:* `config/env_validator.py` enforces `AUTH_JWT_SECRET` when `ENVIRONMENT=production` (errors out at startup if missing)

- [x] **SEC-04: Implement distributed rate limiting**
  - *File:* `middleware/rate_limit.py` lines 57-88
  - *Issue:* In-memory `defaultdict(deque)` doesn't work across multiple processes/instances; IP spoofable
  - *Action:* Replace with Redis sliding window (`ZADD`/`ZRANGEBYSCORE`); respect `X-Forwarded-For` behind trusted proxy
  - *Acceptance:* Rate limit state shared across instances; login endpoint limited to 5/min per IP
  - *Effort:* 1 day | *Owner:* Backend
  - *Resolved:* `backend/middleware/rate_limiter.py` implements Redis-backed sliding window (ZREMRANGEBYSCORE + ZADD pipeline) with in-memory fallback when Redis is unavailable

- [x] **SEC-05: Add DOMPurify fallback in legacy template**
  - *File:* `templates/index.html` line 1129
  - *Issue:* If DOMPurify CDN fails to load, `marked.parse()` output is injected raw (XSS)
  - *Action:* Check `window.DOMPurify` before rendering markdown; fall back to escaped plain text
  - *Acceptance:* `renderMd('<script>alert(1)</script>')` never executes script regardless of CDN status
  - *Effort:* 1 hour | *Owner:* Frontend
  - *Resolved (partial):* DOMPurify CDN loaded at line 17; `renderMd()` wraps output in `DOMPurify.sanitize()` at lines 1126-1127. Remaining gap: if DOMPurify CDN fails, line 1129 still returns unsanitized HTML. SEC-06 (SRI) would mitigate CDN compromise risk.

- [ ] **SEC-06: Add Subresource Integrity (SRI) to all CDN scripts**
  - *File:* `templates/index.html` lines 15-17, 1082
  - *Issue:* CDN compromise (jsdelivr, cdn.plot.ly) leads to XSS on all users
  - *Action:* Generate and add `integrity="sha384-..."` attribute to all `<script>` tags
  - *Acceptance:* Browser blocks modified CDN scripts; tested with tampered script
  - *Effort:* 1 hour | *Owner:* Frontend

- [x] **SEC-07: Set production CORS origins**
  - *File:* `app.py` line 233, `.env` line 70
  - *Issue:* Default origins are `localhost:3000,8084`; production domain not included
  - *Action:* Set `MW_CORS_ORIGINS` in Railway to include `https://raid-ai-app-production.up.railway.app` and production frontend domain
  - *Acceptance:* Next.js frontend can call API from production domain; no wildcard `*` in CORS
  - *Effort:* 15 min | *Owner:* DevOps
  - *Resolved:* `middleware/cors.py` provides `setup_cors()` with explicit origin list (no wildcard). `config/settings.py` defaults include Railway production domain and Vercel frontend URL. `env_validator.py` warns if `*` is present in production.

### P1 - High (Fix within Week 1-2)

- [ ] **SEC-08: Add constant-time login to prevent timing attacks**
  - *File:* `services/auth_service.py` lines 70-99
  - *Issue:* Different code paths for "user not found" vs "wrong password" leak timing information
  - *Action:* Always call `verify_password()` even when user not found (use dummy hash); unify error messages
  - *Acceptance:* Response time variance < 10ms between valid/invalid emails
  - *Effort:* 2 hours | *Owner:* Backend

- [ ] **SEC-09: Add account lockout / brute-force protection**
  - *File:* `api/routes/auth.py` - no rate limiting on login
  - *Action:* Track failed login attempts in Redis; lock account after 5 failures for 15 minutes
  - *Acceptance:* 6th failed login returns 429 with retry-after header; account unlocks after timeout
  - *Effort:* 4 hours | *Owner:* Backend

- [ ] **SEC-10: Move JWT tokens from localStorage to HttpOnly cookies**
  - *File:* `frontend/src/` - 68 localStorage references
  - *Issue:* Tokens in localStorage are accessible via XSS; any script injection steals all sessions
  - *Action:* Set tokens as HttpOnly, Secure, SameSite=Strict cookies; add CSRF token for mutations
  - *Acceptance:* `document.cookie` and `localStorage` contain no auth tokens; API calls include cookie automatically
  - *Effort:* 2 days | *Owner:* Full-stack

- [ ] **INFRA-01: Implement multi-stage Docker build**
  - *File:* `Dockerfile` (entire file)
  - *Issue:* gcc, libpq-dev shipped to production (~500MB image); build tools increase attack surface
  - *Action:* Builder stage compiles wheels; runtime stage copies only wheels + libpq5
  - *Acceptance:* `docker images tasi-app` shows < 250MB; `docker exec tasi-app which gcc` returns not found
  - *Effort:* 3 hours | *Owner:* DevOps

- [ ] **INFRA-02: Add container vulnerability scanning to CI**
  - *File:* `.github/workflows/ci.yml` (add after Docker build step)
  - *Action:* Add Trivy scan step with `severity: CRITICAL,HIGH` and `exit-code: 1`
  - *Acceptance:* CI fails on any CRITICAL/HIGH CVE; SARIF report uploaded to GitHub Security tab
  - *Effort:* 2 hours | *Owner:* DevOps

- [ ] **INFRA-03: Fix pip-audit to actually fail on vulnerabilities**
  - *File:* `.github/workflows/ci.yml` line 45
  - *Issue:* `pip-audit ... || true` silences ALL vulnerability findings
  - *Action:* Remove `|| true`; use `--ignore-vuln` only for specific known-acceptable CVEs with justification comments
  - *Acceptance:* CI fails when new HIGH/CRITICAL vulnerability is introduced
  - *Effort:* 30 min | *Owner:* DevOps

- [ ] **INFRA-04: Implement database backup strategy**
  - *Issue:* No automated backups, no PITR, no restore procedure
  - *Action:* Add backup sidecar in docker-compose; configure Railway's built-in PG backups; document restore procedure
  - *Acceptance:* Daily backups verified with automated restore test; documented RTO < 1 hour, RPO < 24 hours
  - *Effort:* 1 day | *Owner:* DevOps

- [ ] **INFRA-05: Pin Docker base images by digest**
  - *Files:* `Dockerfile` line 1, `docker-compose.yml` lines 6, 67, 100
  - *Issue:* `python:3.11-slim`, `postgres:16-alpine`, `redis:7-alpine` are mutable tags; `dpage/pgadmin4:latest` is anti-pattern
  - *Action:* Pin all images by SHA256 digest; add Dependabot/Renovate for automated digest updates
  - *Acceptance:* All FROM/image directives include `@sha256:` suffix
  - *Effort:* 1 hour | *Owner:* DevOps

- [ ] **DB-01: Implement versioned database migrations**
  - *Issue:* Schema changes require manual SQL; no rollback capability; no migration history
  - *Action:* Adopt Alembic (or dbmate) with versioned migrations; generate initial migration from current schema
  - *Acceptance:* `alembic upgrade head` and `alembic downgrade -1` work correctly; migration history tracked
  - *Effort:* 1 day | *Owner:* Backend

- [ ] **DB-02: Add transaction management to migration/ingestion scripts**
  - *Files:* `database/migrate_sqlite_to_pg.py` lines 182-198, `database/csv_to_postgres.py` lines 480-489
  - *Issue:* Batch inserts commit only at end; failure leaves database in inconsistent state
  - *Action:* Wrap each table's batch insert in a transaction; add rollback on failure; add idempotency via `ON CONFLICT DO NOTHING`
  - *Acceptance:* Interrupted migration can be safely re-run; no partial table loads
  - *Effort:* 4 hours | *Owner:* Backend

- [ ] **FE-01: Add React error boundaries**
  - *File:* `frontend/src/app/` (all route segments)
  - *Issue:* Unhandled React errors crash entire app with white screen
  - *Action:* Add `error.tsx` and `loading.tsx` to each route segment; global fallback in root layout
  - *Acceptance:* Component errors show friendly error UI with retry button; errors logged to console/monitoring
  - *Effort:* 4 hours | *Owner:* Frontend

- [ ] **OBS-01: Add application monitoring**
  - *Issue:* No error tracking, no metrics endpoint, no structured tracing
  - *Action:* Add Sentry DSN for error tracking; add `prometheus-fastapi-instrumentator` for `/metrics`; add request ID middleware
  - *Acceptance:* Errors appear in Sentry dashboard within 30s; Prometheus can scrape `/metrics`; all log entries include request ID
  - *Effort:* 1 day | *Owner:* Backend

### P2 - Medium (Fix within Month 1)

- [ ] **SEC-11: Add Content Security Policy (CSP) header**
  - *File:* `templates/index.html` (no CSP), `middleware/` (no security headers middleware)
  - *Action:* Add CSP middleware restricting `script-src` to self + specific CDNs with nonces; add HSTS header
  - *Acceptance:* Browser console shows no CSP violations for normal operation; inline scripts blocked
  - *Effort:* 4 hours | *Owner:* Security

- [ ] **SEC-12: Add input validation to all API endpoints**
  - *Files:* `api/routes/news.py`, `reports.py`, `announcements.py`, `watchlists.py`
  - *Issue:* Create endpoints accept arbitrary strings; no content-length limits; no ticker format validation
  - *Action:* Add Pydantic validators for all input models; enforce max lengths; validate ticker format (`^\d{4}$`)
  - *Acceptance:* Invalid inputs return 422 with clear error messages; fuzz testing finds no unhandled inputs
  - *Effort:* 1 day | *Owner:* Backend

- [ ] **SEC-13: Fix iframe sandbox in legacy template**
  - *File:* `templates/index.html` line 1392
  - *Issue:* `iframe.sandbox = 'allow-same-origin'` allows Plotly chart artifacts to access parent document
  - *Action:* Change to `iframe.sandbox = ''` (fully isolated) or use CSP sandbox directive
  - *Acceptance:* `window.parent` access from iframe throws SecurityError
  - *Effort:* 1 hour | *Owner:* Frontend

- [ ] **DB-03: Add CHECK constraints for data validation**
  - *File:* `database/schema.sql`
  - *Issue:* `market_data` allows negative prices; `profitability_metrics` allows invalid percentages; `sentiment_score` has no range
  - *Action:* Add `CHECK (current_price >= 0)`, `CHECK (roe BETWEEN -10 AND 10)`, `CHECK (sentiment_score BETWEEN -1 AND 1)`
  - *Acceptance:* `INSERT INTO market_data ... VALUES (-1.0)` raises constraint violation
  - *Effort:* 2 hours | *Owner:* Backend

- [ ] **DB-04: Add missing indexes for common query patterns**
  - *File:* `database/schema.sql`
  - *Missing:* `news_articles.published_at DESC`, `query_audit_log(was_successful, created_at DESC)`, `price_history(ticker, trade_date DESC)`
  - *Acceptance:* `EXPLAIN ANALYZE` for news feed query shows index scan, not sequential scan
  - *Effort:* 1 hour | *Owner:* Backend

- [ ] **DB-05: Configure PostgreSQL production settings**
  - *File:* `docker-compose.yml` (postgres service)
  - *Action:* Add custom `postgresql.conf` with: `max_connections=50`, `statement_timeout=30000`, `idle_in_transaction_session_timeout=60000`, `log_connections=on`
  - *Acceptance:* Long-running queries automatically killed after 30s; connection stats visible in logs
  - *Effort:* 2 hours | *Owner:* DevOps

- [ ] **INFRA-06: Add graceful shutdown handling**
  - *Files:* `entrypoint.sh` line 49, `app.py`
  - *Action:* Add `--timeout-graceful-shutdown 30` to uvicorn; add FastAPI lifespan event for connection pool cleanup
  - *Acceptance:* In-flight requests complete during rolling deploy; no 502s during deployment
  - *Effort:* 2 hours | *Owner:* Backend

- [ ] **INFRA-07: Add automated rollback on failed deploy**
  - *File:* `.github/workflows/deploy.yml`
  - *Issue:* Health check failure after deploy doesn't trigger rollback
  - *Action:* Add `railway rollback` step on health check failure; add smoke test script
  - *Acceptance:* Failed deploy automatically reverts to last known good version within 5 minutes
  - *Effort:* 4 hours | *Owner:* DevOps

- [ ] **INFRA-08: Add test coverage enforcement**
  - *Files:* Missing `pytest.ini` / `pyproject.toml` pytest config
  - *Action:* Add `pytest-cov` with `--cov-fail-under=75`; add coverage report to CI artifacts
  - *Acceptance:* CI fails if coverage drops below 75%; coverage trend visible in PR comments
  - *Effort:* 2 hours | *Owner:* Backend

- [ ] **FE-02: Use `next/image` for all images**
  - *Issue:* 0 uses of `next/image` found; no image optimization
  - *Action:* Replace all `<img>` tags with `<Image>` component; configure image domains in `next.config`
  - *Acceptance:* Lighthouse image audit passes with no warnings
  - *Effort:* 4 hours | *Owner:* Frontend

- [ ] **FE-03: Add OpenGraph and social media meta tags**
  - *Issue:* No `opengraph-image`, `twitter-image`, or per-page OG tags
  - *Action:* Add OG images, per-page metadata in `generateMetadata()`, Twitter card markup
  - *Acceptance:* Social media share preview shows correct title, description, and image
  - *Effort:* 4 hours | *Owner:* Frontend

- [ ] **TEST-01: Add security test suite**
  - *Issue:* 0% security test coverage
  - *Action:* Add tests for: SQL injection via API params, XSS in rendered content, auth bypass, IDOR, CSRF
  - *Acceptance:* Security test suite runs in CI; covers OWASP Top 10 attack vectors
  - *Effort:* 2 days | *Owner:* Security

- [ ] **TEST-02: Add load/performance tests**
  - *Issue:* No load testing (k6, Locust, or Artillery)
  - *Action:* Create k6 scripts for: 100 concurrent chat queries, news feed pagination, auth flow
  - *Acceptance:* p95 response time < 500ms at 100 concurrent users; no errors under load
  - *Effort:* 2 days | *Owner:* Backend

---

## 4. Enhancement Recommendations

### Quick Wins (Small effort, high impact)

| # | Enhancement | Effort | Risk | Impact | Dependencies |
|---|------------|--------|------|--------|--------------|
| QW-1 | **Add request ID middleware** - Correlate logs across request lifecycle | 1 hour | None | High (debuggability) | None |
| QW-2 | **Add `/health/ready` and `/health/live` endpoints** - Separate liveness from readiness probes | 2 hours | None | High (reliability) | None |
| QW-3 | **Add ETag caching to news/reports endpoints** - Reduce redundant DB queries | 3 hours | Low | Medium (performance) | None |
| QW-4 | **Add Dependabot/Renovate** - Automated dependency update PRs | 30 min | Low | High (security) | GitHub config |
| QW-5 | **Add `robots.txt` and `sitemap.xml`** to Next.js app | 1 hour | None | Medium (SEO) | None |
| QW-6 | **Configure Redis cache for user session lookups** - Stop hitting DB on every authenticated request | 4 hours | Low | High (performance) | Redis already in docker-compose |

**QW-1 Acceptance:** Every log line includes `request_id`; response headers include `X-Request-ID`.

**QW-6 Acceptance:** `auth/dependencies.py:get_current_user()` checks Redis first (TTL 60s); DB query only on cache miss. Measured p99 auth overhead < 5ms.

### Must-Have Enhancements (High priority, significant impact)

| # | Enhancement | Effort | Risk | Impact | Dependencies |
|---|------------|--------|------|--------|--------------|
| MH-1 | **Redis-backed API response caching** - Cache frequent queries (market data, sector stats) | 1 day | Low | High | Redis + cache invalidation |
| MH-2 | **Webhook/alert delivery system** - Price alerts currently stored but never delivered | 3 days | Medium | High | Email service (SendGrid/SES) |
| MH-3 | **Query audit dashboard** - Expose `query_audit_log` as admin analytics | 2 days | Low | Medium | Admin UI component |
| MH-4 | **Staged deployment pipeline** - Dev -> Staging -> Production with promotion gates | 1 day | Low | High | Railway staging service |
| MH-5 | **Database connection pooling with pgBouncer** - Proper connection management for production scale | 1 day | Medium | High | Docker sidecar or Railway addon |

**MH-1 Details:**
- Add `@cached(ttl=300)` decorator to `market_data` and `sector_stats` endpoints
- Use Redis `SET key value EX 300` with cache key derived from query params
- Add `Cache-Control` headers to responses
- Add cache invalidation on data ingestion
- *Acceptance:* Cache hit rate > 80% for repeated queries; stale data never served beyond TTL

**MH-4 Details:**
- Create Railway staging service mirroring production
- CI deploys to staging first; manual promotion to production
- Staging uses separate database (seeded from production backup)
- *Acceptance:* All changes tested on staging before reaching production; staging URL documented

### Optional Enhancements (Nice-to-have)

| # | Enhancement | Effort | Risk | Impact |
|---|------------|--------|------|--------|
| OPT-1 | **PWA support** - offline stub, install prompt, push notifications | 2 days | Low | Medium |
| OPT-2 | **GraphQL API** alongside REST for flexible frontend queries | 1 week | Medium | Medium |
| OPT-3 | **Table partitioning** for `price_history` and `query_audit_log` | 1 day | Medium | Low (until > 10M rows) |
| OPT-4 | **Kubernetes migration** for auto-scaling beyond Railway limits | 2 weeks | High | High (at scale) |
| OPT-5 | **Multi-region deployment** for disaster recovery | 1 week | High | High (for SLA requirements) |
| OPT-6 | **A/B testing framework** with feature flags (LaunchDarkly/Unleash) | 3 days | Low | Medium |

---

## 5. 30/60/90 Day Roadmap

### Week 1-2: Critical Security & Stability

| Task | Owner | Status | Dependency |
|------|-------|--------|------------|
| Revoke exposed API key, purge git history (SEC-01) | DevOps | - | Immediate |
| Set all production secrets in Railway (SEC-03) | DevOps | DONE | SEC-01 |
| Fix IDOR in watchlist endpoints (SEC-02) | Backend | - | None |
| Fix DOMPurify fallback + SRI hashes (SEC-05, SEC-06) | Frontend | PARTIAL (DOMPurify added; SRI pending) | None |
| Set production CORS origins (SEC-07) | DevOps | DONE | None |
| Implement Redis rate limiting (SEC-04) | Backend | DONE | Redis running |
| Add constant-time login (SEC-08) | Backend | - | None |
| Add account lockout (SEC-09) | Backend | - | SEC-04 (Redis) |
| Add Trivy container scanning to CI (INFRA-02) | DevOps | - | None |
| Fix pip-audit to fail on vulnerabilities (INFRA-03) | DevOps | - | None |
| Multi-stage Docker build (INFRA-01) | DevOps | - | None |
| Pin Docker images by digest (INFRA-05) | DevOps | - | None |
| Add Dependabot (QW-4) | DevOps | - | None |
| Add request ID middleware (QW-1) | Backend | - | None |

### Week 3-6: Operational Hardening

| Task | Owner | Status | Dependency |
|------|-------|--------|------------|
| Move tokens from localStorage to HttpOnly cookies (SEC-10) | Full-stack | - | SEC-09 |
| Add CSP header (SEC-11) | Security | - | SEC-05, SEC-06 |
| Add input validation to all endpoints (SEC-12) | Backend | - | None |
| Implement database migrations with Alembic (DB-01) | Backend | - | None |
| Add transaction management to migration scripts (DB-02) | Backend | - | None |
| Add CHECK constraints (DB-03) | Backend | - | DB-01 |
| Add missing indexes (DB-04) | Backend | - | None |
| Configure PostgreSQL production settings (DB-05) | DevOps | - | None |
| Implement database backup strategy (INFRA-04) | DevOps | - | None |
| Add graceful shutdown handling (INFRA-06) | Backend | - | None |
| Add automated deploy rollback (INFRA-07) | DevOps | - | None |
| Add test coverage enforcement (INFRA-08) | Backend | - | None |
| Add Sentry + Prometheus monitoring (OBS-01) | Backend | - | None |
| Add `/health/ready` and `/health/live` (QW-2) | Backend | - | None |
| Add error boundaries to frontend (FE-01) | Frontend | - | None |
| Add ETag caching (QW-3) | Backend | - | None |
| Cache user sessions in Redis (QW-6) | Backend | - | Redis |

### Week 7-12: Performance, Testing & Scale

| Task | Owner | Status | Dependency |
|------|-------|--------|------------|
| Add security test suite (TEST-01) | Security | - | SEC-* complete |
| Add load/performance tests with k6 (TEST-02) | Backend | - | OBS-01 |
| Redis API response caching (MH-1) | Backend | - | QW-6 |
| Staged deployment pipeline (MH-4) | DevOps | - | INFRA-07 |
| Database connection pooling with pgBouncer (MH-5) | DevOps | - | DB-05 |
| Add OpenGraph/social tags (FE-03) | Frontend | - | None |
| Use `next/image` everywhere (FE-02) | Frontend | - | None |
| Query audit dashboard (MH-3) | Full-stack | - | OBS-01 |
| Alert delivery system (MH-2) | Backend | - | MH-1 |
| Add `robots.txt` + `sitemap.xml` (QW-5) | Frontend | - | None |

---

## 6. Deployment Architecture Recommendation

### Recommended Production Topology

```
                    ┌──────────────┐
                    │  Cloudflare  │  CDN + WAF + DDoS protection
                    │  (or Railway │  SSL termination
                    │   edge)      │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──┐  ┌──────▼────┐  ┌───▼──────────┐
     │ Next.js   │  │ FastAPI   │  │ FastAPI      │
     │ Frontend  │  │ Instance 1│  │ Instance 2   │
     │ (Vercel/  │  │ (Railway) │  │ (Railway)    │
     │  Railway) │  │           │  │              │
     └───────────┘  └─────┬─────┘  └──────┬───────┘
                          │               │
                    ┌─────▼───────────────▼─────┐
                    │      Redis 7 (Cache)      │
                    │  - Rate limiting state     │
                    │  - Session cache           │
                    │  - API response cache      │
                    └───────────────────────────┘
                          │
                    ┌─────▼─────────────────────┐
                    │    PostgreSQL 16           │
                    │  - Primary (Railway)       │
                    │  - Daily backups to S3     │
                    │  - statement_timeout=30s   │
                    └───────────────────────────┘
```

### Environment Variables to Add/Rename

```bash
# --- Required in Railway Production ---
ENVIRONMENT=production                    # NEW: triggers strict validation
AUTH_JWT_SECRET=<64-char-random-hex>     # EXISTING: must be explicitly set
ANTHROPIC_API_KEY=sk-ant-api03-...       # EXISTING: new key after revoke
MW_CORS_ORIGINS=https://your-domain.com  # EXISTING: add production domain

# --- Recommended New Variables ---
SENTRY_DSN=https://xxx@sentry.io/yyy    # NEW: error tracking
LOG_LEVEL=INFO                           # EXISTING: ensure not DEBUG
CACHE_ENABLED=true                       # EXISTING: enable Redis caching
REDIS_PASSWORD=<strong-random>           # EXISTING: set non-empty
REDIS_URL=redis://:password@redis:6379/0 # EXISTING: include password

# --- Database Production Settings ---
PG_POOL_MIN=5                            # NEW: minimum pool connections
PG_POOL_MAX=20                           # NEW: scale up from default 10
PG_STATEMENT_TIMEOUT=30000               # NEW: kill queries after 30s

# --- CI/CD Variables (GitHub Secrets) ---
TRIVY_SEVERITY=CRITICAL,HIGH             # NEW: container scan threshold
COVERAGE_THRESHOLD=75                    # NEW: minimum test coverage
```

### CI Jobs to Add

```yaml
# .github/workflows/ci.yml additions:

  # After existing 'docker' job:
  container-scan:
    name: Container Security Scan
    runs-on: ubuntu-latest
    needs: docker
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -t tasi-app:ci .
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: tasi-app:ci
          format: sarif
          output: trivy-results.sarif
          severity: CRITICAL,HIGH
          exit-code: 1
      - name: Upload scan results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif

  # New coverage job:
  coverage:
    name: Test Coverage
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt pytest-cov
      - run: pytest tests/ --cov=. --cov-report=xml --cov-fail-under=75
      - uses: codecov/codecov-action@v4
        with:
          files: coverage.xml
```

---

## 7. Operational Runbook Outline

### 7.1 On-Call Responsibilities

- **Monitor:** Sentry error rate, Railway health dashboard, `/health/ready` endpoint
- **Escalation path:** On-call engineer -> Tech Lead -> CTO
- **Response SLOs:** P0 (site down) < 15 min acknowledge, < 1 hour resolve; P1 < 4 hours; P2 < 24 hours

### 7.2 Alert Configuration

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| API Error Rate | > 5% of requests return 5xx for 5 min | P0 | Check logs, restart service if needed |
| Health Check Fail | `/health/ready` returns non-200 for 3 checks | P0 | Check DB connectivity, Redis, restart |
| High Latency | p95 > 2s for 5 min | P1 | Check slow queries, connection pool, cache hit rate |
| Auth Failures | > 50 failed logins in 5 min from single IP | P1 | Check rate limiter, potential attack |
| Disk Usage | PostgreSQL volume > 80% | P1 | Run vacuum, check for runaway audit logs |
| Memory Usage | App container > 900MB / 1GB limit | P2 | Check for memory leaks, restart |
| Certificate Expiry | SSL cert expires in < 14 days | P2 | Railway auto-renews; verify if custom domain |

### 7.3 Backup & Restore Procedure

**Backup (automated daily):**
```bash
# Railway PostgreSQL backup (built-in)
# Verify backup exists: Railway Dashboard -> Database -> Backups

# Manual backup:
pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB \
  --format=custom --compress=9 \
  --file=backup_$(date +%Y%m%d_%H%M%S).dump
```

**Restore procedure:**
```bash
# 1. Stop application (prevent writes)
railway service stop raid-ai-app

# 2. Restore from backup
pg_restore -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB \
  --clean --if-exists --no-owner \
  backup_YYYYMMDD_HHMMSS.dump

# 3. Verify data integrity
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT COUNT(*) FROM companies;"

# 4. Restart application
railway service start raid-ai-app

# 5. Verify health
curl https://raid-ai-app-production.up.railway.app/health
```

### 7.4 Incident Response Steps

1. **Detect:** Alert fires or user report received
2. **Acknowledge:** On-call engineer acknowledges within SLO
3. **Assess:** Check health endpoints, error logs, recent deploys
4. **Mitigate:**
   - If bad deploy: `railway rollback --service raid-ai-app`
   - If database issue: Check connections, run `SELECT pg_cancel_backend(pid)` for stuck queries
   - If rate limit / attack: Check Redis rate limit keys, add IP to blocklist
5. **Communicate:** Update status page, notify stakeholders
6. **Resolve:** Fix root cause, verify fix in staging, deploy
7. **Post-mortem:** Write incident report within 48 hours; update runbook if needed

### 7.5 Common Operations

**Rotate JWT secret (planned maintenance):**
```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# 2. Set in Railway
railway variables set AUTH_JWT_SECRET=$NEW_SECRET

# 3. Deploy (all existing sessions will be invalidated)
railway up

# 4. Monitor: expect spike in 401 errors as users re-authenticate
```

**Scale up for expected traffic:**
```bash
# Railway: increase instance count
railway service scale --replicas 3

# Verify Redis rate limiting works across instances
for i in {1..20}; do curl -s -o /dev/null -w "%{http_code}\n" https://api.example.com/health; done
```

**Emergency database query kill:**
```sql
-- Find long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle' AND query_start < now() - interval '30 seconds';

-- Kill specific query
SELECT pg_cancel_backend(<pid>);

-- Force kill (if cancel doesn't work)
SELECT pg_terminate_backend(<pid>);
```

---

## 8. Documentation vs. Code Contradictions

| Location | Documentation Says | Code Does | Resolution |
|----------|-------------------|-----------|------------|
| `CLAUDE.md` "Services" | "Services require PostgreSQL (`psycopg2`)" | `news_store.py` and `news_feed.py` use SQLite | Document that news scraper system is SQLite-only; other services require PG |
| `CLAUDE.md` "Frontend" | "Next.js 14 app - In progress" | Frontend has 11 built pages, full design system | Update to reflect mature state |
| `CLAUDE.md` "Docker" | Lists only postgres, app, pgadmin | `docker-compose.yml` also includes Redis | Add Redis to documentation |
| `MEMORY.md` | "Gemini 3 Flash LLM" | `config/settings.py` defaults to Anthropic Claude | Clarify: was Gemini, now Claude Sonnet |
| `.env.example` line 49 | `AUTH_JWT_SECRET=change-me-to-a-stable-secret` | `config/settings.py` generates random if not set | Make `.env.example` comment louder about production requirement |
| `CLAUDE.md` port | "port 8084" | Correct, but Railway uses `PORT` env var | Document Railway port override behavior |

---

## 9. Security Hardening Summary

### OWASP Top 10 Coverage

| # | Category | Status | Key Finding |
|---|----------|--------|-------------|
| A01 | Broken Access Control | FAIL | IDOR in watchlists (SEC-02) |
| A02 | Cryptographic Failures | WARN | JWT secret defaults, localStorage tokens |
| A03 | Injection | PASS | Parameterized queries used consistently |
| A04 | Insecure Design | WARN | No rate limiting on auth endpoints |
| A05 | Security Misconfiguration | WARN | Debug mode flag, default passwords |
| A06 | Vulnerable Components | FAIL | pip-audit silenced in CI |
| A07 | Authentication Failures | WARN | No lockout, timing attacks possible |
| A08 | Software/Data Integrity | WARN | No SRI, no SBOM, no image signing |
| A09 | Security Logging Failures | WARN | Audit log exists but no monitoring |
| A10 | SSRF | PASS | News scraper internal URLs controlled |

### Middleware Stack Recommendation

Add to `app.py` middleware registration (order matters - first registered = outermost):

```python
# 1. Request ID (outermost - adds ID to all requests)
app.add_middleware(RequestIdMiddleware)

# 2. Security headers (HSTS, CSP, X-Frame-Options)
app.add_middleware(SecurityHeadersMiddleware)

# 3. CORS (already present)
app.add_middleware(CORSMiddleware, ...)

# 4. Rate limiting (after CORS, before auth)
app.add_middleware(RateLimitMiddleware, redis_url=REDIS_URL)

# 5. Request logging (innermost - logs with request ID)
app.add_middleware(RequestLoggingMiddleware)
```

---

## 10. Production Readiness Scorecard

| Category | Current Score | Target (30 days) | Target (90 days) |
|----------|:------------:|:----------------:|:----------------:|
| **Security** | 35/100 | 70/100 | 85/100 |
| **Reliability** | 55/100 | 75/100 | 90/100 |
| **Performance** | 50/100 | 65/100 | 80/100 |
| **Observability** | 20/100 | 60/100 | 80/100 |
| **CI/CD** | 65/100 | 80/100 | 90/100 |
| **Documentation** | 70/100 | 80/100 | 85/100 |
| **Testing** | 60/100 | 75/100 | 85/100 |
| **Overall** | **50/100** | **72/100** | **85/100** |

**Go/No-Go Decision:** NO-GO for production until P0 items (Section 3) are resolved. Estimated timeline to production-ready: **2-3 weeks** for critical items, **6-8 weeks** for full hardening.

---

*Generated by production readiness audit on 2026-02-13. This document should be reviewed and updated after each major milestone is completed.*
