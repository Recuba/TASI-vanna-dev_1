'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser, Role } from '@/types/auth';
import { hasPermission, hasRole } from '@/types/auth';
import { getAuthConfig } from '@/config/auth';
import { sessionManager } from '@/lib/auth/session';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => void;
  /** Check if current user has a specific permission */
  checkPermission: (action: string, resource: string) => boolean;
  /** Check if current user meets a minimum role level */
  checkRole: (minimumRole: Role) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'rad-ai-token';
const REFRESH_TOKEN_KEY = 'rad-ai-refresh-token';
const USER_KEY = 'rad-ai-user';
const API_BASE = '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
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
  role?: string;
};

function extractAccessToken(data: AuthApiResponse): string {
  return data.token ?? data.access_token ?? '';
}

function extractRole(data: AuthApiResponse, claims: Record<string, unknown>): Role {
  const roleStr = data.role ?? (claims.role as string | undefined) ?? 'viewer';
  if (roleStr === 'admin' || roleStr === 'analyst' || roleStr === 'viewer') {
    return roleStr;
  }
  return 'viewer';
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RBACAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = user !== null;

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      const token = localStorage.getItem(TOKEN_KEY);
      if (stored && token) {
        const parsed = JSON.parse(stored) as AuthUser;
        // Ensure role field exists (backward compat with old use-auth data)
        if (!parsed.role) parsed.role = 'viewer';
        setUser(parsed);

        // Restore session tracking
        const existingSession = sessionManager.getSessionInfo();
        if (!existingSession || !sessionManager.isSessionValid()) {
          sessionManager.startSession(parsed.id, parsed.role);
        }
      }
    } catch {
      // ignore corrupt data
    }
    setIsLoading(false);
  }, []);

  // Set up session expiry callback
  useEffect(() => {
    sessionManager.setCallbacks({
      onSessionExpired: () => {
        // Auto-logout on session expiry
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      },
    });
  }, []);

  // Periodic token refresh
  useEffect(() => {
    if (!user) return;

    const config = getAuthConfig();
    const interval = setInterval(async () => {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) return;

      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (res.ok) {
          const data = (await res.json()) as AuthApiResponse;
          const newToken = extractAccessToken(data);
          if (newToken) {
            localStorage.setItem(TOKEN_KEY, newToken);
            if (data.refresh_token) {
              localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
            }
          }
        }
      } catch {
        // Silent failure on refresh — session will expire naturally
      }
    }, config.refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [user]);

  const persistAuth = useCallback((accessToken: string, refreshToken: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    sessionManager.startSession(u.id, u.role);
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
      if (!accessToken) throw new Error('Login response missing token');

      let claims: Record<string, unknown> = {};
      try {
        claims = decodeJwtPayload(accessToken);
      } catch {
        // continue with API-provided fields
      }

      const role = extractRole(data, claims);
      const userId = data.user_id ?? (claims.sub as string) ?? email;
      const userEmail = (claims.email as string) ?? email;

      persistAuth(accessToken, refreshToken, {
        id: userId,
        email: userEmail,
        name: data.name ?? userEmail,
        role,
      });
    },
    [persistAuth],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    sessionManager.endSession();
  }, []);

  const refreshSessionFn = useCallback(() => {
    sessionManager.refreshSession();
  }, []);

  const checkPermission = useCallback(
    (action: string, resource: string): boolean => {
      if (!user) return false;
      return hasPermission(user.role, action, resource);
    },
    [user],
  );

  const checkRole = useCallback(
    (minimumRole: Role): boolean => {
      if (!user) return false;
      return hasRole(user.role, minimumRole);
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refreshSession: refreshSessionFn,
      checkPermission,
      checkRole,
    }),
    [user, isLoading, isAuthenticated, login, logout, refreshSessionFn, checkPermission, checkRole],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access RBAC auth context. Throws if used outside RBACAuthProvider.
 */
export function useRBACAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useRBACAuth must be used within a RBACAuthProvider');
  }
  return ctx;
}
