/**
 * Auth configuration for Ra'd AI.
 * Reads from NEXT_PUBLIC_* env vars with sensible defaults.
 */

export interface AuthConfig {
  /** Session timeout in seconds (default: 3600 = 1 hour) */
  sessionTimeout: number;
  /** Token refresh interval in seconds (default: 300 = 5 minutes) */
  refreshInterval: number;
  /** Max concurrent sessions per user (default: 3) */
  maxConcurrentSessions: number;
  /** Redirect path after login (default: /chat) */
  authRedirect: string;
  /** Redirect path when unauthenticated (default: /login) */
  loginPath: string;
  /** Seconds before expiry to show warning (default: 300 = 5 minutes) */
  expiryWarningSeconds: number;
}

let _config: AuthConfig | null = null;

export function getAuthConfig(): AuthConfig {
  if (_config) return _config;

  const timeout = parseInt(
    process.env.NEXT_PUBLIC_SESSION_TIMEOUT || '3600',
    10,
  );
  const redirect = process.env.NEXT_PUBLIC_AUTH_REDIRECT || '/chat';

  _config = {
    sessionTimeout: isNaN(timeout) ? 3600 : timeout,
    refreshInterval: 300,
    maxConcurrentSessions: 3,
    authRedirect: redirect,
    loginPath: '/login',
    expiryWarningSeconds: 300,
  };

  return _config;
}
