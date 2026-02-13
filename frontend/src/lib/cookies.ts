'use client';

export interface CookieOptions {
  /** Max age in seconds */
  maxAge?: number;
  /** Expiry date */
  expires?: Date;
  /** Cookie path (default: "/") */
  path?: string;
  /** Cookie domain */
  domain?: string;
  /** SameSite attribute (default: "Strict") */
  sameSite?: 'Strict' | 'Lax' | 'None';
}

function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:';
}

export function setSecureCookie(
  name: string,
  value: string,
  options?: CookieOptions,
): void {
  if (typeof document === 'undefined') return;

  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${options?.path ?? '/'}`,
    `SameSite=${options?.sameSite ?? 'Strict'}`,
  ];

  if (isSecureContext()) {
    parts.push('Secure');
  }

  if (options?.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options?.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options?.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  document.cookie = parts.join('; ');
}

export function getSecureCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const encoded = encodeURIComponent(name);
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function deleteSecureCookie(name: string, options?: Pick<CookieOptions, 'path' | 'domain'>): void {
  setSecureCookie(name, '', {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  });
}
