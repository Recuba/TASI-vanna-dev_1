/**
 * API client module tests: client-base, stocks, news, auth/watchlists, and legacy shim.
 *
 * Uses vi.fn() to mock global fetch and localStorage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fetch globally before any imports
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockLocalStorage = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal('localStorage', mockLocalStorage);

// ---------------------------------------------------------------------------
// Helper: create a mock fetch response
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : status === 500 ? 'Internal Server Error' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function networkError() {
  return Promise.reject(new TypeError('Failed to fetch'));
}

// ---------------------------------------------------------------------------
// client-base: ApiError
// ---------------------------------------------------------------------------

describe('ApiError', () => {
  it('has correct shape with status and statusText', async () => {
    const { ApiError } = await import('@/lib/api/client-base');
    const err = new ApiError(404, 'Not Found', 'Resource not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.statusText).toBe('Not Found');
    expect(err.body).toBe('Resource not found');
    expect(err.message).toContain('[API_ERROR:404]');
  });

  it('getUserMessage returns correct messages for known status codes', async () => {
    const { ApiError } = await import('@/lib/api/client-base');
    expect(new ApiError(0, '').getUserMessage()).toBe('Request timed out');
    expect(new ApiError(401, '').getUserMessage()).toBe('Authentication required');
    expect(new ApiError(403, '').getUserMessage()).toBe('Access denied');
    expect(new ApiError(404, '').getUserMessage()).toBe('Not found');
    expect(new ApiError(429, '').getUserMessage()).toBe('Too many requests');
    expect(new ApiError(500, '').getUserMessage()).toBe('Server error');
    expect(new ApiError(503, '').getUserMessage()).toBe('Service unavailable');
    expect(new ApiError(418, '').getUserMessage()).toBe('An unexpected error occurred');
  });
});

// ---------------------------------------------------------------------------
// client-base: authHeaders
// ---------------------------------------------------------------------------

describe('authHeaders', () => {
  beforeEach(() => {
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('returns empty object when no token in localStorage', async () => {
    const { authHeaders } = await import('@/lib/api/client-base');
    mockLocalStorage.getItem.mockReturnValue(null);
    const headers = authHeaders();
    expect(headers).toEqual({});
  });

  it('returns Authorization header when token exists', async () => {
    const { authHeaders } = await import('@/lib/api/client-base');
    mockLocalStorage.getItem.mockReturnValue('test-jwt-token-123');
    const headers = authHeaders();
    expect(headers['Authorization']).toBe('Bearer test-jwt-token-123');
  });
});

// ---------------------------------------------------------------------------
// client-base: request
// ---------------------------------------------------------------------------

describe('request', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('returns parsed JSON on successful 200 response', async () => {
    const { request } = await import('@/lib/api/client-base');
    const payload = { id: 1, name: 'Test' };
    mockFetch.mockReturnValue(jsonResponse(payload));
    const result = await request('/api/test');
    expect(result).toEqual(payload);
  });

  it('adds Authorization header when token is in localStorage', async () => {
    const { request } = await import('@/lib/api/client-base');
    mockLocalStorage.getItem.mockReturnValue('my-token');
    mockFetch.mockReturnValue(jsonResponse({ ok: true }));
    await request('/api/test');
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers['Authorization']).toBe('Bearer my-token');
  });

  it('adds Content-Type application/json header', async () => {
    const { request } = await import('@/lib/api/client-base');
    mockFetch.mockReturnValue(jsonResponse({}));
    await request('/api/test');
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers['Content-Type']).toBe('application/json');
  });

  it('throws ApiError with status 401 on Unauthorized response', async () => {
    const { request, ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockReturnValue(jsonResponse({ detail: 'Unauthorized' }, 401));
    await expect(request('/api/protected')).rejects.toThrow(ApiError);
    try {
      await request('/api/protected');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBe(401);
    }
  });

  it('throws ApiError with status 500 on server error', async () => {
    const { request, ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockReturnValue(jsonResponse({ detail: 'Internal error' }, 500));
    await expect(request('/api/error')).rejects.toThrow(ApiError);
    try {
      await request('/api/error');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBe(500);
    }
  });

  it('throws ApiError(0) on network error', async () => {
    const { request, ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockImplementation(networkError);
    try {
      await request('/api/network-fail');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBe(0);
      expect((err as InstanceType<typeof ApiError>).statusText).toBe('Network error');
    }
  });

  it('returns undefined for 204 No Content response', async () => {
    const { request } = await import('@/lib/api/client-base');
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 204,
        statusText: 'No Content',
        json: () => Promise.resolve(undefined),
        text: () => Promise.resolve(''),
      }),
    );
    const result = await request('/api/delete');
    expect(result).toBeUndefined();
  });

  it('aborts when external signal fires', async () => {
    const { request } = await import('@/lib/api/client-base');
    const controller = new AbortController();
    controller.abort();
    await expect(request('/api/test', undefined, 15000, controller.signal)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// client-base: qs
// ---------------------------------------------------------------------------

describe('qs', () => {
  it('returns empty string for empty params', async () => {
    const { qs } = await import('@/lib/api/client-base');
    expect(qs({})).toBe('');
  });

  it('builds query string from defined params', async () => {
    const { qs } = await import('@/lib/api/client-base');
    const result = qs({ limit: 10, offset: 0, source: 'test' });
    expect(result).toContain('limit=10');
    expect(result).toContain('offset=0');
    expect(result).toContain('source=test');
    expect(result.startsWith('?')).toBe(true);
  });

  it('omits null, undefined, and empty string values', async () => {
    const { qs } = await import('@/lib/api/client-base');
    const result = qs({ a: 'x', b: null, c: undefined, d: '' });
    expect(result).toContain('a=x');
    expect(result).not.toContain('b=');
    expect(result).not.toContain('c=');
    expect(result).not.toContain('d=');
  });
});

// ---------------------------------------------------------------------------
// stocks module
// ---------------------------------------------------------------------------

describe('stocks module: getOHLCVData', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_OHLCV = {
    data: [{ time: '2026-02-01', open: 100, high: 110, low: 95, close: 105, volume: 1000000 }],
    source: 'real',
    last_updated: '2026-02-01T12:00:00',
    symbol: '2222',
    period: '1y',
    count: 1,
  };

  it('calls correct URL for a ticker', async () => {
    const { getOHLCVData } = await import('@/lib/api/stocks');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_OHLCV));
    const result = await getOHLCVData('2222');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/charts/2222/ohlcv');
    expect(result.data).toHaveLength(1);
    expect(result.symbol).toBe('2222');
  });

  it('appends period query param when provided', async () => {
    const { getOHLCVData } = await import('@/lib/api/stocks');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_OHLCV));
    await getOHLCVData('1120', { period: '3mo' });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('period=3mo');
  });
});

describe('stocks module: getBatchQuotes', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('calls correct URL with tickers joined by comma', async () => {
    const { getBatchQuotes } = await import('@/lib/api/stocks');
    const quotes = [
      { ticker: '2222', name: 'Aramco', current_price: 30, previous_close: 29, change_pct: 3.4, volume: 5000000 },
    ];
    mockFetch.mockReturnValue(jsonResponse(quotes));
    const result = await getBatchQuotes(['2222', '1120']);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('tickers=');
    expect(url).toContain('2222');
    expect(url).toContain('1120');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// news module
// ---------------------------------------------------------------------------

describe('news module: getNewsFeed', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_FEED = {
    items: [
      {
        id: 'n1',
        ticker: null,
        title: 'أرامكو تعلن أرباحها',
        body: 'تفاصيل',
        source_name: 'العربية',
        source_url: 'https://alarabiya.net/1',
        published_at: '2026-02-10T10:00:00',
        sentiment_score: 0.8,
        sentiment_label: 'positive',
        priority: 1,
        language: 'ar',
        created_at: '2026-02-10T10:05:00',
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  };

  it('returns paginated news feed data', async () => {
    const { getNewsFeed } = await import('@/lib/api/news');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_FEED));
    const result = await getNewsFeed();
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('أرامكو تعلن أرباحها');
  });

  it('calls correct URL', async () => {
    const { getNewsFeed } = await import('@/lib/api/news');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_FEED));
    await getNewsFeed({ limit: 5, offset: 10 });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/news/feed');
    expect(url).toContain('limit=5');
    expect(url).toContain('offset=10');
  });
});

describe('news module: getNewsFeedByIds', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('returns empty response immediately when ids array is empty', async () => {
    const { getNewsFeedByIds } = await import('@/lib/api/news');
    const result = await getNewsFeedByIds([]);
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('news module: searchNewsFeed', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('calls search endpoint with query param', async () => {
    const { searchNewsFeed } = await import('@/lib/api/news');
    mockFetch.mockReturnValue(jsonResponse({ items: [], total: 0, page: 1, limit: 20 }));
    await searchNewsFeed({ q: 'أرامكو' });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/news/search');
    expect(url).toContain('q=');
  });
});

// ---------------------------------------------------------------------------
// auth module (watchlists/reports)
// ---------------------------------------------------------------------------

describe('auth module: createWatchlist', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue('auth-token');
  });

  const SAMPLE_WATCHLIST = { id: 'wl1', user_id: 'u1', name: 'My Watchlist', tickers: ['2222', '1120'] };

  it('sends POST request with body', async () => {
    const { createWatchlist } = await import('@/lib/api/auth');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_WATCHLIST, 200));
    const result = await createWatchlist({ name: 'My Watchlist', tickers: ['2222', '1120'] });
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.method).toBe('POST');
    const body = JSON.parse(calledInit.body);
    expect(body.name).toBe('My Watchlist');
    expect(body.tickers).toEqual(['2222', '1120']);
    expect(result.id).toBe('wl1');
  });
});

describe('auth module: getWatchlists', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue('auth-token');
  });

  it('calls /api/watchlists and returns array', async () => {
    const { getWatchlists } = await import('@/lib/api/auth');
    mockFetch.mockReturnValue(jsonResponse([{ id: 'wl1', user_id: 'u1', name: 'Test', tickers: [] }]));
    const result = await getWatchlists();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/watchlists');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Legacy shim: api-client re-exports everything
// ---------------------------------------------------------------------------

describe('legacy api-client shim', () => {
  it('re-exports ApiError from client-base', async () => {
    const apiClient = await import('@/lib/api-client');
    const clientBase = await import('@/lib/api/client-base');
    expect(apiClient.ApiError).toBe(clientBase.ApiError);
  });

  it('re-exports request from client-base', async () => {
    const apiClient = await import('@/lib/api-client');
    const clientBase = await import('@/lib/api/client-base');
    expect(apiClient.request).toBe(clientBase.request);
  });

  it('re-exports getNewsFeed from news module', async () => {
    const apiClient = await import('@/lib/api-client');
    const newsModule = await import('@/lib/api/news');
    expect(apiClient.getNewsFeed).toBe(newsModule.getNewsFeed);
  });

  it('re-exports getOHLCVData from stocks module', async () => {
    const apiClient = await import('@/lib/api-client');
    const stocksModule = await import('@/lib/api/stocks');
    expect(apiClient.getOHLCVData).toBe(stocksModule.getOHLCVData);
  });

  it('re-exports createWatchlist from auth module', async () => {
    const apiClient = await import('@/lib/api-client');
    const authModule = await import('@/lib/api/auth');
    expect(apiClient.createWatchlist).toBe(authModule.createWatchlist);
  });
});
