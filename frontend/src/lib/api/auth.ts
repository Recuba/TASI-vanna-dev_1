/**
 * Auth, reports, announcements, and watchlist API types and functions.
 */

import { request, qs } from './client-base';
import type { PaginatedResponse } from './news';

// Re-export PaginatedResponse so consumers can import it from here too
export type { PaginatedResponse };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatchlistItem {
  id: string;
  user_id: string;
  name: string;
  tickers: string[];
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

export type ReportListResponse = PaginatedResponse<ReportItem>;
export type AnnouncementListResponse = PaginatedResponse<AnnouncementItem>;

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export function getReports(params?: {
  page?: number;
  page_size?: number;
  recommendation?: string;
  report_type?: string;
  search?: string;
}, signal?: AbortSignal): Promise<ReportListResponse> {
  return request(`/api/reports${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getReportsByTicker(
  ticker: string,
  params?: { page?: number; page_size?: number },
  signal?: AbortSignal,
): Promise<ReportListResponse> {
  return request(`/api/reports/ticker/${encodeURIComponent(ticker)}${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getAnnouncements(params?: {
  page?: number;
  page_size?: number;
  ticker?: string;
  category?: string;
  source?: string;
}, signal?: AbortSignal): Promise<AnnouncementListResponse> {
  return request(`/api/announcements${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getWatchlists(signal?: AbortSignal): Promise<WatchlistItem[]> {
  return request('/api/watchlists', undefined, undefined, signal);
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
