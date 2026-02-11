/**
 * Utility functions for TradingView widget integration
 */

/**
 * Convert TASI stock ticker to TradingView symbol format
 * @param ticker - Saudi stock ticker (e.g., "2222", "1120")
 * @returns TradingView symbol format (e.g., "TADAWUL:2222")
 *
 * @example
 * formatTASISymbol("2222") // "TADAWUL:2222" (Aramco)
 * formatTASISymbol("1120") // "TADAWUL:1120" (Al Rajhi Bank)
 */
export function formatTASISymbol(ticker: string): string {
  // Remove any whitespace
  const cleanTicker = ticker.trim();

  // If already in TADAWUL:XXXX format, return as-is
  if (cleanTicker.toUpperCase().startsWith('TADAWUL:')) {
    return cleanTicker.toUpperCase();
  }

  // If it's just a ticker number, prepend TADAWUL:
  return `TADAWUL:${cleanTicker}`;
}

/**
 * Extract ticker from TradingView symbol format
 * @param symbol - TradingView symbol (e.g., "TADAWUL:2222")
 * @returns Plain ticker (e.g., "2222")
 *
 * @example
 * extractTicker("TADAWUL:2222") // "2222"
 * extractTicker("2222") // "2222"
 */
export function extractTicker(symbol: string): string {
  const parts = symbol.split(':');
  return parts.length > 1 ? parts[1] : symbol;
}

/**
 * Validate if a string is a valid TASI ticker
 * TASI tickers are typically 4-digit numbers
 * @param ticker - Ticker to validate
 * @returns true if valid TASI ticker format
 */
export function isValidTASITicker(ticker: string): boolean {
  const cleanTicker = extractTicker(ticker);
  // TASI tickers are 4-digit numbers
  return /^\d{4}$/.test(cleanTicker);
}

/**
 * Get display name for common TASI stocks
 * @param ticker - Stock ticker
 * @returns Display name or ticker if not found
 */
export function getTASIStockName(ticker: string): string {
  const cleanTicker = extractTicker(ticker);

  const names: Record<string, string> = {
    '2222': 'Saudi Aramco',
    '1120': 'Al Rajhi Bank',
    '2010': 'SABIC',
    '7010': 'STC',
    '1180': 'Al Inma Bank',
    '2350': 'Saudi Kayan',
    '1010': 'Riyad Bank',
    '2280': 'Almarai',
    '4030': 'Bahri',
    '7020': 'Etihad Etisalat (Mobily)',
  };

  return names[cleanTicker] || cleanTicker;
}
