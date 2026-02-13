import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '@/lib/auth/session';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    // Clear cookies
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.endSession();
    vi.useRealTimers();
  });

  it('starts a session and returns session info', () => {
    const session = manager.startSession('user-1', 'analyst');
    expect(session.userId).toBe('user-1');
    expect(session.role).toBe('analyst');
    expect(session.startedAt).toBeGreaterThan(0);
    expect(session.expiresAt).toBeGreaterThan(session.startedAt);
  });

  it('isSessionValid returns true for active session', () => {
    manager.startSession('user-1', 'viewer');
    expect(manager.isSessionValid()).toBe(true);
  });

  it('getSessionInfo returns null when no session', () => {
    expect(manager.getSessionInfo()).toBeNull();
  });

  it('endSession clears session', () => {
    manager.startSession('user-1', 'admin');
    manager.endSession();
    // After ending, cookie is cleared so getSessionInfo returns null
    expect(manager.getSessionInfo()).toBeNull();
  });

  it('refreshSession extends the expiry', () => {
    const session = manager.startSession('user-1', 'analyst');
    const originalExpiry = session.expiresAt;

    // Advance time by 10 seconds
    vi.advanceTimersByTime(10000);

    const refreshed = manager.refreshSession();
    expect(refreshed).not.toBeNull();
    expect(refreshed!.expiresAt).toBeGreaterThan(originalExpiry);
  });

  it('refreshSession returns null when no session', () => {
    expect(manager.refreshSession()).toBeNull();
  });

  it('calls onSessionExpired when session times out', () => {
    const onExpired = vi.fn();
    manager.setCallbacks({ onSessionExpired: onExpired });
    manager.startSession('user-1', 'viewer');

    // Default timeout is 3600 seconds
    vi.advanceTimersByTime(3600 * 1000 + 100);

    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('calls onExpiryWarning before session expires', () => {
    const onWarning = vi.fn();
    manager.setCallbacks({ onExpiryWarning: onWarning });
    manager.startSession('user-1', 'viewer');

    // Warning should fire at (3600 - 300) = 3300 seconds
    vi.advanceTimersByTime(3300 * 1000 + 100);

    expect(onWarning).toHaveBeenCalledWith(300);
  });
});
