/**
 * Shared translations for sector names and stock aliases.
 *
 * Sector names in the database are in English. This module provides:
 * 1. Arabic translations for sector names (used when language is Arabic).
 * 2. A stock alias map for common nicknames and Arabic names, used to
 *    improve search matching on the market page.
 */

import type { Language } from '@/providers/LanguageProvider';

// ---------------------------------------------------------------------------
// Sector name translations (English DB values -> Arabic display)
// ---------------------------------------------------------------------------

export const SECTOR_TRANSLATIONS: Record<string, string> = {
  'Energy': '\u0627\u0644\u0637\u0627\u0642\u0629',
  'Basic Materials': '\u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629',
  'Communication Services': '\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A',
  'Consumer Cyclical': '\u0627\u0644\u0633\u0644\u0639 \u0627\u0644\u0627\u0633\u062A\u0647\u0644\u0627\u0643\u064A\u0629 \u0627\u0644\u062F\u0648\u0631\u064A\u0629',
  'Consumer Defensive': '\u0627\u0644\u0633\u0644\u0639 \u0627\u0644\u0627\u0633\u062A\u0647\u0644\u0627\u0643\u064A\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629',
  'Financial Services': '\u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629',
  'Healthcare': '\u0627\u0644\u0631\u0639\u0627\u064A\u0629 \u0627\u0644\u0635\u062D\u064A\u0629',
  'Industrials': '\u0627\u0644\u0635\u0646\u0627\u0639\u0627\u062A',
  'Real Estate': '\u0627\u0644\u0639\u0642\u0627\u0631\u0627\u062A',
  'Technology': '\u0627\u0644\u062A\u0642\u0646\u064A\u0629',
  'Utilities': '\u0627\u0644\u0645\u0631\u0627\u0641\u0642 \u0627\u0644\u0639\u0627\u0645\u0629',
  // Extended sector names (in case backend adds TASI-style sector names)
  'Banks': '\u0627\u0644\u0628\u0646\u0648\u0643',
  'Materials': '\u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629',
  'Telecommunication Services': '\u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A',
  'Real Estate Management & Development': '\u0625\u062F\u0627\u0631\u0629 \u0648\u062A\u0637\u0648\u064A\u0631 \u0627\u0644\u0639\u0642\u0627\u0631\u0627\u062A',
  'Food & Staples Retailing': '\u062A\u062C\u0632\u0626\u0629 \u0627\u0644\u0623\u063A\u0630\u064A\u0629',
  'Health Care Equipment & Services': '\u0627\u0644\u0631\u0639\u0627\u064A\u0629 \u0627\u0644\u0635\u062D\u064A\u0629',
  'Capital Goods': '\u0627\u0644\u0633\u0644\u0639 \u0627\u0644\u0631\u0623\u0633\u0645\u0627\u0644\u064A\u0629',
  'Transportation': '\u0627\u0644\u0646\u0642\u0644',
  'Consumer Services': '\u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0627\u0633\u062A\u0647\u0644\u0627\u0643\u064A\u0629',
  'Media & Entertainment': '\u0627\u0644\u0625\u0639\u0644\u0627\u0645 \u0648\u0627\u0644\u062A\u0631\u0641\u064A\u0647',
  'Retailing': '\u0627\u0644\u062A\u062C\u0632\u0626\u0629',
  'Insurance': '\u0627\u0644\u062A\u0623\u0645\u064A\u0646',
  'Diversified Financials': '\u0627\u0644\u062A\u0645\u0648\u064A\u0644 \u0627\u0644\u0645\u062A\u0646\u0648\u0639',
  'Food & Beverages': '\u0627\u0644\u0623\u063A\u0630\u064A\u0629 \u0648\u0627\u0644\u0645\u0634\u0631\u0648\u0628\u0627\u062A',
  'Pharma, Biotech & Life Science': '\u0627\u0644\u0623\u062F\u0648\u064A\u0629 \u0648\u0627\u0644\u062A\u0642\u0646\u064A\u0629 \u0627\u0644\u062D\u064A\u0648\u064A\u0629',
  'Commercial & Professional Services': '\u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u0645\u0647\u0646\u064A\u0629',
  'Consumer Durables & Apparel': '\u0627\u0644\u0633\u0644\u0639 \u0627\u0644\u0645\u0639\u0645\u0631\u0629 \u0648\u0627\u0644\u0645\u0644\u0627\u0628\u0633',
  'Software & Services': '\u0627\u0644\u0628\u0631\u0645\u062C\u064A\u0627\u062A \u0648\u0627\u0644\u062E\u062F\u0645\u0627\u062A',
  'Technology Hardware & Equipment': '\u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u062A\u0642\u0646\u064A\u0629',
  'REITs': '\u0635\u0646\u0627\u062F\u064A\u0642 \u0627\u0644\u0631\u064A\u062A',
};

