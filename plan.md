# Monitoring & Observability Implementation Plan

## Overview
Implement 6 monitoring/observability tasks for the Ra'd AI frontend: Sentry integration, enhanced error boundaries, Web Vitals tracking, metrics collection, SWR middleware for metrics, and monitoring configuration.

## Phase 1: Foundational

### Task 1 - Sentry Integration
**Files to create:**
- `frontend/sentry.client.config.ts` - Client-side Sentry init with DSN from env, tracesSampleRate 0.1, replaysSessionSampleRate 0.1, browser tracing integration, filter ResizeObserver and cancelled fetch errors
- `frontend/sentry.server.config.ts` - Server-side Sentry init, tracesSampleRate 0.2
- `frontend/sentry.edge.config.ts` - Edge runtime Sentry init

**Package changes:** Add `@sentry/nextjs` to package.json dependencies

**Note:** next.config.mjs needs withSentryConfig wrapper. The bundle analyzer is outermost, Sentry wraps the config object. Will NOT modify next.config.mjs directly (security-headers teammate coordinates that), but will document the needed wrapper in a comment at the top of sentry.client.config.ts.

### Task 2 - Global Error Boundary Enhancement
**Files to create:**
- `frontend/src/components/monitoring/ErrorBoundary.tsx` - Enhanced error boundary that:
  - Reports errors to Sentry via `@sentry/nextjs` captureException
  - Dark-gold themed UI consistent with existing error.tsx
  - "Report Issue" button (captures feedback via Sentry)
  - "Try Again" reset button
  - Accepts optional fallback prop
- `frontend/src/components/monitoring/ErrorFallback.tsx` - Default fallback component:
  - Sanitized error message display (strips stack traces in production)
  - "Reload" button (window.location.reload)
  - "Go Home" link (navigate to /)
  - Dark-gold styled, consistent with design system

**Approach:** These are NEW components in the `monitoring/` directory. The existing `error-boundary.tsx` in `common/` is untouched per the DO NOT MODIFY constraint.

## Phase 2: Integration

### Task 3 - Web Vitals Tracking
**Files to create:**
- `frontend/src/lib/monitoring/web-vitals.ts`
  - Track LCP, FID, CLS, TTFB, FCP, INP using `web-vitals` library
  - Report each metric to Sentry as custom measurement
  - Store latest values in module-level Map for admin display access
  - Export `initWebVitals()` function + `getWebVitalsData()` accessor
  - Document that `initWebVitals()` should be called in root layout (will NOT modify layout.tsx)

**Package changes:** Add `web-vitals` to package.json dependencies

### Task 4 - Frontend Metrics Dashboard Data
**Files to create:**
- `frontend/src/lib/monitoring/metrics-collector.ts`
  - `FrontendMetrics` type: pageViews, apiCallDurations, errorCount, webVitals, sessionDuration
  - `FrontendMetricsCollector` class with methods:
    - `trackPageView(path: string)`
    - `trackApiCall(url: string, duration: number, status: number)`
    - `trackError(error: Error, context?: string)`
    - `getMetrics(): FrontendMetrics`
  - Session-scoped (in-memory), no persistence
  - Export singleton `metricsCollector`

## Phase 3: Final

### Task 5 - SWR Middleware for Metrics
**Files to create:**
- `frontend/src/lib/monitoring/swr-middleware.ts`
  - SWR `Middleware` type-compatible middleware function
  - Track API response times and report to `metricsCollector`
  - Track error rates
  - Track cache hit/miss (compare fetcher calls vs cached returns)
  - Read `X-RateLimit-Remaining` header, warn via console when < 5
  - Compatible with existing SWR configuration (ChartCacheProvider uses SWRConfig)

### Task 6 - Monitoring Configuration
**Files to create:**
- `frontend/src/config/monitoring.ts`
  - `MonitoringConfig` type with: sentryDsn, tracesSampleRate, enableWebVitals, enableApiMetrics, metricsReportInterval
  - Read from `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_ENABLE_MONITORING`
  - Export `getMonitoringConfig()` function
- `frontend/src/lib/monitoring/index.ts`
  - Re-export all monitoring utilities: web-vitals, metrics-collector, swr-middleware

## Coordination Notes
- Will message security-headers teammate about CSP exception for `https://*.sentry.io` in connect-src
- Will NOT modify: backend files, layout.tsx, existing common/ components, next.config.mjs
- All files use TypeScript strict mode
- All UI uses dark-gold theme tokens

## Verification
- Run `npx vitest run` in frontend directory to ensure existing 67 tests still pass
- Verify TypeScript compilation with no errors
