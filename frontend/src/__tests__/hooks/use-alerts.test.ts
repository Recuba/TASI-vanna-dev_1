/**
 * Tests for use-alerts.ts hook.
 *
 * Strategy:
 * - Mock localStorage with a simple in-memory store.
 * - Mock useBatchQuotes to return controlled quotes.
 * - Use renderHook + act from @testing-library/react.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// In-memory localStorage mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

// ---------------------------------------------------------------------------
// Mock crypto.randomUUID (jsdom may not provide it)
// ---------------------------------------------------------------------------

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `test-uuid-${++uuidCounter}`),
});

// ---------------------------------------------------------------------------
// Mock useBatchQuotes
// ---------------------------------------------------------------------------

const mockUseBatchQuotes = vi.fn().mockReturnValue({ data: [], loading: false, error: null });
vi.mock('@/lib/hooks/use-api', () => ({
  useBatchQuotes: (...args: unknown[]) => mockUseBatchQuotes(...args),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useAlerts } from '@/lib/hooks/use-alerts';
import type { AlertCreate } from '@/lib/api/alerts';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function clearStore() {
  for (const k of Object.keys(store)) delete store[k];
  // Reset vi mock implementation to reflect empty store
  localStorageMock.getItem.mockImplementation((key: string) => store[key] ?? null);
  localStorageMock.setItem.mockImplementation((key: string, value: string) => { store[key] = value; });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAlerts', () => {
  beforeEach(() => {
    clearStore();
    uuidCounter = 0;
    vi.clearAllMocks();
    localStorageMock.getItem.mockImplementation((key: string) => store[key] ?? null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => { store[key] = value; });
    mockUseBatchQuotes.mockReturnValue({ data: [], loading: false, error: null });
  });

  // ---- addAlert ----

  it('addAlert creates alert with correct fields', () => {
    const { result } = renderHook(() => useAlerts());

    const create: AlertCreate = {
      ticker: '2222',
      alert_type: 'price_above',
      threshold_value: 50,
    };

    let returned: ReturnType<typeof result.current.addAlert>;
    act(() => {
      returned = result.current.addAlert(create);
    });

    // returned value has required fields
    expect(returned!.id).toBe('test-uuid-1');
    expect(returned!.ticker).toBe('2222');
    expect(returned!.alert_type).toBe('price_above');
    expect(returned!.threshold_value).toBe(50);
    expect(returned!.is_active).toBe(true);
    expect(returned!.last_triggered_at).toBeNull();
    expect(typeof returned!.created_at).toBe('string');

    // hook state updated
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].id).toBe('test-uuid-1');
  });

  // ---- removeAlert ----

  it('removeAlert removes alert by id', () => {
    const { result } = renderHook(() => useAlerts());

    act(() => {
      result.current.addAlert({ ticker: '2222', alert_type: 'price_above', threshold_value: 50 });
      result.current.addAlert({ ticker: '1010', alert_type: 'price_below', threshold_value: 30 });
    });

    expect(result.current.alerts).toHaveLength(2);

    act(() => {
      result.current.removeAlert('test-uuid-1');
    });

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].id).toBe('test-uuid-2');
    expect(result.current.alerts[0].ticker).toBe('1010');
  });

  // ---- toggleAlert ----

  it('toggleAlert flips is_active', () => {
    const { result } = renderHook(() => useAlerts());

    act(() => {
      result.current.addAlert({ ticker: '2222', alert_type: 'price_above', threshold_value: 50 });
    });

    expect(result.current.alerts[0].is_active).toBe(true);

    act(() => {
      result.current.toggleAlert('test-uuid-1');
    });

    expect(result.current.alerts[0].is_active).toBe(false);

    act(() => {
      result.current.toggleAlert('test-uuid-1');
    });

    expect(result.current.alerts[0].is_active).toBe(true);
  });

  // ---- clearAll ----

  it('clearAll empties the alerts list', () => {
    const { result } = renderHook(() => useAlerts());

    act(() => {
      result.current.addAlert({ ticker: '2222', alert_type: 'price_above', threshold_value: 50 });
      result.current.addAlert({ ticker: '1010', alert_type: 'price_below', threshold_value: 30 });
    });

    expect(result.current.alerts).toHaveLength(2);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.alerts).toHaveLength(0);
  });

  // ---- triggeredAlerts: price_above triggered ----

  it('triggeredAlerts includes alert when price >= threshold (price_above)', () => {
    mockUseBatchQuotes.mockReturnValue({
      data: [{ ticker: '2222', current_price: 55, name: 'Aramco' }],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useAlerts());

    act(() => {
      result.current.addAlert({ ticker: '2222', alert_type: 'price_above', threshold_value: 50 });
    });

    expect(result.current.triggeredAlerts).toHaveLength(1);
    expect(result.current.triggeredAlerts[0].ticker).toBe('2222');
  });

  // ---- triggeredAlerts: price_above NOT triggered ----

  it('triggeredAlerts excludes alert when price < threshold (price_above)', () => {
    mockUseBatchQuotes.mockReturnValue({
      data: [{ ticker: '2222', current_price: 45, name: 'Aramco' }],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useAlerts());

    act(() => {
      result.current.addAlert({ ticker: '2222', alert_type: 'price_above', threshold_value: 50 });
    });

    expect(result.current.triggeredAlerts).toHaveLength(0);
  });

  // ---- newTriggeredCount: increments for unseen triggers ----

  it('newTriggeredCount is 1 when a new alert is triggered for the first time', () => {
    mockUseBatchQuotes.mockReturnValue({
      data: [{ ticker: '2222', current_price: 55, name: 'Aramco' }],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useAlerts());

    act(() => {
      result.current.addAlert({ ticker: '2222', alert_type: 'price_above', threshold_value: 50 });
    });

    // Not yet marked as seen → newTriggeredCount should be 1
    expect(result.current.newTriggeredCount).toBe(1);
  });

  it('markAllSeen persists triggered ids to localStorage', () => {
    mockUseBatchQuotes.mockReturnValue({
      data: [{ ticker: '2222', current_price: 55, name: 'Aramco' }],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useAlerts());

    act(() => {
      result.current.addAlert({ ticker: '2222', alert_type: 'price_above', threshold_value: 50 });
    });

    expect(result.current.newTriggeredCount).toBe(1);

    act(() => {
      result.current.markAllSeen();
    });

    // markAllSeen writes triggered IDs to localStorage (rad-ai-triggered-alerts)
    const saved = store['rad-ai-triggered-alerts'];
    expect(saved).toBeDefined();
    const ids: string[] = JSON.parse(saved);
    // The triggered alert ID should be persisted
    expect(ids).toContain(result.current.triggeredAlerts[0].id);
  });

  it('newTriggeredCount is 0 when triggered alert ids are already in the seen set', () => {
    // Simulate alerts that have already been triggered and persisted to localStorage
    // before the hook mounts (simulating a return visit after markAllSeen was called)
    mockUseBatchQuotes.mockReturnValue({
      data: [{ ticker: '2222', current_price: 55, name: 'Aramco' }],
      loading: false,
      error: null,
    });

    // Pre-populate alerts and triggered store to simulate returning user
    const alertId = 'pre-existing-alert-id';
    const alertData = [{
      id: alertId,
      ticker: '2222',
      alert_type: 'price_above' as const,
      threshold_value: 50,
      is_active: true,
      last_triggered_at: null,
      created_at: new Date().toISOString(),
    }];
    store['rad-ai-price-alerts'] = JSON.stringify(alertData);
    // Mark the alert as already seen
    store['rad-ai-triggered-alerts'] = JSON.stringify([alertId]);

    const { result } = renderHook(() => useAlerts());

    // The alert is triggered (price 55 > 50), but already in the seen set on mount
    expect(result.current.triggeredAlerts).toHaveLength(1);
    expect(result.current.newTriggeredCount).toBe(0);
  });
});
