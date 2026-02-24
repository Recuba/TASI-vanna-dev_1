/**
 * Tests for pure utility functions in the Screener page.
 *
 * These functions are inlined in screener/page.tsx. We test them here
 * by reproducing them verbatim (since they are not exported) to verify
 * the business logic contract independently.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Reproduced from screener/page.tsx (not exported — tested inline)
// ---------------------------------------------------------------------------

function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (Math.abs(val) >= 1e12) return `${(val / 1e12).toFixed(1)}T`;
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  return val.toFixed(2);
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  return `${(val * 100).toFixed(1)}%`;
}

// Active filter count logic reproduced from screener/page.tsx
interface ScreenerFilters {
  sector?: string;
  pe_min?: number;
  pe_max?: number;
  pb_min?: number;
  pb_max?: number;
  roe_min?: number;
  roe_max?: number;
  dividend_yield_min?: number;
  dividend_yield_max?: number;
  market_cap_min?: number;
  market_cap_max?: number;
  revenue_growth_min?: number;
  revenue_growth_max?: number;
  debt_to_equity_max?: number;
  current_ratio_min?: number;
  recommendation?: string;
  sort_by?: string;
  sort_dir?: string;
  limit?: number;
  offset?: number;
}

function countActiveFilters(filters: ScreenerFilters): number {
  let count = 0;
  if (filters.sector) count++;
  if (filters.pe_min != null || filters.pe_max != null) count++;
  if (filters.pb_min != null || filters.pb_max != null) count++;
  if (filters.roe_min != null || filters.roe_max != null) count++;
  if (filters.dividend_yield_min != null || filters.dividend_yield_max != null) count++;
  if (filters.market_cap_min != null || filters.market_cap_max != null) count++;
  if (filters.revenue_growth_min != null || filters.revenue_growth_max != null) count++;
  if (filters.debt_to_equity_max != null) count++;
  if (filters.current_ratio_min != null) count++;
  if (filters.recommendation) count++;
  return count;
}

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

describe('formatNumber', () => {
  it('returns "-" for null', () => {
    expect(formatNumber(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatNumber(undefined)).toBe('-');
  });

  it('formats trillions with T suffix', () => {
    expect(formatNumber(2.5e12)).toBe('2.5T');
  });

  it('formats billions with B suffix', () => {
    expect(formatNumber(1.8e9)).toBe('1.8B');
    expect(formatNumber(500e6 * 3)).toBe('1.5B');
  });

  it('formats millions with M suffix', () => {
    expect(formatNumber(3.2e6)).toBe('3.2M');
  });

  it('formats small numbers to 2 decimal places', () => {
    expect(formatNumber(45.678)).toBe('45.68');
    expect(formatNumber(0)).toBe('0.00');
    expect(formatNumber(100)).toBe('100.00');
  });

  it('handles negative values correctly (uses Math.abs for threshold check)', () => {
    expect(formatNumber(-2.5e9)).toBe('-2.5B');
    expect(formatNumber(-1.5e6)).toBe('-1.5M');
  });
});

// ---------------------------------------------------------------------------
// formatPct
// ---------------------------------------------------------------------------

describe('formatPct', () => {
  it('returns "-" for null', () => {
    expect(formatPct(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatPct(undefined)).toBe('-');
  });

  it('converts decimal to percent with 1 decimal', () => {
    expect(formatPct(0.05)).toBe('5.0%');
    expect(formatPct(0.1234)).toBe('12.3%');
    expect(formatPct(1.0)).toBe('100.0%');
    expect(formatPct(0)).toBe('0.0%');
  });

  it('handles negative percentages', () => {
    expect(formatPct(-0.03)).toBe('-3.0%');
  });
});

// ---------------------------------------------------------------------------
// countActiveFilters
// ---------------------------------------------------------------------------

describe('countActiveFilters (screener)', () => {
  it('returns 0 for default empty filters', () => {
    expect(countActiveFilters({ sort_by: 'market_cap', sort_dir: 'desc', limit: 50, offset: 0 })).toBe(0);
  });

  it('counts sector filter', () => {
    expect(countActiveFilters({ sector: 'Energy' })).toBe(1);
  });

  it('counts PE range as one filter even if only max set', () => {
    expect(countActiveFilters({ pe_max: 15 })).toBe(1);
  });

  it('counts PE range as one filter even if only min set', () => {
    expect(countActiveFilters({ pe_min: 5 })).toBe(1);
  });

  it('counts PE range as one filter when both min and max set', () => {
    expect(countActiveFilters({ pe_min: 5, pe_max: 15 })).toBe(1);
  });

  it('counts multiple independent filter groups', () => {
    const filters: ScreenerFilters = {
      sector: 'Energy',       // +1
      pe_max: 15,             // +1
      pb_max: 1.5,            // +1
      roe_min: 0.15,          // +1
      debt_to_equity_max: 0.5, // +1
    };
    expect(countActiveFilters(filters)).toBe(5);
  });

  it('counts recommendation filter', () => {
    expect(countActiveFilters({ recommendation: 'buy' })).toBe(1);
  });

  it('counts dividend yield range as one', () => {
    expect(countActiveFilters({ dividend_yield_min: 0.03 })).toBe(1);
  });

  it('counts revenue growth range as one', () => {
    expect(countActiveFilters({ revenue_growth_min: 0.1 })).toBe(1);
  });

  it('counts current_ratio_min separately', () => {
    expect(countActiveFilters({ current_ratio_min: 1.5 })).toBe(1);
  });

  it('ignores sort_by, sort_dir, limit, offset', () => {
    expect(countActiveFilters({ sort_by: 'roe', sort_dir: 'asc', limit: 100, offset: 50 })).toBe(0);
  });
});
