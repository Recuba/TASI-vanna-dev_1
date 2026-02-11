/**
 * News Feed API client + hook tests.
 *
 * Tests getNewsFeed (api-client) and useNewsFeed (use-api hook)
 * using mocked fetch responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Also stub localStorage for authHeaders
vi.stubGlobal('localStorage', {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

// ---------------------------------------------------------------------------
// Helper: create a successful fetch response
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE_FEED = {
  items: [
    {
      id: 'a1',
      title: 'أرامكو تعلن عن أرباح',
      body: 'نص الخبر',
      source_name: 'العربية',
      source_url: 'https://example.com/1',
      published_at: '2026-02-10T12:00:00',
      priority: 1,
      language: 'ar',
    },
    {
      id: 'a2',
      title: 'سابك تحقق نموا',
      body: null,
      source_name: 'أرقام',
      source_url: null,
      published_at: null,
      priority: 3,
      language: 'ar',
    },
  ],
  total: 2,
  page: 1,
};

// ---------------------------------------------------------------------------
// getNewsFeed tests
// ---------------------------------------------------------------------------

describe('getNewsFeed (api-client)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('calls correct URL with no params', async () => {
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_FEED));

    const { getNewsFeed } = await import('@/lib/api-client');
    const result = await getNewsFeed();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/news/feed');
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('passes limit/offset/source as query params', async () => {
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_FEED));

    const { getNewsFeed } = await import('@/lib/api-client');
    await getNewsFeed({ limit: 10, offset: 20, source: 'العربية' });

    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=20');
    expect(url).toContain('source=');
  });

  it('throws ApiError on non-200 response', async () => {
    mockFetch.mockReturnValue(jsonResponse({ detail: 'Not found' }, 404));

    const { getNewsFeed, ApiError } = await import('@/lib/api-client');

    await expect(getNewsFeed()).rejects.toThrow();
    try {
      await getNewsFeed();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
  });
});

// ---------------------------------------------------------------------------
// useNewsFeed hook tests
// ---------------------------------------------------------------------------

describe('useNewsFeed (hook)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns loading=true then data on success', async () => {
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_FEED));

    const { useNewsFeed } = await import('@/lib/hooks/use-api');
    const { result } = renderHook(() => useNewsFeed({ limit: 20, offset: 0 }));

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.items).toHaveLength(2);
    expect(result.current.data!.total).toBe(2);
  });

  it('returns error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { useNewsFeed } = await import('@/lib/hooks/use-api');
    const { result } = renderHook(() => useNewsFeed());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBeNull();
  });
});
