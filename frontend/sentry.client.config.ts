// Sentry client-side configuration for Next.js
//
// IMPORTANT: next.config.mjs must wrap the config with withSentryConfig:
//   import { withSentryConfig } from '@sentry/nextjs';
//   export default analyze(withSentryConfig(nextConfig, { /* sentry options */ }));
// The bundle analyzer should remain the outermost wrapper.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  beforeSend(event) {
    const message = event.exception?.values?.[0]?.value ?? '';

    // Filter out noisy ResizeObserver errors
    if (message.includes('ResizeObserver loop')) {
      return null;
    }

    // Filter out cancelled fetch requests (user navigated away)
    if (
      message.includes('The operation was aborted') ||
      message.includes('AbortError') ||
      message.includes('The user aborted a request')
    ) {
      return null;
    }

    // Strip auth headers so JWT tokens are never sent to Sentry
    if (event.request?.headers) {
      delete event.request.headers['Authorization'];
      delete event.request.headers['authorization'];
    }

    // Strip token values from extra context (e.g., localStorage snapshots)
    if (event.extra) {
      const sensitiveKeys = ['token', 'accessToken', 'refreshToken', 'jwt'];
      for (const key of sensitiveKeys) {
        if (key in event.extra) {
          event.extra[key] = '[REDACTED]';
        }
      }
    }

    return event;
  },

  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
