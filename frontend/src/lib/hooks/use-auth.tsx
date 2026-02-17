'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  /** Whether this is a guest session (no DB user). */
  isGuest: boolean;
  /** Subscription tier from /api/auth/me (null until profile is fetched). */
  subscriptionTier?: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  guestLogin: () => Promise<void>;
  logout: () => void;
}

const TOKEN_KEY = 'rad-ai-token';
const REFRESH_TOKEN_KEY = 'rad-ai-refresh-token';
const USER_KEY = 'rad-ai-user';

const API_BASE = '';

/** Token refresh interval: 4 minutes (tokens typically expire in 15-60 min). */
const REFRESH_INTERVAL_MS = 4 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode the payload section of a JWT (base64url) without verifying the
 * signature.  We only need the claims (`sub`, `email`, `exp`) that the
 * backend embeds so we can populate the local User object immediately
 * after login without an extra round-trip to /api/auth/me.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  // base64url -> base64 -> decode
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(base64);
  return JSON.parse(json);
}

/** Returns true if the JWT will expire within the given number of seconds. */
function isTokenExpiringSoon(token: string, withinSeconds: number = 120): boolean {
  try {
    const claims = decodeJwtPayload(token);
    const exp = claims.exp as number | undefined;
    if (!exp) return false;
    return (exp * 1000 - Date.now()) < withinSeconds * 1000;
  } catch {
    return true; // If we cannot decode, treat it as expiring
  }
}

type AuthApiResponse = {
  token?: string;
  access_token?: string;
  refresh_token?: string;
  user_id?: string;
  name?: string;
};

type TokenRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
};

type UserProfileResponse = {
  id: string;
  email: string;
  display_name?: string | null;
  subscription_tier: string;
  usage_count: number;
  is_active: boolean;
  created_at?: string | null;
};

