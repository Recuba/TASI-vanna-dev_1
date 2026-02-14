/**
 * SWR middleware for tracking API metrics.
 * Measures response times, error rates, and cache behavior.
 * Reports to metricsCollector singleton.
 *
 * Usage: Add to SWR global config or per-hook:
 *   <SWRConfig value={{ use: [metricsMiddleware] }}>
 */

import type { Middleware } from 'swr';
import { metricsCollector } from './metrics-collector';

const RATE_LIMIT_WARN_THRESHOLD = 5;

/* eslint-disable @typescript-eslint/no-explicit-any */
export const metricsMiddleware: Middleware = (useSWRNext: any) => {
  return (key: any, fetcher: any, config: any) => {
    const wrappedFetcher = fetcher
      ? (...args: unknown[]) => {
          const start = performance.now();
          const url = typeof key === 'string' ? key : String(key);

          const result = (fetcher as (...a: unknown[]) => Promise<unknown>)(...args);

          if (result && typeof result === 'object' && 'then' in result) {
            return (result as Promise<unknown>).then(
              (data) => {
                const duration = performance.now() - start;
                metricsCollector.trackApiCall(url, duration, 200);
                return data;
              },
              (error) => {
                const duration = performance.now() - start;
                const status = error?.status ?? 500;
                metricsCollector.trackApiCall(url, duration, status);

                // Check rate limit headers if available
                if (error?.headers) {
                  const remaining = error.headers.get?.('X-RateLimit-Remaining');
                  if (
                    remaining !== null &&
                    remaining !== undefined &&
                    parseInt(String(remaining), 10) < RATE_LIMIT_WARN_THRESHOLD
                  ) {
                    console.warn(
                      `[Ra'd AI] Rate limit approaching: ${remaining} requests remaining for ${url}`,
                    );
                  }
                }

                throw error;
              },
            );
          }

          return result;
        }
      : fetcher;

    return useSWRNext(key, wrappedFetcher, config);
  };
};
