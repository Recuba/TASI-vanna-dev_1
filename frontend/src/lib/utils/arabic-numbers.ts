/**
 * Format a number, optionally converting to Eastern Arabic-Indic numerals.
 * Used for price and percentage display in Arabic locale.
 */

const EASTERN_ARABIC = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];

/** Convert Western digits to Eastern Arabic-Indic numerals */
export function toEasternArabic(str: string): string {
  return str.replace(/[0-9]/g, (d) => EASTERN_ARABIC[parseInt(d)]);
}

/**
 * Format a number for display.
 * @param value - The number to format
 * @param opts.decimals - Decimal places (default: 2)
 * @param opts.locale - 'ar' converts to Eastern Arabic numerals
 * @param opts.prefix - Optional prefix (e.g. '+' for positive change)
 */
export function formatNumber(
  value: number | null | undefined,
  opts: { decimals?: number; locale?: string; prefix?: string } = {}
): string {
  if (value === null || value === undefined) return '-';
  const { decimals = 2, locale, prefix = '' } = opts;
  const formatted = prefix + value.toFixed(decimals);
  if (locale === 'ar') return toEasternArabic(formatted);
  return formatted;
}

/**
 * Format market cap in human-readable form (B/M suffix).
 */
export function formatMarketCap(value: number | null | undefined, locale?: string): string {
  if (value === null || value === undefined) return '-';
  let result: string;
  if (value >= 1e9) result = (value / 1e9).toFixed(1) + 'B';
  else if (value >= 1e6) result = (value / 1e6).toFixed(0) + 'M';
  else result = value.toFixed(0);
  if (locale === 'ar') return toEasternArabic(result);
  return result;
}
