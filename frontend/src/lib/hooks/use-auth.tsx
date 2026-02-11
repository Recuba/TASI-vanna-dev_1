'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: string;
  email: string;
  name: string;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode the payload section of a JWT (base64url) without verifying the
 * signature.  We only need the claims (`sub`, `email`) that the backend
 * embeds so we can populate the local User object immediately after login
 * without an extra round-trip to /api/auth/me.
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

type AuthApiResponse = {
  token?: string;
  access_token?: string;
  refresh_token?: string;
  user_id?: string;
  name?: string;
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

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as User;
        setUser(parsed);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const persistAuth = useCallback((accessToken: string, refreshToken: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

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

      persistAuth(accessToken, refreshToken, {
        id: userId || email,
        email: userEmail,
        name: data.name || userEmail,
      });
    },
    [persistAuth],
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

      persistAuth(accessToken, refreshToken, {
        id: userId || email,
        email: userEmail,
        name: data.name || name || userEmail,
      });
    },
    [persistAuth],
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
