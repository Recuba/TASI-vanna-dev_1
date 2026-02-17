/**
 * News-related API types and functions.
 */

import { request, cachedRequest, qs } from './client-base';

// ---------------------------------------------------------------------------
// Types
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

export interface NewsSourceInfo {
  source_name: string;
  count: number;
}

export interface NewsSourcesResponse {
  sources: NewsSourceInfo[];
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export function getNews(params?: {
  page?: number;
  page_size?: number;
  language?: string;
}, signal?: AbortSignal): Promise<NewsListResponse> {
  return request(`/api/news${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getNewsByTicker(
  ticker: string,
  params?: { page?: number; page_size?: number; sentiment?: string },
  signal?: AbortSignal,
): Promise<NewsListResponse> {
  return request(`/api/news/ticker/${encodeURIComponent(ticker)}${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getNewsFeed(params?: {
  limit?: number;
  offset?: number;
  source?: string;
  sentiment?: string;
  date_from?: string;
  date_to?: string;
}, signal?: AbortSignal): Promise<NewsFeedResponse> {
  return request(`/api/v1/news/feed${qs(params ?? {})}`, undefined, undefined, signal);
}

export function getNewsArticle(id: string, signal?: AbortSignal): Promise<NewsFeedItem> {
  return cachedRequest(`/api/v1/news/feed/${encodeURIComponent(id)}`, 30_000, signal);
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
  return request(`/api/v1/news/search${qs(params)}`, undefined, undefined, signal);
}

export function getNewsFeedByIds(ids: string[], signal?: AbortSignal): Promise<NewsFeedResponse> {
  if (ids.length === 0) {
    return Promise.resolve({ items: [], total: 0, page: 1, limit: 0 });
  }
  return request(`/api/v1/news/feed/batch${qs({ ids: ids.join(',') })}`, undefined, undefined, signal);
}

export function getNewsSources(signal?: AbortSignal): Promise<NewsSourcesResponse> {
  return cachedRequest('/api/v1/news/sources', undefined, signal);
}
