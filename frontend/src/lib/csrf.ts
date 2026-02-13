'use client';

import { useCallback, useEffect, useState } from 'react';

const CSRF_COOKIE_NAME = 'raid-csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export function generateCsrfToken(): string {
  return crypto.randomUUID();
}

export function validateCsrfToken(token: string, expected: string): boolean {
  if (!token || !expected) return false;
  // Constant-time comparison to prevent timing attacks
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  const isProduction = window.location.protocol === 'https:';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Strict',
  ];
  if (isProduction) {
    parts.push('Secure');
  }
  document.cookie = parts.join('; ');
}

function ensureCsrfToken(): string {
  let token = getCookie(CSRF_COOKIE_NAME);
  if (!token) {
    token = generateCsrfToken();
    setCookie(CSRF_COOKIE_NAME, token);
  }
  return token;
}

export interface UseCsrfReturn {
  token: string;
  headerName: string;
}

export function useCsrf(): UseCsrfReturn {
  const [token, setToken] = useState('');

  useEffect(() => {
    setToken(ensureCsrfToken());
  }, []);

  return { token, headerName: CSRF_HEADER_NAME };
}

/**
 * Returns headers object with the CSRF token for use in mutation requests.
 * Call this before POST/PUT/DELETE fetch calls.
 */
export function getCsrfHeaders(): Record<string, string> {
  const token = getCookie(CSRF_COOKIE_NAME);
  if (!token) return {};
  return { [CSRF_HEADER_NAME]: token };
}

/**
 * React hook returning a fetch wrapper that automatically includes CSRF headers
 * on mutation requests (POST, PUT, DELETE, PATCH).
 */
export function useCsrfFetch() {
  const { token, headerName } = useCsrf();

  const csrfFetch = useCallback(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

      if (isMutation && token) {
        const headers = new Headers(init?.headers);
        headers.set(headerName, token);
        return fetch(input, { ...init, headers });
      }

      return fetch(input, init);
    },
    [token, headerName],
  );

  return csrfFetch;
}