/**
 * Translate a sector name based on the current language.
 * Returns the Arabic translation if available, otherwise the original name.
 */
export function translateSector(sector: string | null | undefined, language: Language): string {
  if (!sector) return '';
  if (language === 'en') return sector;
  return SECTOR_TRANSLATIONS[sector] || sector;
}

// ---------------------------------------------------------------------------
// Stock alias map (ticker -> common search terms)
// ---------------------------------------------------------------------------

/**
 * Maps tickers to common aliases, abbreviations, and Arabic names
 * that users might search for. Used for client-side search matching.
 *
 * Each key is a ticker (e.g. "2222.SR") and the value is an array of
 * lowercase aliases. The search function normalizes input to lowercase
 * before matching.
 */
export const STOCK_ALIASES: Record<string, string[]> = {
  '2222.SR': ['aramco', '\u0623\u0631\u0627\u0645\u0643\u0648', 'saudi aramco', '\u0623\u0631\u0627\u0645\u0643\u0648 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629'],
  '1120.SR': ['rajhi', '\u0627\u0644\u0631\u0627\u062C\u062D\u064A', 'al rajhi', '\u0628\u0646\u0643 \u0627\u0644\u0631\u0627\u062C\u062D\u064A'],
  '1180.SR': ['ahli', '\u0627\u0644\u0623\u0647\u0644\u064A', 'al ahli', 'snb', '\u0627\u0644\u0628\u0646\u0643 \u0627\u0644\u0623\u0647\u0644\u064A'],
  '1211.SR': ['maaden', '\u0645\u0639\u0627\u062F\u0646', 'saudi mining'],
  '7010.SR': ['stc', '\u0627\u0633 \u062A\u064A \u0633\u064A', '\u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629', 'saudi telecom'],
  '2010.SR': ['sabic', '\u0633\u0627\u0628\u0643', '\u0627\u0644\u0635\u0646\u0627\u0639\u0627\u062A \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629'],
  '2082.SR': ['acwa', '\u0623\u0643\u0648\u0627 \u0628\u0627\u0648\u0631', 'acwa power'],
  '1010.SR': ['riyad', '\u0628\u0646\u0643 \u0627\u0644\u0631\u064A\u0627\u0636', '\u0627\u0644\u0631\u064A\u0627\u0636', 'riyad bank'],
  '1060.SR': ['sab', '\u0633\u0627\u0628', '\u0627\u0644\u0623\u0648\u0644', 'saudi awwal', 'sabb'],
  '1150.SR': ['alinma', '\u0627\u0644\u0625\u0646\u0645\u0627\u0621', '\u0628\u0646\u0643 \u0627\u0644\u0625\u0646\u0645\u0627\u0621', 'inma'],
  '5110.SR': ['sec', '\u0627\u0644\u0643\u0647\u0631\u0628\u0627\u0621', '\u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 \u0644\u0644\u0643\u0647\u0631\u0628\u0627\u0621', 'saudi electricity'],
  '7020.SR': ['mobily', '\u0645\u0648\u0628\u0627\u064A\u0644\u064A', 'etihad etisalat'],
  '2280.SR': ['almarai', '\u0627\u0644\u0645\u0631\u0627\u0639\u064A'],
  '1050.SR': ['fransi', '\u0641\u0631\u0646\u0633\u064A', '\u0627\u0644\u0641\u0631\u0646\u0633\u064A', 'saudi fransi', 'bsf'],
  '1080.SR': ['anb', '\u0627\u0644\u0639\u0631\u0628\u064A', 'arab national'],
  '1140.SR': ['albilad', '\u0627\u0644\u0628\u0644\u0627\u062F', '\u0628\u0646\u0643 \u0627\u0644\u0628\u0644\u0627\u062F'],
  '4280.SR': ['kingdom', '\u0627\u0644\u0645\u0645\u0644\u0643\u0629', 'kingdom holding'],
  '2020.SR': ['safco', '\u0633\u0627\u0641\u0643\u0648', '\u0633\u0627\u0628\u0643 \u0644\u0644\u0645\u063A\u0630\u064A\u0627\u062A', 'sabic nutrients'],
  '4013.SR': ['sulaiman', '\u0633\u0644\u064A\u0645\u0627\u0646 \u0627\u0644\u062D\u0628\u064A\u0628', '\u0627\u0644\u062D\u0628\u064A\u0628', 'habib'],
  '7203.SR': ['elm', '\u0639\u0644\u0645'],
  '4030.SR': ['albahri', '\u0627\u0644\u0628\u062D\u0631\u064A', 'bahri'],
  '2350.SR': ['kwt', '\u0643\u064A\u0627\u0646', 'kayan'],
  '4200.SR': ['dallah', '\u062F\u0644\u0629', 'dallah health', '\u062F\u0644\u0629 \u0627\u0644\u0635\u062D\u064A\u0629'],
  '2223.SR': ['luberef', '\u0644\u0648\u0628\u0631\u064A\u0641', 'base oil', '\u0632\u064A\u0648\u062A \u0623\u0631\u0627\u0645\u0643\u0648'],
};

