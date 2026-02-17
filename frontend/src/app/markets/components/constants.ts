// ---------------------------------------------------------------------------
// Shared color tokens, format helpers, and legend data
// ---------------------------------------------------------------------------

/**
 * Color tokens matching the global design system.
 * Used by all market sub-components for consistent styling.
 */
export const C = {
  gold: '#D4A84B',
  goldDim: 'rgba(212,168,75,0.15)',
  green: '#4CAF50',
  greenDim: 'rgba(76,175,80,0.12)',
  red: '#FF6B6B',
  redDim: 'rgba(255,107,107,0.12)',
  cyan: '#22D3EE',
  border: '#2A2A2A',
  surface: '#1A1A1A',
  surfaceHover: '#252525',
  bg: '#0E0E0E',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
} as const;

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** Format a number with 2 decimal places, or return em-dash for null/undefined. */
export const fmt = (v: number | null | undefined, locale = 'en-US') =>
  v != null
    ? v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '\u2014';

/** Format a decimal as a percentage string with 1 decimal place. */
export const pctFmt = (v: number | null | undefined) =>
  v != null ? (v * 100).toFixed(1) + '%' : '\u2014';

// ---------------------------------------------------------------------------
// Legend items
// ---------------------------------------------------------------------------

export interface LegendItem {
  labelAr: string;
  labelEn: string;
  color: string;
}

export const LEGEND_ITEMS: LegendItem[] = [
  { labelAr: '\u0639\u0645\u0644\u0627\u062A \u0631\u0642\u0645\u064A\u0629', labelEn: 'Crypto', color: '#A78BFA' },
  { labelAr: '\u0633\u0644\u0639', labelEn: 'Commodity', color: C.gold },
  { labelAr: '\u0637\u0627\u0642\u0629', labelEn: 'Energy', color: '#F59E0B' },
  { labelAr: '\u0645\u0624\u0634\u0631\u0627\u062A \u0623\u0645\u0631\u064A\u0643\u064A\u0629', labelEn: 'US Index', color: '#60A5FA' },
  { labelAr: '\u0633\u0639\u0648\u062F\u064A', labelEn: 'Saudi', color: '#10B981' },
];

// ---------------------------------------------------------------------------
// CSS Keyframes (injected once)
// ---------------------------------------------------------------------------

export const MARKET_KEYFRAMES = `
  @keyframes pulseRing { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.08);opacity:0.2} }
  @keyframes orbitDash { to{stroke-dashoffset:-20} }
  @keyframes labelPop { from{opacity:0;transform:translate(-50%,-50%) scale(0.5)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
  @keyframes priceFlash { 0%{box-shadow:0 0 0 0 rgba(212,168,75,0.5)} 50%{box-shadow:0 0 16px 4px rgba(212,168,75,0.25)} 100%{box-shadow:0 0 0 0 rgba(212,168,75,0)} }
  @keyframes statusPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
`;
