'use client';

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { AlertItem, AlertCreate } from '@/lib/api/alerts';
import { useBatchQuotes } from '@/lib/hooks/use-api';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'rad-ai-price-alerts';
const TRIGGERED_KEY = 'rad-ai-triggered-alerts';

function readAlerts(): AlertItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAlerts(alerts: AlertItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // quota exceeded
  }
}

function readTriggered(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TRIGGERED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeTriggered(ids: string[]): void {
  try {
    localStorage.setItem(TRIGGERED_KEY, JSON.stringify(ids));
  } catch {
    // quota exceeded
  }
}

// External store subscription
let listeners: Array<() => void> = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function emitChange() {
  for (const l of listeners) l();
}
function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) ?? '[]';
}
function getServerSnapshot() {
  return '[]';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAlerts() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const alerts: AlertItem[] = useMemo(() => {
    try { return JSON.parse(raw); } catch { return []; }
  }, [raw]);

  const activeAlerts = useMemo(() => alerts.filter((a) => a.is_active), [alerts]);
  const tickers = useMemo(() => {
    const set = new Set(activeAlerts.map((a) => a.ticker));
    return Array.from(set);
  }, [activeAlerts]);

  // Fetch live prices for alert tickers (30s auto-refresh)
  const { data: quotes } = useBatchQuotes(tickers);

  // Triggered alerts tracking
  const triggeredRef = useRef<Set<string>>(new Set(readTriggered()));

  // Evaluate alerts against live prices
  const triggeredAlerts = useMemo(() => {
    if (!quotes || quotes.length === 0) return [];
    const priceMap = new Map<string, number>();
    for (const q of quotes) {
      priceMap.set(q.ticker, q.current_price);
    }
    const triggered: AlertItem[] = [];
    for (const alert of activeAlerts) {
      const price = priceMap.get(alert.ticker);
      if (price === undefined) continue;
      let isTriggered = false;
      if (alert.alert_type === 'price_above' && price >= alert.threshold_value) {
        isTriggered = true;
      } else if (alert.alert_type === 'price_below' && price <= alert.threshold_value) {
        isTriggered = true;
      }
      if (isTriggered) {
        triggered.push(alert);
      }
    }
    return triggered;
  }, [activeAlerts, quotes]);

  // Count newly triggered (not yet seen)
  const newTriggeredCount = useMemo(() => {
    return triggeredAlerts.filter((a) => !triggeredRef.current.has(a.id)).length;
  }, [triggeredAlerts]);

  const markAllSeen = useCallback(() => {
    const ids = triggeredAlerts.map((a) => a.id);
    triggeredRef.current = new Set(ids);
    writeTriggered(ids);
    emitChange();
  }, [triggeredAlerts]);

  // Mutations
  const addAlert = useCallback((create: AlertCreate) => {
    const all = readAlerts();
    const newAlert: AlertItem = {
      ...create,
      id: crypto.randomUUID(),
      is_active: true,
      last_triggered_at: null,
      created_at: new Date().toISOString(),
    };
    all.push(newAlert);
    writeAlerts(all);
    emitChange();
    return newAlert;
  }, []);

  const removeAlert = useCallback((id: string) => {
    const all = readAlerts().filter((a) => a.id !== id);
    writeAlerts(all);
    emitChange();
  }, []);

  const toggleAlert = useCallback((id: string) => {
    const all = readAlerts();
    const idx = all.findIndex((a) => a.id === id);
    if (idx >= 0) {
      all[idx].is_active = !all[idx].is_active;
      writeAlerts(all);
      emitChange();
    }
  }, []);

  const clearAll = useCallback(() => {
    writeAlerts([]);
    writeTriggered([]);
    triggeredRef.current = new Set();
    emitChange();
  }, []);

  return {
    alerts,
    activeAlerts,
    triggeredAlerts,
    newTriggeredCount,
    addAlert,
    removeAlert,
    toggleAlert,
    clearAll,
    markAllSeen,
  };
}
