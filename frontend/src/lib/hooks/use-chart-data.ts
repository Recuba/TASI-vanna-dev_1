'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOHLCVData } from '@/lib/api-client';
import {
  generateMockOHLCV,
  generateMockPriceTrend,
} from '@/lib/chart-utils';
import type { OHLCVData, LineDataPoint } from '@/lib/chart-utils';

// ---------------------------------------------------------------------------
// Generic async-data hook (same pattern as use-api.ts)
// ---------------------------------------------------------------------------

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (mountedRef.current) setData(result);
      })
      .catch((err) => {
        if (mountedRef.current) setError((err as Error).message);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    execute();
    return () => {
      mountedRef.current = false;
    };
  }, [execute]);

  return { data, loading, error, refetch: execute };
}

// ---------------------------------------------------------------------------
// Chart data hooks
// ---------------------------------------------------------------------------

/**
 * Fetch OHLCV data for a ticker.
 * Tries the backend API first; falls back to mock data on error/404.
 */
export function useOHLCVData(ticker: string): UseAsyncResult<OHLCVData[]> {
  return useAsync<OHLCVData[]>(
    async () => {
      try {
        const data = await getOHLCVData(ticker);
        if (data && data.length > 0) return data;
      } catch {
        // API unavailable or 404 -- fall through to mock
      }
      return generateMockOHLCV(ticker, 365);
    },
    [ticker],
  );
}

/**
 * Derive a price trend (close prices as LineDataPoint[]) from OHLCV data.
 */
export function usePriceTrend(
  ticker: string,
  days: number = 365,
): UseAsyncResult<LineDataPoint[]> {
  return useAsync<LineDataPoint[]>(
    async () => {
      try {
        const ohlcv = await getOHLCVData(ticker);
        if (ohlcv && ohlcv.length > 0) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          const cutoffStr = cutoff.toISOString().split('T')[0];
          return ohlcv
            .filter((d) => d.time >= cutoffStr)
            .map((d) => ({ time: d.time, value: d.close }));
        }
      } catch {
        // fall through to mock
      }
      const mock = generateMockOHLCV(ticker, days);
      return mock.map((d) => ({ time: d.time, value: d.close }));
    },
    [ticker, days],
  );
}

/**
 * Returns mock TASI index data. Will fetch from a real API in the future.
 */
export function useMarketIndex(): UseAsyncResult<LineDataPoint[]> {
  return useAsync<LineDataPoint[]>(
    async () => generateMockPriceTrend(365),
    [],
  );
}

/**
 * Returns last 30 days of close prices as LineDataPoint[].
 * Optimized for sparklines (minimal data).
 */
export function useMiniChartData(ticker: string): UseAsyncResult<LineDataPoint[]> {
  return useAsync<LineDataPoint[]>(
    async () => {
      try {
        const ohlcv = await getOHLCVData(ticker);
        if (ohlcv && ohlcv.length > 0) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 30);
          const cutoffStr = cutoff.toISOString().split('T')[0];
          return ohlcv
            .filter((d) => d.time >= cutoffStr)
            .map((d) => ({ time: d.time, value: d.close }));
        }
      } catch {
        // fall through to mock
      }
      const mock = generateMockOHLCV(ticker, 30);
      return mock.map((d) => ({ time: d.time, value: d.close }));
    },
    [ticker],
  );
}