/**
 * Build a reverse lookup: alias (lowercase) -> ticker.
 * This is built once at module load for fast search matching.
 */
const _aliasToTicker: Map<string, string> = new Map();
for (const [ticker, aliases] of Object.entries(STOCK_ALIASES)) {
  for (const alias of aliases) {
    _aliasToTicker.set(alias.toLowerCase(), ticker);
  }
}

/**
 * Given a search query, return matching ticker(s) from the alias map.
 * Performs partial matching: if the query is a substring of an alias,
 * or an alias is a substring of the query, the ticker is included.
 *
 * @returns An array of tickers that matched via alias.
 */
export function findTickersByAlias(query: string): string[] {
  if (!query || query.trim().length === 0) return [];
  const q = query.toLowerCase().trim();
  const matched = new Set<string>();

  for (const [ticker, aliases] of Object.entries(STOCK_ALIASES)) {
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      // Match if query is contained in alias or alias is contained in query
      if (a.includes(q) || q.includes(a)) {
        matched.add(ticker);
        break;
      }
    }
  }

  return Array.from(matched);
}

/**
 * Check if a company summary item matches a search query.
 * Checks ticker, short_name, and aliases.
 */
export function matchesSearch(
  item: { ticker: string; short_name: string | null },
  query: string,
): boolean {
  if (!query || query.trim().length === 0) return true;
  const q = query.toLowerCase().trim();

  // Direct match on ticker or name
  if (item.ticker.toLowerCase().includes(q)) return true;
  if (item.short_name && item.short_name.toLowerCase().includes(q)) return true;

  // Also match ticker without ".SR" suffix
  const tickerBase = item.ticker.replace('.SR', '');
  if (tickerBase.toLowerCase().includes(q)) return true;
  if (q.includes(tickerBase.toLowerCase())) return true;

  // Alias match
  const aliasedTickers = findTickersByAlias(q);
  if (aliasedTickers.includes(item.ticker)) return true;

  return false;
}
