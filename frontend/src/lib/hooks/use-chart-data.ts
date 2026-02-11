'use client';

import { useCallback } from 'react';
import { getOHLCVData, getTasiIndex } from '@/lib/api-client';
import {
  generateMockOHLCV,
  generateMockPriceTrend,
} from '@/lib/chart-utils';
import type { OHLCVData, LineDataPoint } from '@/lib/chart-utils';
import type { DataSource, ChartDataResult } from '@/components/charts/chart-types';
import { useChartCache, chartKeys } from '@/lib/chart-cache';
import { validateOHLCVData, validateTasiResponse } from '@/lib/validators';

// ---------------------------------------------------------------------------
// Internal type for fetched data with source tracking
// ---------------------------------------------------------------------------

interface SourcedData<T> {
  data: T;
  source: DataSource;
}

// ---------------------------------------------------------------------------
// Adapter: convert SWR result to ChartDataResult<T>
// ---------------------------------------------------------------------------

function toChartResult<T>(
  swrData: SourcedData<T> | undefined,
  isLoading: boolean,
  error: Error | undefined,
  mutate: () => void,
): ChartDataResult<T> {
  return {
    data: swrData?.data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    source: swrData?.source ?? null,
    refetch: mutate,
  };
}

// ---------------------------------------------------------------------------
// Dev-only mock fallback warning
// ---------------------------------------------------------------------------

function warnMockFallback(hook: string, detail: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[Ra'd Charts] Mock data fallback`, { hook, ...detail });
  }
}

// ---------------------------------------------------------------------------
// Chart data hooks
// ---------------------------------------------------------------------------

/**
 * Fetch OHLCV data for a ticker.
 * Tries the backend API first; falls back to mock data on error/404.
 */
export function useOHLCVData(ticker: string): ChartDataResult<OHLCVData[]> {
  const fetcher = useCallback(async (): Promise<SourcedData<OHLCVData[]>> => {
    try {
      const response = await getOHLCVData(ticker);
      const items = response.data;
      if (items && items.length > 0) {
        if (!validateOHLCVData(items)) {
          warnMockFallback('useOHLCVData', { ticker, reason: 'response failed OHLCV validation' });
        } else {
          return { data: items, source: (response.source as DataSource) ?? 'real' };
        }
      }
    } catch (err) {
      warnMockFallback('useOHLCVData', { ticker, reason: (err as Error).message ?? 'API fetch failed' });
    }
    return { data: generateMockOHLCV(ticker, 365), source: 'mock' };
  }, [ticker]);

  const { data, error, isLoading, mutate } = useChartCache(
    chartKeys.ohlcv(ticker),
    fetcher,
  );

  return toChartResult(data, isLoading, error, () => mutate());
}

/**
 * Fetch OHLCV data for a ticker with a specific period.
 * Used by StockOHLCVChart to support period switching (3M/6M/1Y/2Y/5Y).
 * Tries the backend API first; falls back to mock data on error/404.
 */
export function useStockOHLCV(ticker: string, period: string = '1y'): ChartDataResult<OHLCVData[]> {
  const fetcher = useCallback(async (): Promise<SourcedData<OHLCVData[]>> => {
    try {
      const response = await getOHLCVData(ticker, { period });
      const items = response.data;
      if (items && items.length > 0) {
        if (!validateOHLCVData(items)) {
          warnMockFallback('useStockOHLCV', { ticker, period, reason: 'response failed OHLCV validation' });
        } else {
          return { data: items, source: (response.source as DataSource) ?? 'real' };
        }
      }
    } catch (err) {
      warnMockFallback('useStockOHLCV', { ticker, period, reason: (err as Error).message ?? 'API fetch failed' });
    }
    return { data: generateMockOHLCV(ticker, 365), source: 'mock' };
  }, [ticker, period]);

  const { data, error, isLoading, mutate } = useChartCache(
    chartKeys.stockOhlcv(ticker, period),
    fetcher,
  );

  return toChartResult(data, isLoading, error, () => mutate());
}

/**
 * Derive a price trend (close prices as LineDataPoint[]) from OHLCV data.
 */
