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
  // === Major Blue Chips ===
  '2222.SR': ['aramco', 'أرامكو', 'saudi aramco', 'أرامكو السعودية'],
  '2010.SR': ['sabic', 'سابك', 'الصناعات الأساسية'],
  '2082.SR': ['acwa', 'أكوا باور', 'acwa power', 'أكوا'],
  '7203.SR': ['elm', 'علم'],
  '4280.SR': ['kingdom', 'المملكة', 'kingdom holding', 'المملكة القابضة'],

  // === Banks ===
  '1120.SR': ['rajhi', 'الراجحي', 'al rajhi', 'بنك الراجحي', 'مصرف الراجحي'],
  '1180.SR': ['ahli', 'الأهلي', 'al ahli', 'snb', 'البنك الأهلي', 'البنك الأهلي السعودي'],
  '1010.SR': ['riyad', 'بنك الرياض', 'الرياض', 'riyad bank'],
  '1140.SR': ['albilad', 'البلاد', 'بنك البلاد'],
  '1050.SR': ['fransi', 'فرنسي', 'الفرنسي', 'saudi fransi', 'bsf', 'البنك السعودي الفرنسي'],
  '1060.SR': ['sab', 'ساب', 'الأول', 'saudi awwal', 'sabb', 'بنك ساب'],
  '1020.SR': ['jazira', 'الجزيرة', 'بنك الجزيرة', 'bank aljazira'],
  '1150.SR': ['alinma', 'الإنماء', 'بنك الإنماء', 'inma'],
  '1080.SR': ['anb', 'العربي', 'arab national', 'البنك العربي الوطني'],
  '1030.SR': ['sib', 'الاستثمار', 'بنك الاستثمار', 'saudi investment bank'],

  // === Telecom ===
  '7010.SR': ['stc', 'اس تي سي', 'الاتصالات السعودية', 'saudi telecom', 'الاتصالات'],
  '7020.SR': ['mobily', 'موبايلي', 'etihad etisalat', 'اتحاد اتصالات'],
  '7030.SR': ['zain', 'زين', 'زين السعودية', 'zain ksa'],

  // === Mining & Energy ===
  '1211.SR': ['maaden', 'معادن', 'saudi mining', 'التعدين السعودية'],
  '5110.SR': ['sec', 'الكهرباء', 'السعودية للكهرباء', 'saudi electricity'],

  // === Petrochemicals ===
  '2020.SR': ['safco', 'سافكو', 'سابك للمغذيات', 'sabic nutrients'],
  '2001.SR': ['kemanol', 'كيمانول', 'methanol chemicals', 'الميثانول'],
  '2330.SR': ['advanced', 'المتقدمة', 'advanced petrochemical', 'المتقدمة للبتروكيماويات'],
  '2350.SR': ['kwt', 'كيان', 'kayan', 'كيان السعودية'],
  '2310.SR': ['sipchem', 'سبكيم', 'المجموعة السعودية', 'saudi int petrochemical'],
  '2060.SR': ['tasnee', 'التصنيع', 'tasnee', 'التصنيع الوطنية'],
  '2290.SR': ['yansab', 'ينساب', 'yanbu national petrochemical'],
  '2250.SR': ['siig', 'المجموعة السعودية', 'saudi industrial investment'],

  // === Food & Beverages ===
  '2280.SR': ['almarai', 'المراعي'],
  '2050.SR': ['savola', 'صافولا', 'savola group', 'مجموعة صافولا'],
  '6010.SR': ['nadec', 'نادك', 'الشركة الوطنية للتنمية الزراعية'],
  '6001.SR': ['halwani', 'حلواني إخوان', 'halwani brothers'],
  '2270.SR': ['sadafco', 'سدافكو', 'الصافي دانون'],
  '6090.SR': ['jadt', 'المتحدة للأغذية', 'catering', 'الخطوط للتموين'],

  // === Retail ===
  '4190.SR': ['jarir', 'جرير', 'jarir bookstore', 'مكتبة جرير'],
  '4003.SR': ['extra', 'اكسترا', 'الأجهزة المنزلية'],
  '4161.SR': ['bindawood', 'بن داود', 'bindawood holding', 'بنده'],
  '4162.SR': ['lulu', 'لولو', 'lulu retail', 'لولو السعودية'],
  '4191.SR': ['maameer', 'المعمر', 'alnasban'],

  // === Healthcare ===
  '4007.SR': ['hammadi', 'الحمادي', 'hammadi hospital', 'مستشفى الحمادي'],
  '4002.SR': ['mouwasat', 'المواساة', 'mouwasat medical', 'المواساة الطبية'],
  '4004.SR': ['riayah', 'رعاية', 'dallah health care', 'شركة رعاية'],
  '4013.SR': ['sulaiman', 'سليمان الحبيب', 'الحبيب', 'habib', 'dr sulaiman al habib'],
  '4200.SR': ['dallah', 'دلة', 'dallah health', 'دلة الصحية'],

  // === Real Estate ===
  '4300.SR': ['dar alarkan', 'دار الأركان', 'dar al arkan'],
  '4250.SR': ['jabal omar', 'جبل عمر', 'jabal omar development'],
  '4220.SR': ['emaar', 'إعمار', 'emaar ec', 'إعمار المدينة'],
  '4100.SR': ['makkah', 'مكة', 'makkah construction', 'مكة للإنشاء'],
  '4150.SR': ['taiba', 'طيبة', 'taiba holding', 'طيبة القابضة'],
  '4320.SR': ['knowledge', 'المعرفة', 'alnmae'],

  // === Insurance ===
  '8210.SR': ['bupa', 'بوبا', 'bupa arabia', 'بوبا العربية'],
  '8010.SR': ['tawuniya', 'التعاونية', 'tawuniya insurance', 'التأمين التعاوني'],
  '8030.SR': ['medgulf', 'ميدغلف', 'medgulf insurance'],
  '8200.SR': ['malath', 'ملاذ', 'malath insurance', 'ملاذ للتأمين'],
  '8020.SR': ['salama', 'سلامة', 'salama insurance'],

  // === Transportation ===
  '4030.SR': ['albahri', 'البحري', 'bahri', 'الوطنية للنقل البحري'],
  '4050.SR': ['flynas', 'ناس', 'طيران ناس', 'nas air', 'فلاي ناس'],
  '4040.SR': ['saptco', 'سابتكو', 'النقل الجماعي'],
  '4261.SR': ['budget', 'بدجت', 'budget saudi', 'بدجت السعودية'],

  // === Cement ===
  '3010.SR': ['arabian cement', 'أسمنت العربية', 'الاسمنت العربية'],
  '3020.SR': ['yamama', 'اليمامة', 'اسمنت اليمامة', 'yamama cement'],
  '3030.SR': ['saudi cement', 'السعودية للأسمنت', 'الاسمنت السعودي'],
  '3040.SR': ['qassim', 'القصيم', 'اسمنت القصيم', 'qassim cement'],
  '3050.SR': ['southern', 'الجنوبية', 'اسمنت الجنوبية', 'southern cement'],
  '3060.SR': ['yanbu', 'ينبع', 'اسمنت ينبع', 'yanbu cement'],
  '3080.SR': ['eastern', 'الشرقية', 'اسمنت الشرقية', 'eastern cement'],
  '3090.SR': ['tabuk', 'تبوك', 'اسمنت تبوك', 'tabuk cement'],

  // === Other Major Companies ===
  '2223.SR': ['luberef', 'لوبريف', 'base oil', 'زيوت أرامكو'],
  '4210.SR': ['nesma', 'نسما', 'nesma and partners'],
  '1212.SR': ['aslak', 'أسلاك', 'saudi steel pipe'],
  '1304.SR': ['alandalus', 'الأندلس', 'alandalus property'],
  '4011.SR': ['labat', 'لازوردي', 'lazurde', 'لازوردي للمجوهرات'],
  '4240.SR': ['fawaz', 'فواز الحكير', 'alhokair', 'الحكير'],
  '6002.SR': ['herfy', 'هرفي', 'herfy food'],
  '1320.SR': ['sgp', 'أنابيب السعودية', 'saudi steel pipe'],
  '2120.SR': ['yamamah', 'اليمامة للحديد', 'yamamah steel'],
  '2170.SR': ['alujain', 'اللجين', 'alujain corp'],
  '4012.SR': ['tihama', 'تهامة', 'tihama advertising'],
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
