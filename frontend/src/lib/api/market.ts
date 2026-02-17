/**
 * Market analytics API types and functions.
 */

import { request, qs } from './client-base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketMover {
  ticker: string;
  company_name_ar: string;
  company_name_en: string;
  current_price: number;
  previous_close: number;
  change_pct: number;
  volume: number;
  sector: string;
}

export interface MarketSummary {
  total_market_cap: number;
  total_volume: number;
  gainers_count: number;
  losers_count: number;
  unchanged_count: number;
  top_gainers: MarketMover[];
  top_losers: MarketMover[];
}

export interface SectorPerformance {
  sector: string;
  avg_change_pct: number;
  total_volume: number;
  total_market_cap: number;
  company_count: number;
  gainers: number;
  losers: number;
}

export interface HeatmapItem {
  ticker: string;
  name: string;
  sector: string;
  market_cap: number;
  change_pct: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export function getMarketMovers(
  type: 'gainers' | 'losers',
  limit?: number,
  signal?: AbortSignal,
): Promise<MarketMover[]> {
  return request(`/api/v1/market/movers${qs({ type, limit })}`, undefined, undefined, signal);
}

export function getMarketSummary(signal?: AbortSignal): Promise<MarketSummary> {
  return request('/api/v1/market/summary', undefined, undefined, signal);
}

export function getSectorPerformance(signal?: AbortSignal): Promise<SectorPerformance[]> {
  return request('/api/v1/market/sectors', undefined, undefined, signal);
}

export function getMarketHeatmap(signal?: AbortSignal): Promise<HeatmapItem[]> {
  return request('/api/v1/market/heatmap', undefined, undefined, signal);
}

// ---------------------------------------------------------------------------
// Market Overview (World 360)
// ---------------------------------------------------------------------------

export interface MarketOverviewInstrument {
  key: string;
  ticker: string;
  nameAr: string;
  nameEn: string;
  category: string;
  value: number | null;
  change: number | null;
  sparkline: number[];
  historical_closes: number[];
  currency: string;
  error?: string | null;
}

export interface MarketOverviewResponse {
  instruments: MarketOverviewInstrument[];
  timestamp: string;
  count: number;
}

export function getMarketOverview(signal?: AbortSignal): Promise<MarketOverviewResponse> {
  return request('/api/v1/market-overview', undefined, undefined, signal);
}