export function usePriceTrend(
  ticker: string,
  days: number = 365,
): ChartDataResult<LineDataPoint[]> {
  const fetcher = useCallback(async (): Promise<SourcedData<LineDataPoint[]>> => {
    try {
      const response = await getOHLCVData(ticker);
      const ohlcv = response.data;
      if (ohlcv && ohlcv.length > 0 && validateOHLCVData(ohlcv)) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        const data = ohlcv
          .filter((d) => d.time >= cutoffStr)
          .map((d) => ({ time: d.time, value: d.close }));
        return { data, source: (response.source as DataSource) ?? 'real' };
      }
      if (ohlcv && ohlcv.length > 0) {
        warnMockFallback('usePriceTrend', { ticker, days, reason: 'response failed OHLCV validation' });
      }
    } catch (err) {
      warnMockFallback('usePriceTrend', { ticker, days, reason: (err as Error).message ?? 'API fetch failed' });
    }
    const mock = generateMockOHLCV(ticker, days);
    return {
      data: mock.map((d) => ({ time: d.time, value: d.close })),
      source: 'mock',
    };
  }, [ticker, days]);

  const { data, error, isLoading, mutate } = useChartCache(
    chartKeys.priceTrend(ticker, days),
    fetcher,
  );

  return toChartResult(data, isLoading, error, () => mutate());
}

/**
 * Fetch TASI index OHLCV data for candlestick charts.
 * Falls back to mock data on error.
 */
export function useTasiOHLCV(period: string = '1y'): ChartDataResult<OHLCVData[]> {
  const fetcher = useCallback(async (): Promise<SourcedData<OHLCVData[]>> => {
    try {
      const response = await getTasiIndex(period);
      if (validateTasiResponse(response) && response.data.length > 0) {
        return { data: response.data, source: response.source as DataSource };
      }
      if (response?.data && response.data.length > 0) {
        warnMockFallback('useTasiOHLCV', { period, reason: 'response failed TASI validation' });
      }
    } catch (err) {
      warnMockFallback('useTasiOHLCV', { period, reason: (err as Error).message ?? 'API fetch failed' });
    }
    return { data: generateMockOHLCV('TASI', 365), source: 'mock' };
  }, [period]);

  const { data, error, isLoading, mutate } = useChartCache(
    chartKeys.tasiOhlcv(period),
    fetcher,
  );

  return toChartResult(data, isLoading, error, () => mutate());
}

/**
 * Fetch TASI index data from the real backend API.
 * Falls back to mock data on error.
 */
export function useMarketIndex(period: string = '1y'): ChartDataResult<LineDataPoint[]> {
  const fetcher = useCallback(async (): Promise<SourcedData<LineDataPoint[]>> => {
    try {
      const response = await getTasiIndex(period);
      if (validateTasiResponse(response) && response.data.length > 0) {
        const data = response.data.map((d) => ({
          time: d.time,
          value: d.close,
        }));
        return { data, source: response.source as DataSource };
      }
      if (response?.data && response.data.length > 0) {
        warnMockFallback('useMarketIndex', { period, reason: 'response failed TASI validation' });
      }
    } catch (err) {
      warnMockFallback('useMarketIndex', { period, reason: (err as Error).message ?? 'API fetch failed' });
    }
    return { data: generateMockPriceTrend(365), source: 'mock' };
  }, [period]);

  const { data, error, isLoading, mutate } = useChartCache(
    chartKeys.marketIndex(period),
    fetcher,
  );

  return toChartResult(data, isLoading, error, () => mutate());
}

/**
 * Returns last 30 days of close prices as LineDataPoint[].
 * Optimized for sparklines (minimal data).
 */
export function useMiniChartData(ticker: string): ChartDataResult<LineDataPoint[]> {
  const fetcher = useCallback(async (): Promise<SourcedData<LineDataPoint[]>> => {
    try {
      const response = await getOHLCVData(ticker);
      const ohlcv = response.data;
      if (ohlcv && ohlcv.length > 0 && validateOHLCVData(ohlcv)) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        const data = ohlcv
          .filter((d) => d.time >= cutoffStr)
          .map((d) => ({ time: d.time, value: d.close }));
        return { data, source: (response.source as DataSource) ?? 'real' };
      }
      if (ohlcv && ohlcv.length > 0) {
        warnMockFallback('useMiniChartData', { ticker, reason: 'response failed OHLCV validation' });
      }
    } catch (err) {
      warnMockFallback('useMiniChartData', { ticker, reason: (err as Error).message ?? 'API fetch failed' });
    }
    const mock = generateMockOHLCV(ticker, 30);
    return {
      data: mock.map((d) => ({ time: d.time, value: d.close })),
      source: 'mock',
    };
  }, [ticker]);

  const { data, error, isLoading, mutate } = useChartCache(
    chartKeys.miniChart(ticker),
    fetcher,
  );

  return toChartResult(data, isLoading, error, () => mutate());
}
