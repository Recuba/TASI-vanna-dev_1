'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getNews,
  getNewsFeed,
  getNewsArticle,
  searchNewsFeed,
  getNewsSources,
  getReports,
  getEntities,
  getEntityDetail,
  getSectors,
  getAnnouncements,
  getMarketMovers,
  getMarketSummary,
  getSectorPerformance,
  getMarketHeatmap,
  getStockDividends,
  getStockFinancialSummary,
  getStockFinancials,
  compareStocks,
  getBatchQuotes,
  type NewsListResponse,
  type NewsFeedResponse,
  type NewsFeedItem,
  type ReportListResponse,
  type EntityListResponse,
  type CompanyDetail,
  type SectorInfo,
  type AnnouncementListResponse,
  type NewsSourcesResponse,
  type MarketMover,
  type MarketSummary,
  type SectorPerformance,
  type HeatmapItem,
  type StockDividends,
  type FinancialSummary,
  type FinancialStatement,
  type StockComparison,
  type BatchQuote,
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
  const mountedRef = useRef(false);

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

export function useNews(params?: { page?: number; page_size?: number; language?: string }) {
  return useAsync<NewsListResponse>(
    () => getNews(params),
    [params?.page, params?.page_size, params?.language],
  );
}

export function useReports(params?: {
  page?: number;
  page_size?: number;
  recommendation?: string;
  report_type?: string;
}) {
  return useAsync<ReportListResponse>(
    () => getReports(params),
    [params?.page, params?.page_size, params?.recommendation, params?.report_type],
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
  page?: number;
  page_size?: number;
  ticker?: string;
  category?: string;
}) {
  return useAsync<AnnouncementListResponse>(
    () => getAnnouncements(params),
    [params?.page, params?.page_size, params?.ticker, params?.category],
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

export function useNewsFeed(params?: { limit?: number; offset?: number; source?: string }) {
  return useAsync<NewsFeedResponse>(
    () => getNewsFeed(params),
    [params?.limit, params?.offset, params?.source],
    300000,
  );
}

export function useNewsArticle(id: string) {
  return useAsync<NewsFeedItem>(() => getNewsArticle(id), [id]);
}

export function useNewsSearch(params: { q: string; limit?: number; offset?: number }) {
  return useAsync<NewsFeedResponse>(
    () => searchNewsFeed(params),
    [params.q, params.limit, params.offset],
  );
}

export function useNewsSources() {
  return useAsync<NewsSourcesResponse>(() => getNewsSources(), []);
}

// ---------------------------------------------------------------------------
// Market Analytics hooks
// ---------------------------------------------------------------------------

/** Top gainers or losers with 30-second auto-refresh */
export function useMarketMovers(type: 'gainers' | 'losers', limit?: number) {
  return useAsync<MarketMover[]>(
    () => getMarketMovers(type, limit),
    [type, limit],
    30_000,
  );
}

/** Full market summary with 30-second auto-refresh */
export function useMarketSummary() {
  return useAsync<MarketSummary>(() => getMarketSummary(), [], 30_000);
}

/** Sector performance breakdown */
export function useSectorPerformance() {
  return useAsync<SectorPerformance[]>(() => getSectorPerformance(), []);
}

/** Market heatmap data */
export function useMarketHeatmap() {
  return useAsync<HeatmapItem[]>(() => getMarketHeatmap(), []);
}

// ---------------------------------------------------------------------------
// Stock data hooks
// ---------------------------------------------------------------------------

/** Dividend data for a single stock */
export function useStockDividends(ticker: string) {
  return useAsync<StockDividends>(() => getStockDividends(ticker), [ticker]);
}

/** Financial summary for a single stock */
export function useStockFinancialSummary(ticker: string) {
  return useAsync<FinancialSummary>(
    () => getStockFinancialSummary(ticker),
    [ticker],
  );
}

/** Financial statements for a single stock */
export function useStockFinancials(
  ticker: string,
  statement?: string,
  period_type?: string,
) {
  return useAsync<FinancialStatement[]>(
    () => getStockFinancials(ticker, { statement, period_type }),
    [ticker, statement, period_type],
  );
}

/** Compare multiple stocks across metrics */
export function useStockComparison(tickers: string[], metrics: string[]) {
  return useAsync<StockComparison>(
    () => compareStocks(tickers, metrics),
    [tickers.join(','), metrics.join(',')],
  );
}

/** Batch quotes for multiple tickers with 30-second auto-refresh */
export function useBatchQuotes(tickers: string[]) {
  return useAsync<BatchQuote[]>(
    () => getBatchQuotes(tickers),
    [tickers.join(',')],
    30_000,
  );
}
