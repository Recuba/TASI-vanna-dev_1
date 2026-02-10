/**
 * Typed API client for the Ra'd AI backend.
 *
 * Base URL comes from NEXT_PUBLIC_API_URL env var (default: "").
 * When running via the Next.js proxy (next.config.mjs rewrites), the
 * base can stay empty because /api/* is rewritten to the backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// ---------------------------------------------------------------------------
// Shared types that mirror the Pydantic response models in api/routes/
// ---------------------------------------------------------------------------

export interface NewsArticle {
  id: string;
  ticker: string | null;
  title: string;
  body: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: string | null;
  sentiment_score: number | null;
  sentiment_label: string | null;
  language: string;
  created_at: string | null;
}

export interface NewsListResponse {
  items: NewsArticle[];
  count: number;
}

export interface ReportItem {
  id: string;
  ticker: string | null;
  title: string;
  summary: string | null;
  author: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: string | null;
  recommendation: string | null;
  target_price: number | null;
  current_price_at_report: number | null;
  report_type: string | null;
  created_at: string | null;
}

export interface ReportListResponse {
  items: ReportItem[];
  count: number;
}

export interface AnnouncementItem {
  id: string;
  ticker: string | null;
  title_ar: string | null;
  title_en: string | null;
  body_ar: string | null;
  body_en: string | null;
  source: string | null;
  announcement_date: string | null;
  category: string | null;
  classification: string | null;
  is_material: boolean;
  source_url: string | null;
  created_at: string | null;
}

export interface AnnouncementListResponse {
  items: AnnouncementItem[];
  count: number;
}

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

export interface WatchlistItem {
  id: string;
  user_id: string;
  name: string;
  tickers: string[];
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartResponse {
  chart_type: string;
  title: string;
  data: ChartDataPoint[];
}

export interface HealthResponse {
  status: string;
  components: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: string,
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('rad-ai-token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const userId = localStorage.getItem('rad-ai-user-id');
    if (userId) {
      headers['X-User-Id'] = userId;
    }
  }
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

// -- Health --
export function getHealth(): Promise<HealthResponse> {
  return request('/health');
}

// -- News --
export function getNews(params?: {
  limit?: number;
  offset?: number;
  language?: string;
}): Promise<NewsListResponse> {
  return request(`/api/news${qs(params ?? {})}`);
}

export function getNewsByTicker(
  ticker: string,
  params?: { limit?: number; offset?: number; sentiment?: string },
): Promise<NewsListResponse> {
  return request(`/api/news/ticker/${encodeURIComponent(ticker)}${qs(params ?? {})}`);
}

// -- Reports --
export function getReports(params?: {
  limit?: number;
  offset?: number;
  recommendation?: string;
  report_type?: string;
}): Promise<ReportListResponse> {
  return request(`/api/reports${qs(params ?? {})}`);
}

export function getReportsByTicker(
  ticker: string,
  params?: { limit?: number; offset?: number },
): Promise<ReportListResponse> {
  return request(`/api/reports/ticker/${encodeURIComponent(ticker)}${qs(params ?? {})}`);
}

// -- Announcements --
export function getAnnouncements(params?: {
  limit?: number;
  offset?: number;
  ticker?: string;
  category?: string;
  source?: string;
}): Promise<AnnouncementListResponse> {
  return request(`/api/announcements${qs(params ?? {})}`);
}

// -- Entities --
export function getEntities(params?: {
  limit?: number;
  offset?: number;
  sector?: string;
  search?: string;
}): Promise<EntityListResponse> {
  return request(`/api/entities${qs(params ?? {})}`);
}

export function getEntityDetail(ticker: string): Promise<CompanyDetail> {
  return request(`/api/entities/${encodeURIComponent(ticker)}`);
}

export function getSectors(): Promise<SectorInfo[]> {
  return request('/api/entities/sectors');
}

// -- Watchlists --
export function getWatchlists(): Promise<WatchlistItem[]> {
  return request('/api/watchlists');
}

export function createWatchlist(body: {
  name?: string;
  tickers?: string[];
}): Promise<WatchlistItem> {
  return request('/api/watchlists', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateWatchlist(
  id: string,
  body: { name?: string; tickers?: string[] },
): Promise<WatchlistItem> {
  return request(`/api/watchlists/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteWatchlist(id: string): Promise<void> {
  return request(`/api/watchlists/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// -- Charts --
export function getChartSectorMarketCap(): Promise<ChartResponse> {
  return request('/api/charts/sector-market-cap');
}

export function getChartTopCompanies(params?: {
  limit?: number;
  sector?: string;
}): Promise<ChartResponse> {
  return request(`/api/charts/top-companies${qs(params ?? {})}`);
}

export function getChartSectorPE(): Promise<ChartResponse> {
  return request('/api/charts/sector-pe');
}

export function getChartDividendYieldTop(params?: {
  limit?: number;
}): Promise<ChartResponse> {
  return request(`/api/charts/dividend-yield-top${qs(params ?? {})}`);
}

// -- OHLCV --
export interface OHLCVData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StockOHLCVResponse {
  data: OHLCVData[];
  source: 'real' | 'mock' | 'cached';
  last_updated: string | null;
  symbol: string;
  period: string;
  count: number;
}

export async function getOHLCVData(
  ticker: string,
  params?: { period?: string },
): Promise<StockOHLCVResponse> {
  return request(`/api/v1/charts/${encodeURIComponent(ticker)}/ohlcv${qs(params ?? {})}`);
}

// -- TASI Index --
export interface TasiIndexResponse {
  data: OHLCVData[];
  source: 'real' | 'mock' | 'cached';
  last_updated: string | null;
  symbol: string;
  period: string;
  count: number;
}

export function getTasiIndex(period: string = '1y'): Promise<TasiIndexResponse> {
  return request(`/api/v1/charts/tasi/index${qs({ period })}`);
}
