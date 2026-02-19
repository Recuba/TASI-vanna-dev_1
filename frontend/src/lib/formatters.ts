/**
 * Shared number and date formatting utilities for the Ra'd AI platform.
 *
 * All formatters handle null/undefined inputs gracefully (return '-' or empty string).
 */

/**
 * Format a stock price to 2 decimal places.
 * @example formatPrice(10.5) => "10.50"
 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null) return '-';
  return value.toFixed(2);
}

/**
 * Format a percentage with sign prefix and configurable decimals.
 * @example formatPercent(3.14) => "+3.14%"
 * @example formatPercent(-1.5, 1) => "-1.5%"
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 2
): string {
  if (value == null) return '-';
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)}%`;
}

/**
 * Format a large number (volume) with K/M/B suffix.
 * @example formatVolume(1_500_000) => "1.5M"
 * @example formatVolume(42_000) => "42.0K"
 */
export function formatVolume(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/**
 * Format a market capitalization in SAR billions or millions.
 * @example formatMarketCap(500_000_000_000) => "500.0B SAR"
 */
export function formatMarketCap(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return String(value);
}
