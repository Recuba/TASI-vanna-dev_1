/**
 * Tests for use-portfolio.ts hook.
 *
 * Strategy:
 * - Mock localStorage with a simple in-memory store.
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
// Mock crypto.randomUUID
// ---------------------------------------------------------------------------

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `portfolio-uuid-${++uuidCounter}`),
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { usePortfolio } from '@/lib/hooks/use-portfolio';
import type { PortfolioTransaction } from '@/lib/hooks/use-portfolio';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function clearStore() {
  for (const k of Object.keys(store)) delete store[k];
}

type TxInput = Omit<PortfolioTransaction, 'id'>;

function makeBuy(ticker: string, quantity: number, price: number, fees = 0): TxInput {
  return { ticker, type: 'buy', quantity, price, fees, date: '2025-01-01', notes: '' };
}

function makeSell(ticker: string, quantity: number, price: number, fees = 0): TxInput {
  return { ticker, type: 'sell', quantity, price, fees, date: '2025-01-02', notes: '' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePortfolio', () => {
  beforeEach(() => {
    clearStore();
    uuidCounter = 0;
    vi.clearAllMocks();
    localStorageMock.getItem.mockImplementation((key: string) => store[key] ?? null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => { store[key] = value; });
  });

  // ---- addTransaction ----

  it('addTransaction (buy) creates transaction with correct fields', () => {
    const { result } = renderHook(() => usePortfolio());

    act(() => {
      result.current.addTransaction(makeBuy('2222', 100, 30));
    });

    expect(result.current.transactions).toHaveLength(1);
    const tx = result.current.transactions[0];
    expect(tx.id).toBe('portfolio-uuid-1');
    expect(tx.ticker).toBe('2222');
    expect(tx.type).toBe('buy');
    expect(tx.quantity).toBe(100);
    expect(tx.price).toBe(30);
    expect(tx.fees).toBe(0);
  });

  // ---- holdings after 2 buys ----

  it('computes correct holdings after 2 buy transactions', () => {
    const { result } = renderHook(() => usePortfolio());

    act(() => {
      result.current.addTransaction(makeBuy('2222', 100, 30));  // cost = 3000
      result.current.addTransaction(makeBuy('2222', 50, 40));   // cost = 2000
    });

    expect(result.current.holdings).toHaveLength(1);
    const h = result.current.holdings[0];
    expect(h.ticker).toBe('2222');
    expect(h.totalShares).toBe(150);
    expect(h.totalCost).toBeCloseTo(5000);
    expect(h.avgCostBasis).toBeCloseTo(5000 / 150);
  });

  // ---- holdings after buy then sell ----

  it('reduces shares and proportionally reduces cost after a sell', () => {
    const { result } = renderHook(() => usePortfolio());

    act(() => {
      result.current.addTransaction(makeBuy('2222', 100, 30));  // cost = 3000, shares = 100
      result.current.addTransaction(makeSell('2222', 40, 35));   // sell 40 shares
    });

    // After sell: shares = 60, cost reduced proportionally
    // costPerShare before sell = 3000/100 = 30
    // cost removed = 40 * 30 = 1200
    // remaining cost = 3000 - 1200 = 1800
    // fees = 0, so no further reduction
    expect(result.current.holdings).toHaveLength(1);
    const h = result.current.holdings[0];
    expect(h.ticker).toBe('2222');
    expect(h.totalShares).toBe(60);
    expect(h.totalCost).toBeCloseTo(1800);
    expect(h.avgCostBasis).toBeCloseTo(30);
  });

  // ---- sell fees reduce cost basis ----

  it('sell fees are subtracted from remaining cost basis', () => {
    const { result } = renderHook(() => usePortfolio());

    act(() => {
      result.current.addTransaction(makeBuy('2222', 100, 30));     // cost = 3000, shares = 100
      result.current.addTransaction(makeSell('2222', 0, 35, 50));  // no shares sold, fees = 50
    });

    // shares unchanged (sell qty = 0), cost = 3000 - 0 - 50 = 2950
    const h = result.current.holdings[0];
    expect(h.totalShares).toBe(100);
    expect(h.totalCost).toBeCloseTo(2950);
  });

  // ---- clearAll ----

  it('clearAll empties all transactions and holdings', () => {
    const { result } = renderHook(() => usePortfolio());

    act(() => {
      result.current.addTransaction(makeBuy('2222', 100, 30));
      result.current.addTransaction(makeBuy('1010', 50, 20));
    });

    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.holdings).toHaveLength(2);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.transactions).toHaveLength(0);
    expect(result.current.holdings).toHaveLength(0);
  });

  // ---- tickers derived from holdings ----

  it('tickers contains only tickers with positive remaining shares', () => {
    const { result } = renderHook(() => usePortfolio());

    act(() => {
      result.current.addTransaction(makeBuy('2222', 100, 30));
      result.current.addTransaction(makeBuy('1010', 50, 20));
      // Sell all shares of 1010
      result.current.addTransaction(makeSell('1010', 50, 25));
    });

    // 1010 shares fully sold → only 2222 remains
    expect(result.current.tickers).toEqual(['2222']);
    expect(result.current.tickers).not.toContain('1010');
  });

  // ---- multiple tickers in holdings ----

  it('tickers contains all tickers with positive shares', () => {
    const { result } = renderHook(() => usePortfolio());

    act(() => {
      result.current.addTransaction(makeBuy('2222', 100, 30));
      result.current.addTransaction(makeBuy('1010', 50, 20));
      result.current.addTransaction(makeBuy('4001', 200, 10));
    });

    expect(result.current.tickers).toHaveLength(3);
    expect(result.current.tickers).toContain('2222');
    expect(result.current.tickers).toContain('1010');
    expect(result.current.tickers).toContain('4001');
  });
});
