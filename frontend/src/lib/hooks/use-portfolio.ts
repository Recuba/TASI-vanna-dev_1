'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioTransaction {
  id: string;
  ticker: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees: number;
  date: string; // YYYY-MM-DD
  notes: string;
}

export interface Holding {
  ticker: string;
  totalShares: number;
  avgCostBasis: number;
  totalCost: number;
  transactions: PortfolioTransaction[];
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'rad-ai-portfolio-transactions';

function readTransactions(): PortfolioTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeTransactions(txns: PortfolioTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txns));
  } catch {
    // quota exceeded – silently drop
  }
}

// Simple external-store subscription for cross-component sync
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

export function usePortfolio() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const transactions: PortfolioTransaction[] = useMemo(() => {
    try { return JSON.parse(raw); } catch { return []; }
  }, [raw]);

  // ---- derived holdings ----
  const holdings = useMemo(() => {
    const map = new Map<string, { shares: number; cost: number; txns: PortfolioTransaction[] }>();
    for (const tx of transactions) {
      const entry = map.get(tx.ticker) || { shares: 0, cost: 0, txns: [] };
      if (tx.type === 'buy') {
        entry.cost += tx.quantity * tx.price + tx.fees;
        entry.shares += tx.quantity;
      } else {
        // sell: reduce shares, proportionally reduce cost basis
        const sharesToSell = Math.min(tx.quantity, entry.shares);
        if (entry.shares > 0) {
          const costPerShare = entry.cost / entry.shares;
          entry.cost -= sharesToSell * costPerShare;
        }
        entry.shares -= sharesToSell;
        entry.cost -= tx.fees; // fees reduce proceeds, effectively increase cost
      }
      entry.txns.push(tx);
      map.set(tx.ticker, entry);
    }
    const result: Holding[] = [];
    for (const [ticker, entry] of Array.from(map.entries())) {
      if (entry.shares > 0) {
        result.push({
          ticker,
          totalShares: entry.shares,
          avgCostBasis: entry.cost / entry.shares,
          totalCost: entry.cost,
          transactions: entry.txns,
        });
      }
    }
    return result;
  }, [transactions]);

  const tickers = useMemo(() => holdings.map((h) => h.ticker), [holdings]);

  // ---- mutations ----
  const addTransaction = useCallback((tx: Omit<PortfolioTransaction, 'id'>) => {
    const all = readTransactions();
    all.push({ ...tx, id: crypto.randomUUID() });
    writeTransactions(all);
    emitChange();
  }, []);

  const removeTransaction = useCallback((id: string) => {
    const all = readTransactions().filter((t) => t.id !== id);
    writeTransactions(all);
    emitChange();
  }, []);

  const clearAll = useCallback(() => {
    writeTransactions([]);
    emitChange();
  }, []);

  return { transactions, holdings, tickers, addTransaction, removeTransaction, clearAll };
}
