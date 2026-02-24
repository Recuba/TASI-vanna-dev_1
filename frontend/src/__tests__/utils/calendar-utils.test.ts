/**
 * Tests for pure utility functions in the Calendar page.
 *
 * These functions are inlined in calendar/page.tsx. We reproduce and test
 * them here to verify the calendar grid generation and date range logic.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Reproduced from calendar/page.tsx
// ---------------------------------------------------------------------------

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function getMonthDays(year: number, month: number): { date: string; day: number; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ date: dateStr, day: d, isCurrentMonth: true });
  }

  // Next month padding (fill to 42 cells = 6 rows)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isCurrentMonth: false });
  }

  return days;
}

// ---------------------------------------------------------------------------
// getMonthRange
// ---------------------------------------------------------------------------

describe('getMonthRange', () => {
  it('returns correct from/to for January', () => {
    const { from, to } = getMonthRange(2025, 0); // month=0 → January
    expect(from).toBe('2025-01-01');
    expect(to).toBe('2025-01-31');
  });

  it('returns correct from/to for February (non-leap year)', () => {
    const { from, to } = getMonthRange(2025, 1);
    expect(from).toBe('2025-02-01');
    expect(to).toBe('2025-02-28');
  });

  it('returns correct from/to for February (leap year 2024)', () => {
    const { from, to } = getMonthRange(2024, 1);
    expect(from).toBe('2024-02-01');
    expect(to).toBe('2024-02-29');
  });

  it('returns correct from/to for April (30 days)', () => {
    const { from, to } = getMonthRange(2025, 3); // April
    expect(from).toBe('2025-04-01');
    expect(to).toBe('2025-04-30');
  });

  it('returns correct from/to for December', () => {
    const { from, to } = getMonthRange(2025, 11);
    expect(from).toBe('2025-12-01');
    expect(to).toBe('2025-12-31');
  });

  it('pads single-digit months with zero', () => {
    const { from } = getMonthRange(2025, 8); // September = month 8
    expect(from).toBe('2025-09-01');
  });
});

// ---------------------------------------------------------------------------
// getMonthDays
// ---------------------------------------------------------------------------

describe('getMonthDays', () => {
  it('always returns exactly 42 cells (6 weeks)', () => {
    // Test several months
    expect(getMonthDays(2025, 0)).toHaveLength(42); // January 2025
    expect(getMonthDays(2025, 1)).toHaveLength(42); // February 2025
    expect(getMonthDays(2024, 1)).toHaveLength(42); // February 2024 (leap)
    expect(getMonthDays(2025, 3)).toHaveLength(42); // April 2025
  });

  it('marks current month days with isCurrentMonth=true', () => {
    const days = getMonthDays(2025, 0); // January 2025
    const currentMonthDays = days.filter((d) => d.isCurrentMonth);
    expect(currentMonthDays).toHaveLength(31); // January has 31 days
    // All are in January
    for (const d of currentMonthDays) {
      expect(d.date).toMatch(/^2025-01-/);
    }
  });

  it('marks padding days with isCurrentMonth=false', () => {
    const days = getMonthDays(2025, 0); // January 2025
    const padDays = days.filter((d) => !d.isCurrentMonth);
    expect(padDays).toHaveLength(42 - 31); // 11 padding days
  });

  it('first current-month day is always day 1', () => {
    const days = getMonthDays(2025, 2); // March 2025
    const first = days.find((d) => d.isCurrentMonth);
    expect(first?.day).toBe(1);
    expect(first?.date).toBe('2025-03-01');
  });

  it('last current-month day matches month length', () => {
    const days = getMonthDays(2025, 1); // February 2025 (28 days)
    const currentDays = days.filter((d) => d.isCurrentMonth);
    const last = currentDays[currentDays.length - 1];
    expect(last.day).toBe(28);
    expect(last.date).toBe('2025-02-28');
  });

  it('date strings are in YYYY-MM-DD format for current month', () => {
    const days = getMonthDays(2025, 3); // April 2025
    const currentDays = days.filter((d) => d.isCurrentMonth);
    for (const d of currentDays) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('February 2024 (leap year) has 29 current-month days', () => {
    const days = getMonthDays(2024, 1);
    const currentDays = days.filter((d) => d.isCurrentMonth);
    expect(currentDays).toHaveLength(29);
  });
});
