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
  page?: number;
  page_size?: number;
  language?: string;
}): Promise<NewsListResponse> {
  return request(`/api/news${qs(params ?? {})}`);
}

export function getNewsByTicker(
  ticker: string,
  params?: { page?: number; page_size?: number; sentiment?: string },
): Promise<NewsListResponse> {
  return request(`/api/news/ticker/${encodeURIComponent(ticker)}${qs(params ?? {})}`);
}

// -- Reports --
export function getReports(params?: {
  page?: number;
  page_size?: number;
  recommendation?: string;
  report_type?: string;
}): Promise<ReportListResponse> {
  return request(`/api/reports${qs(params ?? {})}`);
}

export function getReportsByTicker(
  ticker: string,
  params?: { page?: number; page_size?: number },
): Promise<ReportListResponse> {
  return request(`/api/reports/ticker/${encodeURIComponent(ticker)}${qs(params ?? {})}`);
}

// -- Announcements --
export function getAnnouncements(params?: {
  page?: number;
  page_size?: number;
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

// -- News Feed --
export interface NewsFeedItem {
  id: string;
  title: string;
  body: string | null;
  source_name: string;
  source_url: string | null;
  published_at: string | null;
  priority: number;
  language: string;
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
}): Promise<NewsFeedResponse> {
  return request(`/api/v1/news/feed${qs(params ?? {})}`);
}

export function getNewsArticle(id: string): Promise<NewsFeedItem> {
  return request(`/api/v1/news/feed/${encodeURIComponent(id)}`);
}

export function searchNewsFeed(params: {
  q: string;
  limit?: number;
  offset?: number;
}): Promise<NewsFeedResponse> {
  return request(`/api/v1/news/search${qs(params)}`);
}

export interface NewsSourceInfo {
  source_name: string;
  count: number;
}

export interface NewsSourcesResponse {
  sources: NewsSourceInfo[];
}

export function getNewsSources(): Promise<NewsSourcesResponse> {
  return request('/api/v1/news/sources');
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
  name: string;
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
): Promise<MarketMover[]> {
  return request(`/api/v1/market/movers${qs({ type, limit })}`);
}

export function getMarketSummary(): Promise<MarketSummary> {
  return request('/api/v1/market/summary');
}

export function getSectorPerformance(): Promise<SectorPerformance[]> {
  return request('/api/v1/market/sectors');
}

export function getMarketHeatmap(): Promise<HeatmapItem[]> {
  return request('/api/v1/market/heatmap');
}

// ---------------------------------------------------------------------------
// Stock Data API
// ---------------------------------------------------------------------------

export function getStockDividends(ticker: string): Promise<StockDividends> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/dividends`);
}

export function getStockFinancialSummary(ticker: string): Promise<FinancialSummary> {
  return request(`/api/v1/stocks/${encodeURIComponent(ticker)}/summary`);
}

export function getStockFinancials(
  ticker: string,
  params?: { statement?: string; period_type?: string },
): Promise<FinancialStatement[]> {
  return request(
    `/api/v1/stocks/${encodeURIComponent(ticker)}/financials${qs(params ?? {})}`,
  );
}

export function compareStocks(
  tickers: string[],
  metrics: string[],
): Promise<StockComparison> {
  return request(`/api/v1/stocks/compare${qs({ tickers: tickers.join(','), metrics: metrics.join(',') })}`);
}

export function getBatchQuotes(tickers: string[]): Promise<BatchQuote[]> {
  return request(`/api/v1/stocks/quotes${qs({ tickers: tickers.join(',') })}`);
}
