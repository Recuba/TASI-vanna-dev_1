/**
 * Core API client infrastructure: error class, fetch wrapper, auth headers, cache.
 *
 * All requests use relative paths (e.g. /api/v1/...) so they are proxied
 * through Next.js rewrites (next.config.mjs) to the backend, avoiding CORS.
 */

import { API_BASE, API_TIMEOUT_MS, API_CACHE_TTL_MS } from '../config';

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

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('rad-ai-token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

export async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS,
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

export function qs(params: Record<string, string | number | undefined | null>): string {
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

export async function cachedRequest<T>(path: string, ttlMs: number = API_CACHE_TTL_MS, signal?: AbortSignal): Promise<T> {
  const now = Date.now();
  const cached = _cache.get(path);
  if (cached && cached.expiry > now) {
    return cached.data as T;
  }
  const result = await request<T>(path, undefined, undefined, signal);
  _cache.set(path, { data: result, expiry: now + ttlMs });
  return result;
}
