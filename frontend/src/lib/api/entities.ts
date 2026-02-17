/**
 * Entity/company API types and functions.
 */

import { request, cachedRequest, qs } from './client-base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanySummary {
  ticker: string;
  short_name: string | null;
  sector: string | null;
  industry: string | null;
  current_price: number | null;
  market_cap: number | null;
  change_pct: number | null;
}

export interface EntityListResponse {
  items: CompanySummary[];
  count: number;
}

export interface CompanyDetail {
  ticker: string;
  short_name: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  currency: string | null;
  current_price: number | null;
  previous_close: number | null;
  day_high: number | null;
  day_low: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  volume: number | null;
  market_cap: number | null;
  beta: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  trailing_eps: number | null;
  roe: number | null;
  profit_margin: number | null;
  revenue_growth: number | null;
  recommendation: string | null;
  target_mean_price: number | null;
  analyst_count: number | null;
}

export interface SectorInfo {
  sector: string;
  company_count: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export function getEntities(params?: {
  limit?: number;
  offset?: number;
  sector?: string;
  search?: string;
}, signal?: AbortSignal): Promise<EntityListResponse> {
  return request(`/api/entities${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getEntityDetail(ticker: string, signal?: AbortSignal): Promise<CompanyDetail> {
  return request(`/api/entities/${encodeURIComponent(ticker)}`, undefined, undefined, signal);
}

export function getSectors(signal?: AbortSignal): Promise<SectorInfo[]> {
  return cachedRequest('/api/entities/sectors', undefined, signal);
}
