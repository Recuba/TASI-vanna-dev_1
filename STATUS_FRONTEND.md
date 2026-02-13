# STATUS_FRONTEND.md

> Cross-terminal coordination file for the Ra'd AI frontend enhancement sprint.
> Last updated: 2026-02-13

---

## Completed

| Task | Owner | Description |
|------|-------|-------------|
| #1 / #9 Security Headers | security-headers | CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy via `next.config.mjs`. Host validation middleware (`middleware.ts`). X-Request-ID propagation. |
| #8 Documentation | frontend-docs | STATUS_FRONTEND.md, OpenAPI spec, Swagger UI page, PRIVACY.md, SLA.md, .env.local.example |

## In Progress

| Task | Owner | Description |
|------|-------|-------------|
| #2 | monitoring-obs | Sentry integration, error boundaries, Web Vitals, metrics collector, SWR middleware |
| #3 | frontend-perf | Bundle analysis, lazy loading, image optimization, CDN prep |
| #4 | rbac-auth | RBAC auth: roles, permissions, route guards, session management |
| #5 | ux-history | Query history, saved queries, export, suggestions |
| #6 | ux-visualize | Data visualization components, admin dashboard, responsive design |
| #7 | frontend-tester | Playwright E2E tests, load tests, security scan config |

---

## New Environment Variables

All `NEXT_PUBLIC_*` environment variables introduced or used by the frontend:

| Variable | Source | Default | Required | Description |
|----------|--------|---------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | next.config.mjs | `http://localhost:8084` | Yes | Backend API URL for Next.js rewrites proxy |
| `NEXT_PUBLIC_ALLOWED_HOSTS` | middleware.ts | `localhost,localhost:3000,raid-ai-app-production.up.railway.app` | No | Comma-separated allowed hosts for host validation |
| `NEXT_PUBLIC_CSP_REPORT_URI` | next.config.mjs | (empty) | No | CSP violation report URI |
| `NEXT_PUBLIC_SENTRY_DSN` | @sentry/nextjs | (empty) | No | Sentry DSN for error tracking |
| `NEXT_PUBLIC_ENABLE_MONITORING` | monitoring-obs | `false` | No | Enable client-side monitoring and Web Vitals reporting |
| `NEXT_PUBLIC_SESSION_TIMEOUT` | rbac-auth | `30` | No | Session timeout in minutes |
| `NEXT_PUBLIC_AUTH_REDIRECT` | rbac-auth | `/login` | No | Redirect URL for unauthenticated users |
| `BACKEND_URL` | next.config.mjs | (empty) | No | Server-side only backend URL; overrides NEXT_PUBLIC_API_URL if set |
| `ANALYZE` | @next/bundle-analyzer | `false` | No | Enable bundle analyzer (opens treemap after build) |

---

## New Dependencies

| Package | Version | Purpose | Added By |
|---------|---------|---------|----------|
| `swagger-ui-react` | ^5.x | Swagger UI for /api-docs page | frontend-docs |
| `@sentry/nextjs` | ^8.0.0 | Error tracking and performance monitoring | (already in package.json) |
| `web-vitals` | ^4.2.0 | Core Web Vitals measurement | (already in package.json) |
| `swr` | ^2.4.0 | Data fetching with caching | (already in package.json) |

---

## Interface Contracts for Terminal A (Backend)

### Security Headers (Frontend -> Client)

The Next.js frontend sets these response headers via `next.config.mjs`:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com https://s3.tradingview.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.anthropic.com https://*.railway.app wss://*.railway.app https://*.sentry.io; font-src 'self' data:; frame-src https://s3.tradingview.com https://www.tradingview.com; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

### CSRF Token

- Header name: `X-CSRF-Token`
- The frontend may send this header on mutating requests (POST, PATCH, DELETE).
- Backend should validate if CSRF protection is enabled.

### Expected Backend Response Headers

| Header | Source | Description |
|--------|--------|-------------|
| `X-Request-ID` | middleware/request_logging.py | Unique request identifier for tracing. Frontend middleware also generates this if not present. |
| `Retry-After` | middleware/rate_limit.py | Seconds until rate limit resets (sent with 429 responses) |

### Consumed Backend Endpoints

The frontend directly consumes these backend endpoints (proxied via Next.js rewrites):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Full health report (status, components, uptime) |
| `/health/live` | GET | Liveness probe (always 200 if running) |
| `/health/ready` | GET | Readiness probe (200 only if DB reachable) |
| `/api/auth/*` | POST/GET | Authentication (register, login, guest, refresh, me) |
| `/api/news` | GET | Paginated news articles |
| `/api/reports` | GET | Paginated technical reports |
| `/api/announcements` | GET | Paginated announcements |
| `/api/entities` | GET | Company listing and detail |
| `/api/watchlists` | GET/POST/PATCH/DELETE | User watchlist management |
| `/api/charts/*` | GET | Chart analytics (sector market cap, top companies, PE, dividends) |
| `/api/v1/charts/*/ohlcv` | GET | Stock OHLCV candlestick data |
| `/api/v1/charts/tasi/index` | GET | TASI index data |
| `/api/v1/news/*` | GET | News feed, search, sources |
| `/api/v1/market/*` | GET | Market movers, summary, sectors, heatmap |
| `/api/v1/stocks/*` | GET | Stock data (dividends, summary, financials, compare, quotes) |

### Next.js Rewrite Rules

All `/api/*` and `/health` requests are proxied to the backend:

```
/api/:path*  ->  ${BACKEND_URL}/api/:path*
/health      ->  ${BACKEND_URL}/health
```

SSE endpoints (`/api/vanna/*`) have buffering disabled via `X-Accel-Buffering: no`.

---

## Frontend Route Protection

| Route | Auth Required | Roles | Notes |
|-------|--------------|-------|-------|
| `/` | No | public | Landing / dashboard |
| `/login` | No | public | Login / register page |
| `/chat` | Yes (guest OK) | guest, user, admin | AI chat interface |
| `/market` | No | public | Market overview |
| `/news` | No | public | News feed |
| `/news/[id]` | No | public | News article detail |
| `/announcements` | No | public | Announcements list |
| `/reports` | No | public | Technical reports |
| `/charts` | No | public | Charts and TASI index |
| `/stock/[ticker]` | No | public | Individual stock detail |
| `/watchlist` | Yes | user, admin | User watchlists (requires login) |
| `/api-docs` | No | public | API documentation (Swagger UI) |

---

## Notes for Terminal A (Backend)

1. **CORS:** Frontend runs on `localhost:3000` (dev) and is proxied to backend on `localhost:8084`. Current CORS config in `.env.example` allows both origins. Production should include the Railway deployment URL.

2. **Rate Limiting:** Backend rate limiter returns `429` with `Retry-After` header. Frontend `ApiError` class handles this in `api-client.ts` with user-friendly "Too many requests" message.

3. **Health Endpoint Contract:** Frontend expects `/health` to return:
   ```json
   {
     "status": "healthy|degraded|unhealthy",
     "service": "raid-ai-tasi",
     "version": "1.0.0",
     "uptime_seconds": 123.4,
     "components": [{ "name": "...", "status": "...", "latency_ms": 1.2, "message": "" }]
   }
   ```

4. **Auth Token Format:** JWT Bearer token stored in `localStorage` as `rad-ai-token`. Sent via `Authorization: Bearer <token>` header on all API requests.

5. **Error Response Format:** Backend should return errors in the format:
   ```json
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "request_id": "uuid"
     }
   }
   ```

6. **SSE Streaming:** Chat endpoint uses Server-Sent Events. Next.js config disables buffering for `/api/vanna/*` paths.
