'use client';

import useSWR, { type SWRConfiguration, type KeyedMutator } from 'swr';
import { metricsMiddleware } from '@/lib/monitoring/swr-middleware';

// ---------------------------------------------------------------------------
// Default SWR config for chart data
// ---------------------------------------------------------------------------

export const chartCacheConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 60_000,       // 60s dedup window
  refreshInterval: 360_000,       // 6min — offset from backend 5min TTL to avoid always hitting cache
  errorRetryCount: 3,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  use: [metricsMiddleware],        // collect API timing + error-rate metrics
};

// ---------------------------------------------------------------------------
// Cache key factories
// ---------------------------------------------------------------------------

export const chartKeys = {
  ohlcv: (ticker: string) => ['ohlcv', ticker] as const,
  stockOhlcv: (ticker: string, period: string) => ['stockOhlcv', ticker, period] as const,
  priceTrend: (ticker: string, days: number) => ['priceTrend', ticker, days] as const,
  marketIndex: (period: string) => ['marketIndex', period] as const,
  tasiOhlcv: (period: string) => ['tasiOhlcv', period] as const,
  miniChart: (ticker: string) => ['miniChart', ticker] as const,
};

// ---------------------------------------------------------------------------
// Generic SWR hook wrapper for chart data
// ---------------------------------------------------------------------------

export interface ChartCacheResult<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<T>;
}

/**
 * Wraps SWR with chart-specific defaults.
 * `key` should come from `chartKeys.*`.
 * `fetcher` is the async function that returns data.
 */
export function useChartCache<T>(
  key: readonly unknown[] | null,
  fetcher: () => Promise<T>,
  config?: SWRConfiguration,
): ChartCacheResult<T> {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    key,
    fetcher,
    { ...chartCacheConfig, ...config },
  );

  return { data, error, isLoading, isValidating, mutate };
}