function extractAccessToken(data: AuthApiResponse): string {
  return data.token ?? data.access_token ?? '';
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      const token = localStorage.getItem(TOKEN_KEY);
      if (stored && token) {
        const parsed = JSON.parse(stored) as User;
        // Backward compat: ensure isGuest field exists
        if (parsed.isGuest === undefined) {
          parsed.isGuest = parsed.id.startsWith('guest-');
        }
        setUser(parsed);
      }
    } catch {
      // ignore corrupt data
    }
    setLoading(false);
  }, []);

  const persistAuth = useCallback((accessToken: string, refreshToken: string, u: User) => {
    try {
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch {
      // localStorage quota exceeded -- continue with in-memory state
    }
    setUser(u);
  }, []);

  // ------------------------------------------------------------------
  // Token refresh
  // ------------------------------------------------------------------

  const refreshAccessToken = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (!refreshToken || !currentToken) return false;

    // Only refresh if the access token is expiring within 2 minutes
    if (!isTokenExpiringSoon(currentToken, 120)) return true;

    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal,
      });
      if (!res.ok) {
        // If refresh fails with 401, session is dead -- log out
        if (res.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setUser(null);
        }
        return false;
      }
      const data = (await res.json()) as TokenRefreshResponse;
      const newAccessToken = data.access_token ?? '';
      if (newAccessToken) {
        try {
          localStorage.setItem(TOKEN_KEY, newAccessToken);
          if (data.refresh_token) {
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
          }
        } catch {
          // localStorage quota -- tokens stay in memory via closure
        }
      }
      return true;
    } catch {
      // Network error or aborted -- silent failure, will retry next interval
      return false;
    }
  }, []);

  // Set up periodic token refresh when user is logged in
  useEffect(() => {
    if (!user) {
      // Clean up any existing timer when logged out
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // Immediate check on login
    refreshAccessToken(controller.signal);

    // Periodic refresh
    refreshTimerRef.current = setInterval(() => {
      refreshAccessToken(controller.signal);
    }, REFRESH_INTERVAL_MS);

    return () => {
      controller.abort();
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [user, refreshAccessToken]);

  // ------------------------------------------------------------------
  // Fetch user profile from /api/auth/me (enriches user with tier info)
  // ------------------------------------------------------------------

  const fetchProfile = useCallback(async (accessToken: string, baseUser: User): Promise<User> => {
    // Skip profile fetch for guest users -- /api/auth/me does a DB lookup
    // that will fail for guest tokens in SQLite mode.
    if (baseUser.isGuest) return baseUser;

    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) return baseUser;
      const profile = (await res.json()) as UserProfileResponse;
      return {
        ...baseUser,
        name: profile.display_name || baseUser.name,
        subscriptionTier: profile.subscription_tier,
      };
    } catch {
      // Profile fetch is best-effort -- fall back to base user
      return baseUser;
    }
  }, []);

  // ------------------------------------------------------------------
  // Auth actions
  // ------------------------------------------------------------------

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Login failed (${res.status})`);
      }
      const data = (await res.json()) as AuthApiResponse;
      const accessToken = extractAccessToken(data);
      const refreshToken = data.refresh_token ?? '';
      if (!accessToken || !refreshToken) {
        throw new Error('Login response missing tokens');
      }

      let userId = data.user_id;
      let userEmail = email;
      try {
        const claims = decodeJwtPayload(accessToken);
        userId = userId ?? (claims.sub as string);
        userEmail = (claims.email as string) ?? userEmail;
      } catch {
        // If claims cannot be decoded, continue with API-provided fields.
      }

      const baseUser: User = {
        id: userId || email,
        email: userEmail,
        name: data.name || userEmail,
        isGuest: false,
      };

      // Persist immediately so the UI updates, then enrich in the background
      persistAuth(accessToken, refreshToken, baseUser);

      // Fetch full profile from /api/auth/me to get subscription_tier etc.
      fetchProfile(accessToken, baseUser).then((enrichedUser) => {
        if (enrichedUser !== baseUser) {
          persistAuth(accessToken, refreshToken, enrichedUser);
        }
      });
    },
    [persistAuth, fetchProfile],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Backend accepts both `name` and `display_name`; use the canonical field.
        body: JSON.stringify({ email, password, display_name: name }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Registration failed (${res.status})`);
      }
      const data = (await res.json()) as AuthApiResponse;
      const accessToken = extractAccessToken(data);
      const refreshToken = data.refresh_token ?? '';
      if (!accessToken || !refreshToken) {
        throw new Error('Registration response missing tokens');
      }

      let userId = data.user_id;
      let userEmail = email;
      try {
        const claims = decodeJwtPayload(accessToken);
        userId = userId ?? (claims.sub as string);
        userEmail = (claims.email as string) ?? userEmail;
      } catch {
        // If claims cannot be decoded, continue with API-provided fields.
      }

      const baseUser: User = {
        id: userId || email,
        email: userEmail,
        name: data.name || name || userEmail,
        isGuest: false,
      };

      persistAuth(accessToken, refreshToken, baseUser);

      // Fetch full profile from /api/auth/me to get subscription_tier etc.
      fetchProfile(accessToken, baseUser).then((enrichedUser) => {
        if (enrichedUser !== baseUser) {
          persistAuth(accessToken, refreshToken, enrichedUser);
        }
      });
    },
    [persistAuth, fetchProfile],
  );

  const guestLogin = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(body || `Guest login failed (${res.status})`);
    }
    const data = (await res.json()) as AuthApiResponse;
    const accessToken = extractAccessToken(data);
    const refreshToken = data.refresh_token ?? '';
    if (!accessToken) {
      throw new Error('Guest login response missing token');
    }

    persistAuth(accessToken, refreshToken, {
      id: data.user_id || 'guest',
      email: 'guest@local',
      name: data.name || 'Guest',
      isGuest: true,
    });
  }, [persistAuth]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, guestLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
