/**
 * Centralized runtime configuration loaded from environment variables.
 *
 * All NEXT_PUBLIC_* values are inlined at build time. Defaults match
 * the development environment so the app works without any .env.local.
 */

/** Base URL for API requests (empty string = same-origin, proxied by Next.js rewrites). */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

/** Default timeout for API requests in milliseconds. */
export const API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? 15000);

/** Default cache TTL for cachedRequest() in milliseconds. */
export const API_CACHE_TTL_MS = Number(process.env.NEXT_PUBLIC_API_CACHE_TTL_MS ?? 60000);

/** Health check polling interval in milliseconds. */
export const HEALTH_POLL_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_HEALTH_POLL_INTERVAL_MS ?? 30000);
