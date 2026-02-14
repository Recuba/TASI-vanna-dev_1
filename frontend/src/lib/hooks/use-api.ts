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
  type FinancialsResponse,
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
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
  autoRefreshMs?: number,
): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    fetcher(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) setError((err as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    execute();
    return () => {
      controllerRef.current?.abort();
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
    (signal) => getNews(params, signal),
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
    (signal) => getReports(params, signal),
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
    (signal) => getEntities(params, signal),
    [params?.limit, params?.offset, params?.sector, params?.search],
  );
}

export function useEntityDetail(ticker: string) {
  return useAsync<CompanyDetail>((signal) => getEntityDetail(ticker, signal), [ticker]);
}

export function useSectors() {
  return useAsync<SectorInfo[]>((signal) => getSectors(signal), []);
}

export function useAnnouncements(params?: {
  page?: number;
  page_size?: number;
  ticker?: string;
  category?: string;
}) {
  return useAsync<AnnouncementListResponse>(
    (signal) => getAnnouncements(params, signal),
    [params?.page, params?.page_size, params?.ticker, params?.category],
  );
}

/** Market data with 30-second auto-refresh */
export function useMarketData(params?: { limit?: number; sector?: string }) {
  return useAsync<EntityListResponse>(
    (signal) => getEntities({ limit: params?.limit ?? 50, sector: params?.sector }, signal),
    [params?.limit, params?.sector],
    30_000,
  );
}

export function useStockDetail(ticker: string) {
  return useAsync<CompanyDetail>((signal) => getEntityDetail(ticker, signal), [ticker]);
}

export function useNewsFeed(params?: {
  limit?: number;
  offset?: number;
  source?: string;
  sentiment?: string;
  date_from?: string;
  date_to?: string;
}) {
  return useAsync<NewsFeedResponse>(
    (signal) => getNewsFeed(params, signal),
    [params?.limit, params?.offset, params?.source, params?.sentiment, params?.date_from, params?.date_to],
  );
}

export function useNewsArticle(id: string) {
  return useAsync<NewsFeedItem>((signal) => getNewsArticle(id, signal), [id]);
}

export function useNewsSearch(params: { q: string; limit?: number; offset?: number }) {
  return useAsync<NewsFeedResponse>(
    (signal) => searchNewsFeed(params, signal),
    [params.q, params.limit, params.offset],
  );
}

export function useNewsSources() {
  return useAsync<NewsSourcesResponse>((signal) => getNewsSources(signal), []);
}

// ---------------------------------------------------------------------------
// Market Analytics hooks
// ---------------------------------------------------------------------------

/** Top gainers or losers with 30-second auto-refresh */
export function useMarketMovers(type: 'gainers' | 'losers', limit?: number) {
  return useAsync<MarketMover[]>(
    (signal) => getMarketMovers(type, limit, signal),
    [type, limit],
    30_000,
  );
}

/** Full market summary with 30-second auto-refresh */
export function useMarketSummary() {
  return useAsync<MarketSummary>((signal) => getMarketSummary(signal), [], 30_000);
}

/** Sector performance breakdown */
export function useSectorPerformance() {
  return useAsync<SectorPerformance[]>((signal) => getSectorPerformance(signal), []);
}

/** Market heatmap data */
export function useMarketHeatmap() {
  return useAsync<HeatmapItem[]>((signal) => getMarketHeatmap(signal), []);
}

// ---------------------------------------------------------------------------
// Stock data hooks
// ---------------------------------------------------------------------------

/** Dividend data for a single stock */
export function useStockDividends(ticker: string) {
  return useAsync<StockDividends>((signal) => getStockDividends(ticker, signal), [ticker]);
}

/** Financial summary for a single stock */
export function useStockFinancialSummary(ticker: string) {
  return useAsync<FinancialSummary>(
    (signal) => getStockFinancialSummary(ticker, signal),
    [ticker],
  );
}

/** Financial statements for a single stock */
export function useStockFinancials(
  ticker: string,
  statement?: string,
  period_type?: string,
) {
  return useAsync<FinancialsResponse>(
    (signal) => getStockFinancials(ticker, { statement, period_type }, signal),
    [ticker, statement, period_type],
  );
}

/** Compare multiple stocks across metrics */
export function useStockComparison(tickers: string[], metrics: string[]) {
  return useAsync<StockComparison>(
    (signal) => compareStocks(tickers, metrics, signal),
    [tickers.join(','), metrics.join(',')],
  );
}

/** Batch quotes for multiple tickers with 30-second auto-refresh */
export function useBatchQuotes(tickers: string[]) {
  return useAsync<BatchQuote[]>(
    (signal) => getBatchQuotes(tickers, signal),
    [tickers.join(',')],
    30_000,
  );
}
