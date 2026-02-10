import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useState, useEffect } from 'react';

// Mock the api-client module
const mockGetTasiIndex = vi.fn();
vi.mock('@/lib/api-client', () => ({
  getTasiIndex: (...args: unknown[]) => mockGetTasiIndex(...args),
  getOHLCVData: vi.fn(),
}));

// Mock chart-utils
vi.mock('@/lib/chart-utils', () => ({
  generateMockOHLCV: vi.fn().mockReturnValue([]),
  generateMockPriceTrend: vi.fn().mockReturnValue([
    { time: '2025-01-01', value: 100 },
    { time: '2025-01-02', value: 101 },
    { time: '2025-01-03', value: 102 },
  ]),
}));

// Mock useChartCache with a React-state-aware implementation that triggers re-renders
vi.mock('@/lib/chart-cache', () => ({
  chartCacheConfig: {},
  chartKeys: {
    ohlcv: (ticker: string) => ['ohlcv', ticker],
    priceTrend: (ticker: string, days: number) => ['priceTrend', ticker, days],
    marketIndex: (period: string) => ['marketIndex', period],
    miniChart: (ticker: string) => ['miniChart', ticker],
  },
  useChartCache: <T,>(key: readonly unknown[] | null, fetcher: () => Promise<T>) => {
    const [data, setData] = useState<T | undefined>(undefined);
    const [error, setError] = useState<Error | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const mutate = vi.fn();

    useEffect(() => {
      if (!key) return;
      let cancelled = false;
      setIsLoading(true);
      fetcher()
        .then((result) => {
          if (!cancelled) {
            setData(result);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err);
            setIsLoading(false);
          }
        });
      return () => { cancelled = true; };
    }, [key ? JSON.stringify(key) : null]); // eslint-disable-line

    return { data, error, isLoading, isValidating: false, mutate };
  },
}));

// Import after mocks are set up
import { useMarketIndex } from '@/lib/hooks/use-chart-data';

describe('useMarketIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading true initially', () => {
    mockGetTasiIndex.mockImplementation(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useMarketIndex('1y'));
    expect(result.current.loading).toBe(true);
  });

  it('returns real data with source "real" on successful fetch', async () => {
    mockGetTasiIndex.mockResolvedValue({
      data: [
        { time: '2025-01-01', open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { time: '2025-01-02', open: 11, high: 13, low: 10, close: 12, volume: 200 },
      ],
      source: 'real',
      last_updated: '2025-01-02T12:00:00Z',
      symbol: '^TASI',
      period: '1y',
      count: 2,
    });

    const { result } = renderHook(() => useMarketIndex('1y'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.source).toBe('real');
    expect(result.current.error).toBeNull();
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0]).toEqual({ time: '2025-01-01', value: 11 });
    expect(result.current.data![1]).toEqual({ time: '2025-01-02', value: 12 });
  });

  it('falls back to mock data with source "mock" when fetch fails', async () => {
    mockGetTasiIndex.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMarketIndex('1y'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.source).toBe('mock');
    expect(result.current.error).toBeNull();
  });

  it('falls back to mock when API returns empty data', async () => {
    mockGetTasiIndex.mockResolvedValue({
      data: [],
      source: 'real',
      last_updated: null,
      symbol: '^TASI',
      period: '1y',
      count: 0,
    });

    const { result } = renderHook(() => useMarketIndex('1y'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('mock');
  });

  it('provides a refetch function', async () => {
    mockGetTasiIndex.mockResolvedValue({
      data: [{ time: '2025-01-01', open: 10, high: 12, low: 9, close: 11 }],
      source: 'real',
      last_updated: null,
      symbol: '^TASI',
      period: '1y',
      count: 1,
    });

    const { result } = renderHook(() => useMarketIndex('1y'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });
});
