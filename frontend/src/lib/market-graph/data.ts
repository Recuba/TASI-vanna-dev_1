import type { AssetCategory, RawInstrument } from './types';

// ---------------------------------------------------------------------------
// Static instrument data (fallback when API is unavailable)
// ---------------------------------------------------------------------------

export const RAW_INSTRUMENTS: RawInstrument[] = [
  {
    key: 'TASI',
    nameAr: '\u062A\u0627\u0633\u064A',
    nameEn: 'TASI Index',
    value: 12450.80,
    change: 0.45,
    category: 'Saudi',
    sparkline: [12300, 12350, 12380, 12400, 12420, 12440, 12451],
  },
  {
    key: 'BTC',
    nameAr: '\u0628\u064A\u062A\u0643\u0648\u064A\u0646',
    nameEn: 'Bitcoin',
    value: 97245.30,
    change: 2.34,
    category: 'Crypto',
    sparkline: [91200, 93400, 94100, 92800, 95600, 96800, 97245],
  },
  {
    key: 'GOLD',
    nameAr: '\u0627\u0644\u0630\u0647\u0628',
    nameEn: 'Gold',
    value: 2935.40,
    change: 0.68,
    category: 'Commodity',
    sparkline: [2890, 2905, 2898, 2920, 2915, 2928, 2935],
  },
  {
    key: 'SILVER',
    nameAr: '\u0627\u0644\u0641\u0636\u0629',
    nameEn: 'Silver',
    value: 32.15,
    change: -0.52,
    category: 'Commodity',
    sparkline: [33.1, 32.8, 32.6, 32.4, 32.3, 32.2, 32.15],
  },
  {
    key: 'WTI',
    nameAr: '\u0646\u0641\u0637 \u062E\u0627\u0645 (WTI)',
    nameEn: 'WTI Oil',
    value: 71.23,
    change: -1.34,
    category: 'Energy',
    sparkline: [73.5, 74.1, 73.2, 72.8, 72.1, 71.8, 71.23],
  },
  {
    key: 'BRENT',
    nameAr: '\u0646\u0641\u0637 \u0628\u0631\u0646\u062A',
    nameEn: 'Brent Crude',
    value: 75.67,
    change: -1.18,
    category: 'Energy',
    sparkline: [78.2, 77.8, 77.1, 76.5, 76.2, 75.9, 75.67],
  },
  {
    key: 'SPX',
    nameAr: '\u0625\u0633 \u0622\u0646\u062F \u0628\u064A 500',
    nameEn: 'S&P 500',
    value: 6120.35,
    change: 1.12,
    category: 'US Index',
    sparkline: [5980, 6010, 6045, 6030, 6075, 6098, 6120],
  },
  {
    key: 'NASDAQ',
    nameAr: '\u0646\u0627\u0633\u062F\u0627\u0643',
    nameEn: 'NASDAQ',
    value: 19845.20,
    change: 1.45,
    category: 'US Index',
    sparkline: [19200, 19380, 19500, 19420, 19650, 19780, 19845],
  },
  {
    key: 'DJI',
    nameAr: '\u062F\u0627\u0648 \u062C\u0648\u0646\u0632',
    nameEn: 'Dow Jones',
    value: 44521.67,
    change: 0.82,
    category: 'US Index',
    sparkline: [43800, 43950, 44100, 44050, 44280, 44400, 44522],
  },
  {
    key: 'RUT',
    nameAr: '\u0631\u0627\u0633\u0644 2000',
    nameEn: 'Russell 2000',
    value: 2287.45,
    change: -0.38,
    category: 'US Index',
    sparkline: [2310, 2305, 2298, 2295, 2290, 2288, 2287],
  },
];

// ---------------------------------------------------------------------------
// Instrument metadata map (Arabic/English names + category for each key)
// ---------------------------------------------------------------------------

export interface InstrumentMeta {
  nameAr: string;
  nameEn: string;
  category: AssetCategory;
}

export const INSTRUMENT_META: Record<string, InstrumentMeta> = {
  TASI: { nameAr: '\u062A\u0627\u0633\u064A', nameEn: 'TASI Index', category: 'Saudi' },
  BTC: { nameAr: '\u0628\u064A\u062A\u0643\u0648\u064A\u0646', nameEn: 'Bitcoin', category: 'Crypto' },
  GOLD: { nameAr: '\u0627\u0644\u0630\u0647\u0628', nameEn: 'Gold', category: 'Commodity' },
  SILVER: { nameAr: '\u0627\u0644\u0641\u0636\u0629', nameEn: 'Silver', category: 'Commodity' },
  WTI: { nameAr: '\u0646\u0641\u0637 \u062E\u0627\u0645 (WTI)', nameEn: 'WTI Oil', category: 'Energy' },
  BRENT: { nameAr: '\u0646\u0641\u0637 \u0628\u0631\u0646\u062A', nameEn: 'Brent Crude', category: 'Energy' },
  SPX: { nameAr: '\u0625\u0633 \u0622\u0646\u062F \u0628\u064A 500', nameEn: 'S&P 500', category: 'US Index' },
  NASDAQ: { nameAr: '\u0646\u0627\u0633\u062F\u0627\u0643', nameEn: 'NASDAQ', category: 'US Index' },
  DJI: { nameAr: '\u062F\u0627\u0648 \u062C\u0648\u0646\u0632', nameEn: 'Dow Jones', category: 'US Index' },
  RUT: { nameAr: '\u0631\u0627\u0633\u0644 2000', nameEn: 'Russell 2000', category: 'US Index' },
};
