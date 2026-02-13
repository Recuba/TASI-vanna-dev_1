/**
 * Session management for Ra'd AI.
 *
 * Tracks session state in a secure cookie, auto-extends on activity,
 * and warns before expiry.
 */

import { getAuthConfig } from '@/config/auth';

const SESSION_COOKIE_NAME = 'raid-session';

export interface SessionInfo {
  userId: string;
  role: string;
  startedAt: number;
  expiresAt: number;
  lastActivity: number;
}

type ExpiryWarningCallback = (secondsRemaining: number) => void;

/**
 * Thin cookie helpers. If the security-headers teammate's `@/lib/cookies`
 * module is available at runtime, prefer importing from there instead.
 * These are self-contained fallbacks so the module compiles independently.
 */
function setSessionCookie(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === 'undefined') return;
  const isSecure = window.location.protocol === 'https:';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `SameSite=Strict`,
    `Max-Age=${maxAgeSec}`,
  ];
  if (isSecure) parts.push('Secure');
  document.cookie = parts.join('; ');
}

function getSessionCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteSessionCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Path=/; Max-Age=0`;
}

export class SessionManager {
  private activityTimer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private onExpiryWarning: ExpiryWarningCallback | null = null;
  private onSessionExpired: (() => void) | null = null;
  private activityDebounceMs = 5000;

  setCallbacks(opts: {
    onExpiryWarning?: ExpiryWarningCallback;
    onSessionExpired?: () => void;
  }): void {
    this.onExpiryWarning = opts.onExpiryWarning ?? null;
    this.onSessionExpired = opts.onSessionExpired ?? null;
  }

  startSession(userId: string, role: string): SessionInfo {
    const config = getAuthConfig();
    const now = Date.now();
    const session: SessionInfo = {
      userId,
      role,
      startedAt: now,
      expiresAt: now + config.sessionTimeout * 1000,
      lastActivity: now,
    };
    this.persist(session);
    this.scheduleTimers(session);
    this.listenForActivity();
    return session;
  }

  endSession(): void {
    this.clearTimers();
    this.stopActivityListener();
    deleteSessionCookie(SESSION_COOKIE_NAME);
  }

  refreshSession(): SessionInfo | null {
    const session = this.getSessionInfo();
    if (!session) return null;

    const config = getAuthConfig();
    const now = Date.now();
    session.expiresAt = now + config.sessionTimeout * 1000;
    session.lastActivity = now;
    this.persist(session);
    this.scheduleTimers(session);
    return session;
  }

  getSessionInfo(): SessionInfo | null {
    const raw = getSessionCookie(SESSION_COOKIE_NAME);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionInfo;
    } catch {
      return null;
    }
  }

  isSessionValid(): boolean {
    const session = this.getSessionInfo();
    if (!session) return false;
    return Date.now() < session.expiresAt;
  }

  // --- internal ---

  private persist(session: SessionInfo): void {
    const config = getAuthConfig();
    setSessionCookie(
      SESSION_COOKIE_NAME,
      JSON.stringify(session),
      config.sessionTimeout,
    );
  }

  private scheduleTimers(session: SessionInfo): void {
    this.clearTimers();

    const config = getAuthConfig();
    const now = Date.now();
    const msUntilExpiry = session.expiresAt - now;
    const msUntilWarning = msUntilExpiry - config.expiryWarningSeconds * 1000;

    if (msUntilWarning > 0 && this.onExpiryWarning) {
      const cb = this.onExpiryWarning;
      this.warningTimer = setTimeout(() => {
        cb(config.expiryWarningSeconds);
      }, msUntilWarning);
    }

    if (msUntilExpiry > 0) {
      this.expiryTimer = setTimeout(() => {
        this.endSession();
        this.onSessionExpired?.();
      }, msUntilExpiry);
    }
  }

  private clearTimers(): void {
    if (this.warningTimer) clearTimeout(this.warningTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.warningTimer = null;
    this.expiryTimer = null;
    this.activityTimer = null;
  }

  private handleActivity = (): void => {
    if (this.activityTimer) return; // debounce
    this.activityTimer = setTimeout(() => {
      this.activityTimer = null;
      this.refreshSession();
    }, this.activityDebounceMs);
  };

  private listenForActivity(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('mousemove', this.handleActivity);
    window.addEventListener('keydown', this.handleActivity);
    window.addEventListener('click', this.handleActivity);
    window.addEventListener('scroll', this.handleActivity);
  }

  private stopActivityListener(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('mousemove', this.handleActivity);
    window.removeEventListener('keydown', this.handleActivity);
    window.removeEventListener('click', this.handleActivity);
    window.removeEventListener('scroll', this.handleActivity);
  }
}

/** Singleton instance for app-wide use. */
export const sessionManager = new SessionManager();
