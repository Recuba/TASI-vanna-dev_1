/**
 * Lightweight runtime validators for chart API responses.
 *
 * No external dependencies (no Zod). Just basic shape checks
 * to catch malformed data before it hits chart components.
 */

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Validate OHLCV data array (candlestick / bar chart data).
 * Each item must have `time` (string), `open` (number), `high` (number),
 * `low` (number), `close` (number). `volume` is optional.
 */
export function validateOHLCVData(data: unknown): data is Array<{
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}> {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.every(
    (item) =>
      isObject(item) &&
      typeof item.time === 'string' &&
      item.time.length >= 8 &&
      typeof item.open === 'number' &&
      typeof item.high === 'number' &&
      typeof item.low === 'number' &&
      typeof item.close === 'number' &&
      isFinite(item.close as number),
  );
}

/**
 * Validate a TASI index API response envelope.
 */
export function validateTasiResponse(resp: unknown): resp is {
  data: Array<{ time: string; open: number; close: number }>;
  source: string;
} {
  if (!isObject(resp)) return false;
  if (!Array.isArray(resp.data)) return false;
  if (typeof resp.source !== 'string') return false;
  return validateOHLCVData(resp.data);
}
