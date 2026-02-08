'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getNews,
  getReports,
  getEntities,
  getEntityDetail,
  getSectors,
  getAnnouncements,
  type NewsListResponse,
  type ReportListResponse,
  type EntityListResponse,
  type CompanyDetail,
  type SectorInfo,
  type AnnouncementListResponse,
} from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Generic async-data hook
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
  autoRefreshMs?: number,
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

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefreshMs) return;
    const id = window.setInterval(execute, autoRefreshMs);
    return () => window.clearInterval(id);
  }, [execute, autoRefreshMs]);

  return { data, loading, error, refetch: execute };
}

// ---------------------------------------------------------------------------
// Domain hooks
// ---------------------------------------------------------------------------

export function useNews(params?: { limit?: number; offset?: number; language?: string }) {
  return useAsync<NewsListResponse>(
    () => getNews(params),
    [params?.limit, params?.offset, params?.language],
  );
}

export function useReports(params?: {
  limit?: number;
  offset?: number;
  recommendation?: string;
  report_type?: string;
}) {
  return useAsync<ReportListResponse>(
    () => getReports(params),
    [params?.limit, params?.offset, params?.recommendation, params?.report_type],
  );
}

export function useEntities(params?: {
  limit?: number;
  offset?: number;
  sector?: string;
  search?: string;
}) {
  return useAsync<EntityListResponse>(
    () => getEntities(params),
    [params?.limit, params?.offset, params?.sector, params?.search],
  );
}

export function useEntityDetail(ticker: string) {
  return useAsync<CompanyDetail>(() => getEntityDetail(ticker), [ticker]);
}

export function useSectors() {
  return useAsync<SectorInfo[]>(() => getSectors(), []);
}

export function useAnnouncements(params?: {
  limit?: number;
  offset?: number;
  ticker?: string;
  category?: string;
}) {
  return useAsync<AnnouncementListResponse>(
    () => getAnnouncements(params),
    [params?.limit, params?.offset, params?.ticker, params?.category],
  );
}

/** Market data with 30-second auto-refresh */
export function useMarketData(params?: { limit?: number; sector?: string }) {
  return useAsync<EntityListResponse>(
    () => getEntities({ limit: params?.limit ?? 50, sector: params?.sector }),
    [params?.limit, params?.sector],
    30_000,
  );
}

export function useStockDetail(ticker: string) {
  return useAsync<CompanyDetail>(() => getEntityDetail(ticker), [ticker]);
}
