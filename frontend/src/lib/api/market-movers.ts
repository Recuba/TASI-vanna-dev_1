/**
 * Market movers API: top gainers, top losers, most active.
 *
 * Fetches from /api/v1/market/movers which returns the combined
 * MarketMoversData shape ({top_gainers, top_losers, most_active, timestamp}).
 */

import { request } from './client-base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MoverStock {
  ticker: string;
  short_name: string | null;
  sector: string | null;
  current_price: number | null;
  change_pct: number | null;
  volume: number | null;
  market_cap: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
}

export interface MarketMoversData {
  top_gainers: MoverStock[];
  top_losers: MoverStock[];
  most_active: MoverStock[];
  timestamp: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function fetchMarketMovers(signal?: AbortSignal): Promise<MarketMoversData> {
  return request<MarketMoversData>('/api/v1/market/movers', undefined, undefined, signal);
}
