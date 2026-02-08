/**
 * Chart utility functions for generating mock data, filtering, and formatting.
 *
 * Used by chart components and data hooks throughout the Ra'd AI frontend.
 */

import type { OHLCVData, LineDataPoint, ChartTimeRange } from '@/components/charts/chart-types';

export type { OHLCVData, LineDataPoint, ChartTimeRange };

// ---------------------------------------------------------------------------
// Mock data generation
// ---------------------------------------------------------------------------

/** Simple deterministic hash from a string, used to seed per-ticker data. */
function hashTicker(ticker: string): number {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) {
    h = (h * 31 + ticker.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Seeded pseudo-random number generator (Mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Check if a date falls on a Saudi weekend (Friday or Saturday).
 */
function isSaudiWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 5 || day === 6; // Friday = 5, Saturday = 6
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Generate realistic OHLCV data for a given ticker.
 *
 * The ticker hash seeds the PRNG so data is consistent per ticker.
 * Base price ranges 10-500 SAR with 1-3% daily volatility.
 * Volume ranges 100K-10M shares. Saudi weekends (Fri-Sat) are skipped.
 */
export function generateMockOHLCV(ticker: string, days: number = 365): OHLCVData[] {
  const seed = hashTicker(ticker);
  const rand = mulberry32(seed);

  // Derive base price and volatility from ticker hash
  const basePrice = 10 + (seed % 490); // 10 - 500 SAR
  const volatility = 0.01 + (seed % 200) / 10000; // 1% - 3%

  const result: OHLCVData[] = [];
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  let price = basePrice;
  const cursor = new Date(start);

  while (cursor <= end) {
    if (!isSaudiWeekend(cursor)) {
      const change = (rand() - 0.48) * volatility * price; // slight upward bias
      const open = price;
      price = Math.max(1, price + change);
      const close = price;
      const high = Math.max(open, close) * (1 + rand() * volatility * 0.5);
      const low = Math.min(open, close) * (1 - rand() * volatility * 0.5);
      const volume = Math.round(100_000 + rand() * 9_900_000);

      result.push({
        time: toDateStr(cursor),
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
        volume,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

/**
 * Generate a price trend line from mock OHLCV close prices.
 */
export function generateMockPriceTrend(days: number = 365): LineDataPoint[] {
  // Use a generic ticker to generate trend data
  const ohlcv = generateMockOHLCV('TASI_INDEX', days);
  return ohlcv.map((d) => ({ time: d.time, value: d.close }));
}

// ---------------------------------------------------------------------------
// Data filtering
// ---------------------------------------------------------------------------

/**
 * Filter time-series data by a ChartTimeRange relative to today.
 */
export function filterByTimeRange<T extends { time: string }>(
  data: T[],
  range: ChartTimeRange,
): T[] {
  if (range === 'ALL' || data.length === 0) return data;

  const now = new Date();
  let cutoff: Date;

  switch (range) {
    case '1W':
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '1M':
      cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case '3M':
      cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case '6M':
      cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      break;
    case '1Y':
      cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    default:
      return data;
  }

  const cutoffStr = toDateStr(cutoff);
  return data.filter((d) => d.time >= cutoffStr);
}

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

/**
 * Calculate a simple moving average over close prices.
 */
export function calculateMA(data: OHLCVData[], period: number): LineDataPoint[] {
  const result: LineDataPoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
    }
    result.push({ time: data[i].time, value: +(sum / period).toFixed(2) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a large number with abbreviated suffix (1.5B, 2.3M, 5.7K).
 */
export function formatVolume(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return (value / 1_000_000_000_000).toFixed(1) + 'T';
  if (abs >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
  if (abs >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  return value.toString();
}

/**
 * Format a price with currency prefix.
 */
export function formatPrice(value: number, currency: string = 'SAR'): string {
  return `${currency} ${value.toFixed(2)}`;
}
