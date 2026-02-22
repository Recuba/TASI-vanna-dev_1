/**
 * Stock data API types and functions: OHLCV, dividends, financials, comparison, quotes.
 */

import { request, qs } from './client-base';
import type { OHLCVData } from '@/components/charts/chart-types';

// Re-export OHLCVData from its canonical location for consumers that
// previously imported it from api-client.
export type { OHLCVData } from '@/components/charts/chart-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockOHLCVResponse {
  data: OHLCVData[];
  source: 'real' | 'mock' | 'cached';
  last_updated: string | null;
  symbol: string;
  period: string;
  count: number;
}

export interface TasiIndexResponse {
  data: OHLCVData[];
  source: 'real' | 'mock' | 'cached';
  data_freshness: 'real-time' | 'cached' | 'stale' | 'mock';
  cache_age_seconds: number | null;
  last_updated: string | null;
  symbol: string;
  period: string;
  count: number;
}

export interface StockDividends {
  ticker: string;
  dividend_rate: number | null;
  dividend_yield: number | null;
  payout_ratio: number | null;
  five_year_avg_dividend_yield: number | null;
  ex_dividend_date: string | null;
  last_dividend_value: number | null;
  last_dividend_date: string | null;
  trailing_annual_dividend_rate: number | null;
  trailing_annual_dividend_yield: number | null;
}

export interface FinancialSummary {
  ticker: string;
  total_revenue: number | null;
  revenue_per_share: number | null;
  total_cash: number | null;
  total_debt: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  quick_ratio: number | null;
  free_cashflow: number | null;
  ebitda: number | null;
  gross_profit: number | null;
  operating_cashflow: number | null;
}

export interface FinancialPeriod {
  period_type: string | null;
  period_index: number | null;
  period_date: string | null;
  data: Record<string, string | number | null>;
}

export interface FinancialsResponse {
  ticker: string;
  statement: string;
  periods: FinancialPeriod[];
}

/** @deprecated Use FinancialPeriod instead */
export interface FinancialStatement {
  period_type: string;
  period_index: number;
  period_date: string;
  [key: string]: string | number | null;
}

export interface StockComparison {
  tickers: Array<{ ticker: string; name: string; metrics: Record<string, number | null> }>;
}

export interface BatchQuote {
  ticker: string;
  /** Company short name (backend may return as "name" or "short_name"). */
  name: string;
  short_name?: string | null;
  current_price: number;
  previous_close: number;
  change_pct: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export async function getOHLCVData(
  ticker: string,
  params?: { period?: string },
  signal?: AbortSignal,
): Promise<StockOHLCVResponse> {
  return request(`/api/v1/charts/${encodeURIComponent(ticker)}/ohlcv${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getTasiIndex(period: string = '1y', signal?: AbortSignal): Promise<TasiIndexResponse> {
  return request(`/api/v1/charts/tasi/index${qs({ period })}`, undefined, undefined, signal);
}

export function getStockDividends(ticker: string, signal?: AbortSignal): Promise<StockDividends> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/dividends`, undefined, undefined, signal);
}

export function getStockFinancialSummary(ticker: string, signal?: AbortSignal): Promise<FinancialSummary> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/summary`, undefined, undefined, signal);
}

export function getStockFinancials(
  ticker: string,
  params?: { statement?: string; period_type?: string },
  signal?: AbortSignal,
): Promise<FinancialsResponse> {
  return request(
    `/api/v1/stocks/${encodeURIComponent(ticker)}/financials${qs(params ?? {})}`,
    undefined, undefined, signal,
  );
}

export function compareStocks(
  tickers: string[],
  metrics: string[],
  signal?: AbortSignal,
): Promise<StockComparison> {
  return request(`/api/v1/stocks/compare${qs({ tickers: tickers.join(','), metrics: metrics.join(',') })}`, undefined, undefined, signal);
}

export function getBatchQuotes(tickers: string[], signal?: AbortSignal): Promise<BatchQuote[]> {
  return request(`/api/v1/stocks/quotes${qs({ tickers: tickers.join(',') })}`, undefined, undefined, signal);
}

// ---------------------------------------------------------------------------
// Stock Peers
// ---------------------------------------------------------------------------

export interface PeerItem {
  ticker: string;
  short_name: string | null;
  sector: string | null;
  current_price: number | null;
  market_cap: number | null;
  change_pct: number | null;
  trailing_pe: number | null;
  price_to_book: number | null;
  roe: number | null;
  revenue_growth: number | null;
  dividend_yield: number | null;
}

export interface PeersResponse {
  ticker: string;
  sector: string | null;
  peers: PeerItem[];
  count: number;
}

export function getStockPeers(ticker: string, limit?: number, signal?: AbortSignal): Promise<PeersResponse> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/peers${qs({ limit })}`, undefined, undefined, signal);
}

// ---------------------------------------------------------------------------
// Stock Ownership
// ---------------------------------------------------------------------------

export interface OwnershipData {
  ticker: string;
  pct_held_insiders: number | null;
  pct_held_institutions: number | null;
  float_shares: number | null;
  shares_outstanding: number | null;
}

export function getStockOwnership(ticker: string, signal?: AbortSignal): Promise<OwnershipData> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/ownership`, undefined, undefined, signal);
}

// ---------------------------------------------------------------------------
// Financial Trend
// ---------------------------------------------------------------------------

export interface TrendPeriod {
  date: string | null;
  value: number | null;
}

export interface TrendMetric {
  name: string;
  periods: TrendPeriod[];
}

export interface FinancialTrendResponse {
  ticker: string;
  metrics: TrendMetric[];
}

export function getFinancialTrend(ticker: string, signal?: AbortSignal): Promise<FinancialTrendResponse> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/financials/trend`, undefined, undefined, signal);
}
