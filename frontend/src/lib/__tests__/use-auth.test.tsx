import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '@/lib/hooks/use-auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal JWT with the given payload. The signature is fake but the
 * format (header.payload.signature) is valid enough for decodeJwtPayload.
 */
function makeJwt(payload: Record<string, unknown>, expOffsetSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds;
  const fullPayload = { sub: 'user-123', email: 'test@example.com', ...payload, exp };
  const encode = (obj: object) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(fullPayload)}.fake-sig`;
}

/** Build a JWT expiring very soon (within 120 s). */
function makeExpiringJwt(): string {
  return makeJwt({}, 60);
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'rad-ai-token';
const REFRESH_TOKEN_KEY = 'rad-ai-refresh-token';
const USER_KEY = 'rad-ai-user';

function clearStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ---------------------------------------------------------------------------
// fetch mock factory
// ---------------------------------------------------------------------------

function mockFetchOk(body: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockFetchError(status: number, message = 'Error') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ detail: message }),
    text: async () => message,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthProvider', () => {
  beforeEach(() => {
    clearStorage();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearStorage();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Provider renders children
  // -------------------------------------------------------------------------

  it('renders children without throwing', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. Initial state (unauthenticated, no stored session)
  // -------------------------------------------------------------------------

  it('has null user and loading=false when no stored session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. Hydration from localStorage on mount
  // -------------------------------------------------------------------------

  it('hydrates user from localStorage on mount', async () => {
    const storedUser = { id: 'u1', email: 'stored@test.com', name: 'Stored', isGuest: false };
    const token = makeJwt({ sub: 'u1', email: 'stored@test.com' });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(storedUser));

    // Mock refresh endpoint so the background refresh doesn't cause issues
    global.fetch = mockFetchOk({ access_token: token });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.email).toBe('stored@test.com');
    expect(result.current.user?.isGuest).toBe(false);
  });

  it('adds isGuest=false via backward-compat when field is missing in stored user', async () => {
    const storedUser = { id: 'u1', email: 'stored@test.com', name: 'Stored' }; // no isGuest
    const token = makeJwt({});
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(storedUser));

    global.fetch = mockFetchOk({ access_token: token });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.isGuest).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. Login flow
  // -------------------------------------------------------------------------

  it('login: sets user and stores tokens in localStorage', async () => {
    const accessToken = makeJwt({ sub: 'user-1', email: 'login@test.com' });
    const refreshToken = 'rt-abc';

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: accessToken,
          refresh_token: refreshToken,
          user_id: 'user-1',
          name: 'Test User',
        }),
        text: async () => '',
      })
      // /api/auth/me enrichment
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'user-1',
          email: 'login@test.com',
          display_name: 'Test User',
          subscription_tier: 'pro',
          usage_count: 5,
          is_active: true,
        }),
        text: async () => '',
      });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('login@test.com', 'password123');
    });

    expect(result.current.user?.email).toBe('login@test.com');
    expect(result.current.user?.isGuest).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(accessToken);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe(refreshToken);
    expect(localStorage.getItem(USER_KEY)).not.toBeNull();
  });

  it('login: throws on non-ok response', async () => {
    global.fetch = mockFetchError(401, 'Invalid credentials');

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('bad@test.com', 'wrong');
      }),
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.user).toBeNull();
  });

  it('login: throws when tokens are missing from response', async () => {
    global.fetch = mockFetchOk({ user_id: 'u1' }); // no tokens

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('x@test.com', 'pass');
      }),
    ).rejects.toThrow('Login response missing tokens');
  });

  // -------------------------------------------------------------------------
  // 5. Logout
  // -------------------------------------------------------------------------

  it('logout: clears user and removes tokens from localStorage', async () => {
    const accessToken = makeJwt({});
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rt-xyz');
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'A', isGuest: false }));

    global.fetch = mockFetchOk({ access_token: accessToken });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Ensure user is loaded
    expect(result.current.user).not.toBeNull();

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 6. Guest login
  // -------------------------------------------------------------------------

  it('guestLogin: sets isGuest=true on user', async () => {
    const accessToken = makeJwt({ sub: 'guest-abc' });

    global.fetch = mockFetchOk({
      access_token: accessToken,
      refresh_token: 'rt-guest',
      user_id: 'guest-abc',
      name: 'Guest',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.guestLogin();
    });

    expect(result.current.user?.isGuest).toBe(true);
    expect(result.current.user?.email).toBe('guest@local');
  });

  it('guestLogin: throws on non-ok response', async () => {
    global.fetch = mockFetchError(503, 'Service unavailable');

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.guestLogin();
      }),
    ).rejects.toThrow('Service unavailable');
  });

  it('guestLogin: throws when access token missing from response', async () => {
    global.fetch = mockFetchOk({ refresh_token: 'rt-only' }); // no access_token

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.guestLogin();
      }),
    ).rejects.toThrow('Guest login response missing token');
  });

  // -------------------------------------------------------------------------
  // 7. isTokenExpiringSoon helper (tested indirectly via refresh behaviour)
  // -------------------------------------------------------------------------

  it('token refresh is skipped when token is not expiring soon', async () => {
    const freshToken = makeJwt({}, 3600); // expires in 1 hour
    localStorage.setItem(TOKEN_KEY, freshToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rt-valid');
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'A', isGuest: false }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Give the component a tick to fire the immediate refresh check
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // The refresh endpoint should NOT have been called because token is fresh
    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/auth/refresh'),
    );
    expect(refreshCalls.length).toBe(0);
  });

  it('token refresh is triggered when token is expiring soon', async () => {
    const expiringToken = makeExpiringJwt(); // expires in 60 s
    const newToken = makeJwt({}, 3600);
    localStorage.setItem(TOKEN_KEY, expiringToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rt-valid');
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'A', isGuest: false }),
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: newToken }),
      text: async () => '',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Refresh endpoint should have been called
    const refreshCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes('/api/auth/refresh'),
    );
    expect(refreshCalls.length).toBeGreaterThan(0);
    // New token should be persisted
    expect(localStorage.getItem(TOKEN_KEY)).toBe(newToken);
  });

  // -------------------------------------------------------------------------
  // 8. 401 on refresh logs user out
  // -------------------------------------------------------------------------

  it('logout is triggered when refresh returns 401', async () => {
    const expiringToken = makeExpiringJwt();
    localStorage.setItem(TOKEN_KEY, expiringToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, 'rt-expired');
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'A', isGuest: false }),
    );

    global.fetch = mockFetchError(401, 'Token expired');

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // After a 401 from refresh, user should be null
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 9. Profile enrichment
  // -------------------------------------------------------------------------

  it('login enriches user with subscriptionTier from /api/auth/me', async () => {
    const accessToken = makeJwt({ sub: 'u-pro', email: 'pro@test.com' });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: accessToken,
          refresh_token: 'rt-pro',
          user_id: 'u-pro',
        }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'u-pro',
          email: 'pro@test.com',
          display_name: 'Pro User',
          subscription_tier: 'enterprise',
          usage_count: 100,
          is_active: true,
        }),
        text: async () => '',
      });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('pro@test.com', 'pass');
    });

    // Profile enrichment is async — wait for it
    await waitFor(() => expect(result.current.user?.subscriptionTier).toBe('enterprise'));
    expect(result.current.user?.name).toBe('Pro User');
  });

  it('profile enrichment is skipped for guest users', async () => {
    const accessToken = makeJwt({ sub: 'guest-xyz' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: accessToken,
          refresh_token: 'rt-g',
          user_id: 'guest-xyz',
          name: 'Guest',
        }),
        text: async () => '',
      });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.guestLogin();
    });

    // /api/auth/me should NOT have been called for guests
    const meCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/auth/me'),
    );
    expect(meCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 10. localStorage quota handling
  // -------------------------------------------------------------------------

  it('login succeeds even when localStorage.setItem throws (quota exceeded)', async () => {
    const accessToken = makeJwt({ sub: 'u-quota', email: 'quota@test.com' });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: accessToken,
        refresh_token: 'rt-quota',
        user_id: 'u-quota',
        name: 'Quota User',
      }),
      text: async () => '',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Loading will complete despite the storage throwing on initial hydration
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // login should not throw even with quota errors
    await act(async () => {
      await result.current.login('quota@test.com', 'pass');
    });

    // In-memory user state should still be set
    expect(result.current.user?.email).toBe('quota@test.com');
  });

  // -------------------------------------------------------------------------
  // 11. useAuth throws outside provider
  // -------------------------------------------------------------------------

  it('useAuth throws when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});
