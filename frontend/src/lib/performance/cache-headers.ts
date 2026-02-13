import type { SWRConfiguration } from 'swr';

/**
 * Pre-configured SWR options for different data freshness requirements.
 *
 * Usage:
 *   import { MARKET_DATA_SWR } from '@/lib/performance/cache-headers';
 *   const { data } = useSWR('/api/v1/tasi', fetcher, MARKET_DATA_SWR);
 */

/**
 * Real-time market data (TASI index, stock prices, order book).
 * Revalidates every 60 seconds and on window focus.
 */
export const MARKET_DATA_SWR: SWRConfiguration = {
  revalidateOnFocus: true,
  refreshInterval: 60_000,
  dedupingInterval: 5_000,
  errorRetryCount: 3,
};

/**
 * Mostly-static reference data (company metadata, sector lists, schema info).
 * Cached for 10 minutes, no focus revalidation.
 */
export const STATIC_DATA_SWR: SWRConfiguration = {
  revalidateOnFocus: false,
  refreshInterval: 0,
  dedupingInterval: 600_000,
  errorRetryCount: 2,
};

/**
 * User-specific data (watchlists, settings, preferences).
 * Revalidates on focus but not on interval (user-initiated changes).
 */
export const USER_DATA_SWR: SWRConfiguration = {
  revalidateOnFocus: true,
  refreshInterval: 0,
  dedupingInterval: 10_000,
  errorRetryCount: 3,
};
