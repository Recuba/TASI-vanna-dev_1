/**
 * Chart data API types and functions (pre-built analytics charts).
 */

import { request, qs } from './client-base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartResponse {
  chart_type: string;
  title: string;
  data: ChartDataPoint[];
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export function getChartSectorMarketCap(signal?: AbortSignal): Promise<ChartResponse> {
  return request('/api/charts/sector-market-cap', undefined, undefined, signal);
}

export function getChartTopCompanies(params?: {
  limit?: number;
  sector?: string;
}, signal?: AbortSignal): Promise<ChartResponse> {
  return request(`/api/charts/top-companies${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getChartSectorPE(signal?: AbortSignal): Promise<ChartResponse> {
  return request('/api/charts/sector-pe', undefined, undefined, signal);
}

export function getChartDividendYieldTop(params?: {
  limit?: number;
}, signal?: AbortSignal): Promise<ChartResponse> {
  return request(`/api/charts/dividend-yield-top${qs(params ?? {})}`, undefined, undefined, signal);
}
