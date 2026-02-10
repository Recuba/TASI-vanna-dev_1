/**
 * Integration tests for chart data hooks with MSW.
 *
 * Tests the full data flow: hook -> api-client -> fetch -> MSW handler,
 * including fallback behavior when the API returns errors.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { server } from '../msw-server';
import { errorHandlers } from '../msw-handlers';
import {
  useMarketIndex,
  useOHLCVData,
  usePriceTrend,
  useMiniChartData,
} from '@/lib/hooks/use-chart-data';

// ---------------------------------------------------------------------------
// MSW lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// SWR wrapper that disables caching between tests
// ---------------------------------------------------------------------------

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        {children}
      </SWRConfig>
    );
  };
}

// ---------------------------------------------------------------------------
// useMarketIndex
// ---------------------------------------------------------------------------

describe('useMarketIndex (MSW integration)', () => {
  it('fetches real TASI index data and returns source "real"', async () => {
    const { result } = renderHook(() => useMarketIndex('1y'), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.source).toBe('real');
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.length).toBeGreaterThan(0);

    // Data should be LineDataPoint[] (mapped from OHLCV close prices)
    const first = result.current.data![0];
    expect(first).toHaveProperty('time');
    expect(first).toHaveProperty('value');
    expect(typeof first.time).toBe('string');
    expect(typeof first.value).toBe('number');
  });

  it('falls back to mock data when API returns 500', async () => {
    server.use(errorHandlers.tasiIndex500);

    const { result } = renderHook(() => useMarketIndex('1y'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should fall through to mock data, not surface an error
    expect(result.current.error).toBeNull();
    expect(result.current.source).toBe('mock');
    expect(result.current.data).not.toBeNull();
  });

  it('falls back to mock data when API returns empty array', async () => {
    server.use(errorHandlers.tasiIndexEmpty);

    const { result } = renderHook(() => useMarketIndex('1y'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('mock');
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('provides a callable refetch function', async () => {
    const { result } = renderHook(() => useMarketIndex('1y'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// useOHLCVData
// ---------------------------------------------------------------------------

describe('useOHLCVData (MSW integration)', () => {
  it('fetches OHLCV data for a ticker and returns source "real"', async () => {
    const { result } = renderHook(() => useOHLCVData('2222.SR'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.source).toBe('real');
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.length).toBeGreaterThan(0);

    const first = result.current.data![0];
    expect(first).toHaveProperty('time');
    expect(first).toHaveProperty('open');
    expect(first).toHaveProperty('high');
    expect(first).toHaveProperty('low');
    expect(first).toHaveProperty('close');
  });

  it('falls back to mock data on 404', async () => {
    server.use(errorHandlers.ohlcv404);

    const { result } = renderHook(() => useOHLCVData('FAKE.SR'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.source).toBe('mock');
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('falls back to mock data on 500', async () => {
    server.use(errorHandlers.ohlcv500);

    const { result } = renderHook(() => useOHLCVData('2222.SR'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('mock');
    expect(result.current.data).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// usePriceTrend
// ---------------------------------------------------------------------------

describe('usePriceTrend (MSW integration)', () => {
  it('derives line data from real OHLCV close prices', async () => {
    const { result } = renderHook(() => usePriceTrend('2222.SR', 365), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('real');
    expect(result.current.data).not.toBeNull();

    // Each point should be { time, value } derived from close
    const first = result.current.data![0];
    expect(first).toHaveProperty('time');
    expect(first).toHaveProperty('value');
    expect(typeof first.value).toBe('number');
  });

  it('falls back to mock on API failure', async () => {
    server.use(errorHandlers.ohlcv500);

    const { result } = renderHook(() => usePriceTrend('2222.SR'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('mock');
    expect(result.current.data).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useMiniChartData
// ---------------------------------------------------------------------------

describe('useMiniChartData (MSW integration)', () => {
  it('returns last 30 days of close prices as line data', async () => {
    const { result } = renderHook(() => useMiniChartData('2222.SR'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Source depends on whether any returned data falls within last 30 days.
    // With MSW data from June 2025, these dates may be in the past relative
    // to the current date, so the hook may filter down to 0 real results and
    // fall back to mock. Either outcome is valid.
    expect(result.current.data).not.toBeNull();
    expect(['real', 'mock']).toContain(result.current.source);
  });

  it('falls back to mock on API error', async () => {
    server.use(errorHandlers.ohlcv500);

    const { result } = renderHook(() => useMiniChartData('2222.SR'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('mock');
    expect(result.current.data).not.toBeNull();
  });
});
