'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { RAW_INSTRUMENTS, INSTRUMENT_META } from '@/lib/market-graph/data';
import type { RawInstrument } from '@/lib/market-graph/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by GET /api/v1/market-overview */
interface MarketOverviewResponse {
  instruments: Array<{
    key: string;
    value: number;
    change: number;
    sparkline: number[];
    historical_closes?: number[];
  }>;
  timestamp: string;
}

export interface UseMarketDataReturn {
  instruments: RawInstrument[];
  /** key -> 90 daily closes (for improved correlation calculations) */
  historicalData: Record<string, number[]>;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  /** true if using live data, false if using static fallback */
  isLive: boolean;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 60_000; // 60 seconds

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMarketDataLive(): UseMarketDataReturn {
  const [instruments, setInstruments] = useState<RawInstrument[]>(RAW_INSTRUMENTS);
  const [historicalData, setHistoricalData] = useState<Record<string, number[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(() => {
    // Abort any in-flight request
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/v1/market-overview`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return res.json() as Promise<MarketOverviewResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;

        // Transform API response into RawInstrument[], filtering out failed instruments
        const liveInstruments: RawInstrument[] = data.instruments
          .filter((item) => item.value != null && item.change != null)
          .map((item) => {
            const meta = INSTRUMENT_META[item.key];
            return {
              key: item.key,
              nameAr: meta?.nameAr ?? item.key,
              nameEn: meta?.nameEn ?? item.key,
              value: item.value,
              change: item.change,
              category: meta?.category ?? 'Commodity',
              sparkline: item.sparkline ?? [],
            };
          });

        // Build historical data map
        const historical: Record<string, number[]> = {};
        for (const item of data.instruments) {
          if (item.historical_closes?.length) {
            historical[item.key] = item.historical_closes;
          }
        }

        setInstruments(liveInstruments);
        setHistoricalData(historical);
        setLastUpdated(new Date(data.timestamp));
        setIsLive(true);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (controller.signal.aborted) return;

        // Fall back to static data
        setInstruments(RAW_INSTRUMENTS);
        setHistoricalData({});
        setIsLive(false);
        setError((err as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchData();
    return () => {
      controllerRef.current?.abort();
    };
  }, [fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData]);

  return {
    instruments,
    historicalData,
    isLoading,
    error,
    lastUpdated,
    isLive,
    refetch: fetchData,
  };
}
