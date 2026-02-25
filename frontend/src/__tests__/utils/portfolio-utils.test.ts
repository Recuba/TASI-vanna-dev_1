/**
 * Tests for pure utility functions in portfolio/page.tsx.
 *
 * formatNum is a local helper (not exported). We reproduce it here
 * to verify the formatting contract.
 *
 * The AddTransactionModal submit logic (ticker .SR normalization,
 * type/quantity/price/fees parsing) is tested via the component test.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Reproduced from portfolio/page.tsx
// ---------------------------------------------------------------------------

function formatNum(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// formatNum
// ---------------------------------------------------------------------------

describe('formatNum (portfolio)', () => {
  it('formats billions with B suffix', () => {
    expect(formatNum(2.5e9)).toBe('2.5B');
    expect(formatNum(1e9)).toBe('1.0B');
  });

  it('formats millions with M suffix', () => {
    expect(formatNum(3.2e6)).toBe('3.2M');
    expect(formatNum(500000)).toBe('500.0K'); // 5e5 → K range
  });

  it('formats thousands with K suffix', () => {
    expect(formatNum(1500)).toBe('1.5K');
    expect(formatNum(1000)).toBe('1.0K');
  });

  it('formats small numbers with fixed decimals', () => {
    expect(formatNum(45.678)).toBe('45.68');
    expect(formatNum(0)).toBe('0.00');
  });

  it('respects custom decimal places', () => {
    expect(formatNum(45.678, 0)).toBe('46');
    expect(formatNum(1.23456, 4)).toBe('1.2346');
  });

  it('handles negative values', () => {
    expect(formatNum(-2.5e9)).toBe('-2.5B');
    expect(formatNum(-3e6)).toBe('-3.0M');
    expect(formatNum(-1500)).toBe('-1.5K');
    expect(formatNum(-99.5)).toBe('-99.50');
  });

  it('boundary: exactly 1B is formatted as B not M', () => {
    expect(formatNum(1e9)).toBe('1.0B');
  });

  it('boundary: exactly 1M is formatted as M not K', () => {
    expect(formatNum(1e6)).toBe('1.0M');
  });

  it('boundary: exactly 1K is formatted as K not plain', () => {
    expect(formatNum(1000)).toBe('1.0K');
  });

  it('boundary: 999 is formatted as plain', () => {
    expect(formatNum(999)).toBe('999.00');
  });
});
