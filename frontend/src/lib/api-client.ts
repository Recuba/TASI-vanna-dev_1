/**
 * Typed API client for the Ra'd AI backend.
 *
 * All requests use relative paths (e.g. /api/v1/...) so they are proxied
 * through Next.js rewrites (next.config.mjs) to the backend, avoiding CORS.
 */

const API_BASE = '';

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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type NewsListResponse = PaginatedResponse<NewsArticle>;

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

export type ReportListResponse = PaginatedResponse<ReportItem>;

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

export type AnnouncementListResponse = PaginatedResponse<AnnouncementItem>;

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

export interface HealthComponentResponse {
  name: string;
  status: string;
  latency_ms: number | null;
  message: string;
}

export interface HealthResponse {
  status: string;
  components: HealthComponentResponse[];
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
    // Encode status in a parseable prefix so ErrorDisplay can extract it
    super(`[API_ERROR:${status}] ${statusText}${body ? ` - ${body}` : ''}`);
    this.name = 'ApiError';
  }

  /** Get a user-friendly error message. */
  getUserMessage(): string {
    switch (this.status) {
      case 0: return 'Request timed out';
      case 401: return 'Authentication required';
      case 403: return 'Access denied';
      case 404: return 'Not found';
      case 429: return 'Too many requests';
      case 500: return 'Server error';
      case 503: return 'Service unavailable';
      default: return 'An unexpected error occurred';
    }
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
  }
  return headers;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = 15000,
  externalSignal?: AbortSignal,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If an external signal is provided, abort our controller when it fires.
  let onExternalAbort: (() => void) | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      onExternalAbort = () => controller.abort();
      externalSignal.addEventListener('abort', onExternalAbort);
    }
  }

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
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
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Re-throw as-is if cancelled by external signal (not a timeout)
      if (externalSignal?.aborted) throw err;
      throw new ApiError(0, 'Request timed out', 'The request took too long to complete.');
    }
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new ApiError(0, 'Network error', 'Could not connect to server. Check your internet connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (onExternalAbort && externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

// ---------------------------------------------------------------------------
// In-memory cache for frequently accessed, relatively static data
// ---------------------------------------------------------------------------

const _cache = new Map<string, { data: unknown; expiry: number }>();

async function cachedRequest<T>(path: string, ttlMs: number = 60000, signal?: AbortSignal): Promise<T> {
  const now = Date.now();
  const cached = _cache.get(path);
  if (cached && cached.expiry > now) {
    return cached.data as T;
  }
  const result = await request<T>(path, undefined, 15000, signal);
  _cache.set(path, { data: result, expiry: now + ttlMs });
  return result;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

// -- Health --
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request('/health', undefined, 15000, signal);
}

// -- News --
export function getNews(params?: {
  page?: number;
  page_size?: number;
  language?: string;
}, signal?: AbortSignal): Promise<NewsListResponse> {
  return request(`/api/news${qs(params ?? {})}`, undefined, 15000, signal);
}

export function getNewsByTicker(
  ticker: string,
  params?: { page?: number; page_size?: number; sentiment?: string },
  signal?: AbortSignal,
): Promise<NewsListResponse> {
  return request(`/api/news/ticker/${encodeURIComponent(ticker)}${qs(params ?? {})}`, undefined, 15000, signal);
}

// -- Reports --
export function getReports(params?: {
  page?: number;
  page_size?: number;
  recommendation?: string;
  report_type?: string;
  search?: string;
}, signal?: AbortSignal): Promise<ReportListResponse> {
  return request(`/api/reports${qs(params ?? {})}`, undefined, 15000, signal);
}

export function getReportsByTicker(
  ticker: string,
  params?: { page?: number; page_size?: number },
  signal?: AbortSignal,
): Promise<ReportListResponse> {
  return request(`/api/reports/ticker/${encodeURIComponent(ticker)}${qs(params ?? {})}`, undefined, 15000, signal);
}

// -- Announcements --
export function getAnnouncements(params?: {
  page?: number;
  page_size?: number;
  ticker?: string;
  category?: string;
  source?: string;
}, signal?: AbortSignal): Promise<AnnouncementListResponse> {
  return request(`/api/announcements${qs(params ?? {})}`, undefined, 15000, signal);
}

// -- Entities --
export function getEntities(params?: {
  limit?: number;
  offset?: number;
  sector?: string;
  search?: string;
}, signal?: AbortSignal): Promise<EntityListResponse> {
  return request(`/api/entities${qs(params ?? {})}`, undefined, 15000, signal);
}

export function getEntityDetail(ticker: string, signal?: AbortSignal): Promise<CompanyDetail> {
  return request(`/api/entities/${encodeURIComponent(ticker)}`, undefined, 15000, signal);
}

export function getSectors(signal?: AbortSignal): Promise<SectorInfo[]> {
  return cachedRequest('/api/entities/sectors', 60000, signal);
}

// -- Watchlists --
export function getWatchlists(signal?: AbortSignal): Promise<WatchlistItem[]> {
  return request('/api/watchlists', undefined, 15000, signal);
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
export function getChartSectorMarketCap(signal?: AbortSignal): Promise<ChartResponse> {
  return request('/api/charts/sector-market-cap', undefined, 15000, signal);
}

export function getChartTopCompanies(params?: {
  limit?: number;
  sector?: string;
}, signal?: AbortSignal): Promise<ChartResponse> {
  return request(`/api/charts/top-companies${qs(params ?? {})}`, undefined, 15000, signal);
}

export function getChartSectorPE(signal?: AbortSignal): Promise<ChartResponse> {
  return request('/api/charts/sector-pe', undefined, 15000, signal);
}

export function getChartDividendYieldTop(params?: {
  limit?: number;
}, signal?: AbortSignal): Promise<ChartResponse> {
  return request(`/api/charts/dividend-yield-top${qs(params ?? {})}`, undefined, 15000, signal);
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
  signal?: AbortSignal,
): Promise<StockOHLCVResponse> {
  return request(`/api/v1/charts/${encodeURIComponent(ticker)}/ohlcv${qs(params ?? {})}`, undefined, 15000, signal);
}

// -- TASI Index --
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

export function getTasiIndex(period: string = '1y', signal?: AbortSignal): Promise<TasiIndexResponse> {
  return request(`/api/v1/charts/tasi/index${qs({ period })}`, undefined, 15000, signal);
}

// -- News Feed --
export interface NewsFeedItem {
  id: string;
  ticker: string | null;
  title: string;
  body: string | null;
  source_name: string;
  source_url: string | null;
  published_at: string | null;
  sentiment_score: number | null;
  sentiment_label: string | null;
  priority: number;
  language: string;
  created_at: string | null;
}

export interface NewsFeedResponse {
  items: NewsFeedItem[];
  total: number;
  page: number;
  limit: number;
}

export function getNewsFeed(params?: {
  limit?: number;
  offset?: number;
  source?: string;
  sentiment?: string;
  date_from?: string;
  date_to?: string;
}, signal?: AbortSignal): Promise<NewsFeedResponse> {
  return request(`/api/v1/news/feed${qs(params ?? {})}`, undefined, 15000, signal);
}

export function getNewsArticle(id: string, signal?: AbortSignal): Promise<NewsFeedItem> {
  return request(`/api/v1/news/feed/${encodeURIComponent(id)}`, undefined, 15000, signal);
}

export function searchNewsFeed(
  params: {
    q: string;
    limit?: number;
    offset?: number;
    source?: string;
    sentiment?: string;
    date_from?: string;
    date_to?: string;
  },
  signal?: AbortSignal,
): Promise<NewsFeedResponse> {
  return request(`/api/v1/news/search${qs(params)}`, undefined, 15000, signal);
}

export function getNewsFeedByIds(ids: string[], signal?: AbortSignal): Promise<NewsFeedResponse> {
  if (ids.length === 0) {
    return Promise.resolve({ items: [], total: 0, page: 1, limit: 0 });
  }
  return request(`/api/v1/news/feed/batch${qs({ ids: ids.join(',') })}`, undefined, 15000, signal);
}

export interface NewsSourceInfo {
  source_name: string;
  count: number;
}

export interface NewsSourcesResponse {
  sources: NewsSourceInfo[];
}

export function getNewsSources(signal?: AbortSignal): Promise<NewsSourcesResponse> {
  return cachedRequest('/api/v1/news/sources', 60000, signal);
}

// ---------------------------------------------------------------------------
// Market Analytics types
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
// Stock data types
// ---------------------------------------------------------------------------

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
// Market Analytics API
// ---------------------------------------------------------------------------

export function getMarketMovers(
  type: 'gainers' | 'losers',
  limit?: number,
  signal?: AbortSignal,
): Promise<MarketMover[]> {
  return request(`/api/v1/market/movers${qs({ type, limit })}`, undefined, 15000, signal);
}

export function getMarketSummary(signal?: AbortSignal): Promise<MarketSummary> {
  return request('/api/v1/market/summary', undefined, 15000, signal);
}

export function getSectorPerformance(signal?: AbortSignal): Promise<SectorPerformance[]> {
  return request('/api/v1/market/sectors', undefined, 15000, signal);
}

export function getMarketHeatmap(signal?: AbortSignal): Promise<HeatmapItem[]> {
  return request('/api/v1/market/heatmap', undefined, 15000, signal);
}

// ---------------------------------------------------------------------------
// Stock Data API
// ---------------------------------------------------------------------------

export function getStockDividends(ticker: string, signal?: AbortSignal): Promise<StockDividends> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/dividends`, undefined, 15000, signal);
}

export function getStockFinancialSummary(ticker: string, signal?: AbortSignal): Promise<FinancialSummary> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/summary`, undefined, 15000, signal);
}

export function getStockFinancials(
  ticker: string,
  params?: { statement?: string; period_type?: string },
  signal?: AbortSignal,
): Promise<FinancialsResponse> {
  return request(
    `/api/v1/stocks/${encodeURIComponent(ticker)}/financials${qs(params ?? {})}`,
    undefined, 15000, signal,
  );
}

export function compareStocks(
  tickers: string[],
  metrics: string[],
  signal?: AbortSignal,
): Promise<StockComparison> {
  return request(`/api/v1/stocks/compare${qs({ tickers: tickers.join(','), metrics: metrics.join(',') })}`, undefined, 15000, signal);
}

export function getBatchQuotes(tickers: string[], signal?: AbortSignal): Promise<BatchQuote[]> {
  return request(`/api/v1/stocks/quotes${qs({ tickers: tickers.join(',') })}`, undefined, 15000, signal);
}
