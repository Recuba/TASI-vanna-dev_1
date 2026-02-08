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
  logout: () => void;
}

const TOKEN_KEY = 'rad-ai-token';
const USER_KEY = 'rad-ai-user';
const USER_ID_KEY = 'rad-ai-user-id';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

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

  const persistAuth = useCallback((token: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    localStorage.setItem(USER_ID_KEY, u.id);
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
      const data = await res.json();
      persistAuth(data.token, { id: data.user_id, email, name: data.name ?? email });
    },
    [persistAuth],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Registration failed (${res.status})`);
      }
      const data = await res.json();
      persistAuth(data.token, { id: data.user_id, email, name });
    },
    [persistAuth],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_ID_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
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
