import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('auth config', () => {
  beforeEach(() => {
    // Reset module cache so getAuthConfig re-evaluates
    vi.resetModules();
  });

  it('returns default values when no env vars set', async () => {
    const { getAuthConfig } = await import('@/config/auth');
    const config = getAuthConfig();
    expect(config.sessionTimeout).toBe(3600);
    expect(config.refreshInterval).toBe(300);
    expect(config.maxConcurrentSessions).toBe(3);
    expect(config.authRedirect).toBe('/chat');
    expect(config.loginPath).toBe('/login');
    expect(config.expiryWarningSeconds).toBe(300);
  });

  it('reads NEXT_PUBLIC_SESSION_TIMEOUT from env', async () => {
    process.env.NEXT_PUBLIC_SESSION_TIMEOUT = '7200';
    const { getAuthConfig } = await import('@/config/auth');
    const config = getAuthConfig();
    expect(config.sessionTimeout).toBe(7200);
    delete process.env.NEXT_PUBLIC_SESSION_TIMEOUT;
  });

  it('reads NEXT_PUBLIC_AUTH_REDIRECT from env', async () => {
    process.env.NEXT_PUBLIC_AUTH_REDIRECT = '/dashboard';
    const { getAuthConfig } = await import('@/config/auth');
    const config = getAuthConfig();
    expect(config.authRedirect).toBe('/dashboard');
    delete process.env.NEXT_PUBLIC_AUTH_REDIRECT;
  });

  it('handles invalid timeout gracefully', async () => {
    process.env.NEXT_PUBLIC_SESSION_TIMEOUT = 'not-a-number';
    const { getAuthConfig } = await import('@/config/auth');
    const config = getAuthConfig();
    expect(config.sessionTimeout).toBe(3600);
    delete process.env.NEXT_PUBLIC_SESSION_TIMEOUT;
  });
});
