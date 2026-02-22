/**
 * Stock screener API types and functions.
 */

import { request } from './client-base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenerFilters {
  sector?: string;
  pe_min?: number;
  pe_max?: number;
  pb_min?: number;
  pb_max?: number;
  roe_min?: number;
  roe_max?: number;
  dividend_yield_min?: number;
  dividend_yield_max?: number;
  market_cap_min?: number;
  market_cap_max?: number;
  revenue_growth_min?: number;
  revenue_growth_max?: number;
  debt_to_equity_max?: number;
  current_ratio_min?: number;
  recommendation?: string;
  sort_by?: string;
  sort_dir?: string;
  limit?: number;
  offset?: number;
}

export interface ScreenerItem {
  ticker: string;
  short_name: string | null;
  sector: string | null;
  industry: string | null;
  current_price: number | null;
  change_pct: number | null;
  market_cap: number | null;
  volume: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  roe: number | null;
  profit_margin: number | null;
  revenue_growth: number | null;
  dividend_yield: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  total_revenue: number | null;
  recommendation: string | null;
  target_mean_price: number | null;
  analyst_count: number | null;
}

export interface ScreenerResponse {
  items: ScreenerItem[];
  total_count: number;
  filters_applied: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export function searchScreener(
  filters: ScreenerFilters,
  signal?: AbortSignal,
): Promise<ScreenerResponse> {
  return request<ScreenerResponse>(
    '/api/v1/screener/search',
    {
      method: 'POST',
      body: JSON.stringify(filters),
    },
    undefined,
    signal,
  );
}
