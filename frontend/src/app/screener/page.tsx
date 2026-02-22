'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { useSectors, useScreener } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import type { ScreenerFilters, ScreenerItem } from '@/lib/api/screener';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const P = {
  bg: "#07080C",
  surface: "#0D0F14",
  surfaceElevated: "#12151C",
  border: "rgba(197, 179, 138, 0.08)",
  borderHover: "rgba(197, 179, 138, 0.2)",
  gold: "#C5B38A",
  goldBright: "#E4D5B0",
  goldMuted: "rgba(197, 179, 138, 0.6)",
  goldSubtle: "rgba(197, 179, 138, 0.12)",
  text: "#E8E4DC",
  textSecondary: "#8A8578",
  textMuted: "#5A574F",
  green: "#6BCB8B",
  greenDeep: "#2D8B55",
  red: "#E06C6C",
  redDeep: "#B84444",
  greenMuted: "rgba(107, 203, 139, 0.12)",
  redMuted: "rgba(224, 108, 108, 0.12)",
} as const;

const F = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  ui: "'DM Sans', -apple-system, sans-serif",
  arabic: "'Noto Kufi Arabic', 'DM Sans', sans-serif",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (Math.abs(val) >= 1e12) return `${(val / 1e12).toFixed(1)}T`;
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  return val.toFixed(2);
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  return `${(val * 100).toFixed(1)}%`;
}

function exportCSV(items: ScreenerItem[]) {
  const headers = ['Ticker', 'Name', 'Sector', 'Price', 'Change%', 'Market Cap', 'P/E', 'P/B', 'ROE', 'Div Yield', 'D/E'];
  const rows = items.map((item) => [
    item.ticker,
    item.short_name || '',
    item.sector || '',
    item.current_price?.toFixed(2) || '',
    item.change_pct?.toFixed(2) || '',
    item.market_cap || '',
    item.trailing_pe?.toFixed(2) || '',
    item.price_to_book?.toFixed(2) || '',
    item.roe != null ? (item.roe * 100).toFixed(1) : '',
    item.dividend_yield != null ? (item.dividend_yield * 100).toFixed(1) : '',
    item.debt_to_equity?.toFixed(2) || '',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `screener-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Filter presets
// ---------------------------------------------------------------------------

interface FilterPreset {
  label: string;
  labelAr: string;
  desc: string;
  filters: Partial<ScreenerFilters>;
}

const PRESETS: FilterPreset[] = [
  { label: 'Value Stocks', labelAr: 'أسهم القيمة', desc: 'P/E ≤ 15 · P/B ≤ 1.5', filters: { pe_max: 15, pb_max: 1.5, sort_by: 'trailing_pe', sort_dir: 'asc' } },
  { label: 'Growth Stocks', labelAr: 'أسهم النمو', desc: 'Rev +10% · ROE ≥ 15%', filters: { revenue_growth_min: 0.1, roe_min: 0.15, sort_by: 'revenue_growth', sort_dir: 'desc' } },
  { label: 'Dividend Plays', labelAr: 'توزيعات أرباح', desc: 'Yield ≥ 3%', filters: { dividend_yield_min: 0.03, sort_by: 'dividend_yield', sort_dir: 'desc' } },
  { label: 'Low Debt', labelAr: 'ديون منخفضة', desc: 'D/E ≤ 0.5 · CR ≥ 1.5', filters: { debt_to_equity_max: 0.5, current_ratio_min: 1.5, sort_by: 'debt_to_equity', sort_dir: 'asc' } },
];

// ---------------------------------------------------------------------------
// Range input component
// ---------------------------------------------------------------------------

function RangeInput({ label, min, max, onMinChange, onMaxChange, step = 0.1 }: {
  label: string;
  min: number | undefined;
  max: number | undefined;
  onMinChange: (v: number | undefined) => void;
  onMaxChange: (v: number | undefined) => void;
  step?: number;
}) {
  return (
    <div>
      <label style={{
        fontFamily: F.mono,
        fontSize: 9,
        color: P.textMuted,
        letterSpacing: "0.12em",
        textTransform: "uppercase" as const,
        display: "block",
        marginBottom: 6,
      }}>
        {label}
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="number"
          placeholder="Min"
          step={step}
          value={min ?? ''}
          onChange={(e) => onMinChange(e.target.value ? Number(e.target.value) : undefined)}
          className="range-input"
          style={{
            width: "100%",
            background: P.bg,
            border: `1px solid ${P.border}`,
            borderRadius: 3,
            padding: "6px 10px",
            fontSize: 11,
            fontFamily: F.mono,
            color: P.text,
            outline: "none",
          }}
        />
        <input
          type="number"
          placeholder="Max"
          step={step}
          value={max ?? ''}
          onChange={(e) => onMaxChange(e.target.value ? Number(e.target.value) : undefined)}
          className="range-input"
          style={{
            width: "100%",
            background: P.bg,
            border: `1px solid ${P.border}`,
            borderRadius: 3,
            padding: "6px 10px",
            fontSize: 11,
            fontFamily: F.mono,
            color: P.text,
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort columns
// ---------------------------------------------------------------------------

type SortColumn = 'ticker' | 'current_price' | 'change_pct' | 'market_cap' | 'trailing_pe' | 'price_to_book' | 'roe' | 'dividend_yield' | 'debt_to_equity';

const SORT_COLUMNS: { id: SortColumn; labelEn: string; labelAr: string }[] = [
  { id: 'ticker', labelEn: 'Ticker', labelAr: 'الرمز' },
  { id: 'current_price', labelEn: 'Price', labelAr: 'السعر' },
  { id: 'change_pct', labelEn: 'Change', labelAr: 'التغير' },
  { id: 'market_cap', labelEn: 'Mkt Cap', labelAr: 'القيمة السوقية' },
  { id: 'trailing_pe', labelEn: 'P/E', labelAr: 'مكرر الأرباح' },
  { id: 'price_to_book', labelEn: 'P/B', labelAr: 'السعر/القيمة' },
  { id: 'roe', labelEn: 'ROE', labelAr: 'العائد على الملكية' },
  { id: 'dividend_yield', labelEn: 'Yield', labelAr: 'العائد' },
  { id: 'debt_to_equity', labelEn: 'D/E', labelAr: 'الديون/الملكية' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ScreenerPage() {
  const { t, language } = useLanguage();
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const { data: sectors } = useSectors();

  // Filter state
  const [filters, setFilters] = useState<ScreenerFilters>({
    sort_by: 'market_cap',
    sort_dir: 'desc',
    limit: 50,
    offset: 0,
  });

  const [filtersOpen, setFiltersOpen] = useState(true);

  const updateFilter = useCallback(<K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value, offset: 0 }));
  }, []);

  const applyPreset = useCallback((preset: FilterPreset) => {
    setFilters({
      sort_by: 'market_cap',
      sort_dir: 'desc',
      limit: 50,
      offset: 0,
      ...preset.filters,
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ sort_by: 'market_cap', sort_dir: 'desc', limit: 50, offset: 0 });
  }, []);

  const toggleSort = useCallback((col: SortColumn) => {
    setFilters((prev) => ({
      ...prev,
      sort_by: col,
      sort_dir: prev.sort_by === col && prev.sort_dir === 'desc' ? 'asc' : 'desc',
      offset: 0,
    }));
  }, []);

  // Fetch data
  const { data, loading, error, refetch } = useScreener(filters);

  const items = data?.items ?? [];
  const totalCount = data?.total_count ?? 0;
  const currentPage = Math.floor((filters.offset ?? 0) / (filters.limit ?? 50)) + 1;
  const totalPages = Math.ceil(totalCount / (filters.limit ?? 50));

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sector) count++;
    if (filters.pe_min != null || filters.pe_max != null) count++;
    if (filters.pb_min != null || filters.pb_max != null) count++;
    if (filters.roe_min != null || filters.roe_max != null) count++;
    if (filters.dividend_yield_min != null || filters.dividend_yield_max != null) count++;
    if (filters.market_cap_min != null || filters.market_cap_max != null) count++;
    if (filters.revenue_growth_min != null || filters.revenue_growth_max != null) count++;
    if (filters.debt_to_equity_max != null) count++;
    if (filters.current_ratio_min != null) count++;
    if (filters.recommendation) count++;
    return count;
  }, [filters]);

  return (
    <div style={{ minHeight: "100vh", background: P.bg, color: P.text, fontFamily: F.ui }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@300;400;500&family=Noto+Kufi+Arabic:wght@300;400;500;600;700&display=swap');

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { opacity: 0.3; }
          50% { opacity: 0.7; }
          100% { opacity: 0.3; }
        }
        @keyframes spinGold {
          to { transform: rotate(360deg); }
        }

        * { box-sizing: border-box; }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(197, 179, 138, 0.15); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(197, 179, 138, 0.3); }

        .range-input::placeholder { color: ${P.textMuted}; }
        .range-input:focus { border-color: ${P.gold} !important; box-shadow: 0 0 0 2px rgba(197, 179, 138, 0.08) !important; }

        .luxury-select {
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235A574F'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 28px !important;
          cursor: pointer;
        }
        .luxury-select:focus { border-color: ${P.gold} !important; box-shadow: 0 0 0 2px rgba(197, 179, 138, 0.08) !important; outline: none; }

        .preset-card { transition: all 0.25s ease; }
        .preset-card:hover {
          border-color: ${P.borderHover} !important;
          box-shadow: 0 0 20px ${P.goldSubtle};
          transform: translateY(-1px);
        }

        .sort-th { transition: color 0.15s ease; cursor: pointer; }
        .sort-th:hover { color: ${P.gold} !important; }

        .result-row { transition: background 0.15s ease; }
        .result-row:hover { background: ${P.surfaceElevated} !important; }

        .action-btn { transition: all 0.2s ease; }
        .action-btn:hover { border-color: ${P.borderHover} !important; color: ${P.gold} !important; }

        .filters-toggle-active { background: ${P.goldSubtle} !important; border-color: rgba(197, 179, 138, 0.3) !important; color: ${P.gold} !important; }

        .mobile-card { transition: border-color 0.2s ease; }
        .mobile-card:hover { border-color: rgba(197, 179, 138, 0.25) !important; }

        .page-btn { transition: all 0.2s ease; }
        .page-btn:hover:not(:disabled) { border-color: ${P.gold} !important; color: ${P.gold} !important; box-shadow: 0 0 12px rgba(197, 179, 138, 0.1); }
        .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .screener-content { animation: slideUp 0.4s ease both; }
      `}</style>

      {/* Ambient background */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 50% at 15% 5%, rgba(197, 179, 138, 0.025) 0%, transparent 60%)",
        zIndex: 0,
      }} />
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.35, mixBlendMode: "overlay" as const,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
        backgroundSize: "256px 256px",
        zIndex: 0,
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Page Header */}
        <div style={{
          padding: "24px 40px 0",
          borderBottom: `1px solid ${P.border}`,
          paddingBottom: 20,
        }}>
          {/* Title row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{
                fontFamily: F.mono,
                fontSize: 9,
                color: P.gold,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}>
                TASI &middot; TADAWUL
              </div>
              <h1 style={{
                fontFamily: F.display,
                fontSize: 32,
                fontWeight: 600,
                color: P.text,
                letterSpacing: "0.02em",
                margin: 0,
                lineHeight: 1.1,
              }} dir={dir}>
                {t('فرز الأسهم', 'Stock Screener')}
              </h1>
              <p style={{
                fontFamily: F.mono,
                fontSize: 10,
                color: P.textMuted,
                marginTop: 5,
                letterSpacing: "0.05em",
              }} dir={dir}>
                {totalCount > 0
                  ? `${totalCount} ${t('نتيجة مطابقة للفلاتر', 'results matching filters')}`
                  : t('فلترة وترتيب أسهم تداول', 'Filter and rank TASI stocks')}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className={cn("action-btn", filtersOpen ? "filters-toggle-active" : "")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 3,
                  background: "transparent",
                  border: `1px solid ${P.border}`,
                  color: P.textSecondary,
                  fontFamily: F.mono,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 3h10M3 6h6M5 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {t('الفلاتر', 'Filters')}
                {activeFilterCount > 0 && (
                  <span style={{
                    background: P.gold,
                    color: P.bg,
                    borderRadius: "50%",
                    width: 16,
                    height: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 700,
                  }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {items.length > 0 && (
                <button
                  onClick={() => exportCSV(items)}
                  className="action-btn"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 3,
                    background: "transparent",
                    border: `1px solid ${P.border}`,
                    color: P.textSecondary,
                    fontFamily: F.mono,
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M5.5 1v6M2.5 5l3 3 3-3M1 9h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('تصدير CSV', 'Export CSV')}
                </button>
              )}
            </div>
          </div>

          {/* Preset Cards row */}
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="preset-card"
                style={{
                  padding: "10px 14px",
                  borderRadius: 3,
                  background: P.surface,
                  border: `1px solid ${P.border}`,
                  cursor: "pointer",
                  textAlign: "left",
                  minWidth: 130,
                  flexShrink: 0,
                }}
              >
                <div style={{
                  fontFamily: F.display,
                  fontSize: 14,
                  fontWeight: 600,
                  color: P.text,
                  whiteSpace: "nowrap",
                }}>
                  {language === 'ar' ? preset.labelAr : preset.label}
                </div>
                <div style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: P.textMuted,
                  marginTop: 3,
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                }}>
                  {preset.desc}
                </div>
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                style={{
                  padding: "10px 14px",
                  borderRadius: 3,
                  background: "transparent",
                  border: `1px solid rgba(224, 108, 108, 0.2)`,
                  cursor: "pointer",
                  flexShrink: 0,
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: P.red,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  transition: "all 0.2s ease",
                  alignSelf: "center",
                }}
              >
                {t('مسح الكل', 'Clear All')}
              </button>
            )}
          </div>
        </div>

        {/* Filter Panel */}
        {filtersOpen && (
          <div className="screener-content" style={{
            margin: "0 40px",
            background: P.surface,
            border: `1px solid ${P.border}`,
            borderTop: `2px solid ${P.gold}`,
            borderRadius: "0 0 4px 4px",
            padding: "20px 24px",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
              {/* Sector */}
              <div>
                <label style={{
                  fontFamily: F.mono, fontSize: 9, color: P.textMuted,
                  letterSpacing: "0.12em", textTransform: "uppercase" as const, display: "block", marginBottom: 6,
                }}>
                  {t('القطاع', 'Sector')}
                </label>
                <select
                  value={filters.sector || ''}
                  onChange={(e) => updateFilter('sector', e.target.value || undefined)}
                  className="luxury-select"
                  style={{
                    width: "100%", background: P.bg, border: `1px solid ${P.border}`,
                    borderRadius: 3, padding: "6px 10px", fontSize: 11, fontFamily: F.mono,
                    color: P.text,
                  }}
                >
                  <option value="">{t('الكل', 'All Sectors')}</option>
                  {sectors?.map((s) => (
                    <option key={s.sector} value={s.sector}>{s.sector} ({s.company_count})</option>
                  ))}
                </select>
              </div>

              {/* Recommendation */}
              <div>
                <label style={{
                  fontFamily: F.mono, fontSize: 9, color: P.textMuted,
                  letterSpacing: "0.12em", textTransform: "uppercase" as const, display: "block", marginBottom: 6,
                }}>
                  {t('التوصية', 'Recommendation')}
                </label>
                <select
                  value={filters.recommendation || ''}
                  onChange={(e) => updateFilter('recommendation', e.target.value || undefined)}
                  className="luxury-select"
                  style={{
                    width: "100%", background: P.bg, border: `1px solid ${P.border}`,
                    borderRadius: 3, padding: "6px 10px", fontSize: 11, fontFamily: F.mono,
                    color: P.text,
                  }}
                >
                  <option value="">{t('الكل', 'All')}</option>
                  <option value="buy">{t('شراء', 'Buy')}</option>
                  <option value="hold">{t('احتفاظ', 'Hold')}</option>
                  <option value="sell">{t('بيع', 'Sell')}</option>
                </select>
              </div>

              {/* Range inputs */}
              <RangeInput
                label={t('مكرر الأرباح (P/E)', 'P/E Ratio')}
                min={filters.pe_min}
                max={filters.pe_max}
                onMinChange={(v) => updateFilter('pe_min', v)}
                onMaxChange={(v) => updateFilter('pe_max', v)}
              />
              <RangeInput
                label={t('السعر/القيمة (P/B)', 'P/B Ratio')}
                min={filters.pb_min}
                max={filters.pb_max}
                onMinChange={(v) => updateFilter('pb_min', v)}
                onMaxChange={(v) => updateFilter('pb_max', v)}
              />
              <RangeInput
                label={t('العائد على الملكية (ROE)', 'ROE')}
                min={filters.roe_min}
                max={filters.roe_max}
                onMinChange={(v) => updateFilter('roe_min', v)}
                onMaxChange={(v) => updateFilter('roe_max', v)}
                step={0.01}
              />
              <RangeInput
                label={t('عائد التوزيعات', 'Dividend Yield')}
                min={filters.dividend_yield_min}
                max={filters.dividend_yield_max}
                onMinChange={(v) => updateFilter('dividend_yield_min', v)}
                onMaxChange={(v) => updateFilter('dividend_yield_max', v)}
                step={0.005}
              />
              <RangeInput
                label={t('القيمة السوقية', 'Market Cap')}
                min={filters.market_cap_min}
                max={filters.market_cap_max}
                onMinChange={(v) => updateFilter('market_cap_min', v)}
                onMaxChange={(v) => updateFilter('market_cap_max', v)}
                step={1000000}
              />
              <RangeInput
                label={t('نمو الإيرادات', 'Revenue Growth')}
                min={filters.revenue_growth_min}
                max={filters.revenue_growth_max}
                onMinChange={(v) => updateFilter('revenue_growth_min', v)}
                onMaxChange={(v) => updateFilter('revenue_growth_max', v)}
                step={0.01}
              />

              {/* Single inputs */}
              <div>
                <label style={{
                  fontFamily: F.mono, fontSize: 9, color: P.textMuted,
                  letterSpacing: "0.12em", textTransform: "uppercase" as const, display: "block", marginBottom: 6,
                }}>
                  {t('الحد الأقصى للديون/الملكية', 'Max D/E Ratio')}
                </label>
                <input
                  type="number"
                  placeholder="Max"
                  step={0.1}
                  value={filters.debt_to_equity_max ?? ''}
                  onChange={(e) => updateFilter('debt_to_equity_max', e.target.value ? Number(e.target.value) : undefined)}
                  className="range-input"
                  style={{
                    width: "100%", background: P.bg, border: `1px solid ${P.border}`,
                    borderRadius: 3, padding: "6px 10px", fontSize: 11, fontFamily: F.mono,
                    color: P.text, outline: "none",
                  }}
                />
              </div>
              <div>
                <label style={{
                  fontFamily: F.mono, fontSize: 9, color: P.textMuted,
                  letterSpacing: "0.12em", textTransform: "uppercase" as const, display: "block", marginBottom: 6,
                }}>
                  {t('الحد الأدنى للنسبة الجارية', 'Min Current Ratio')}
                </label>
                <input
                  type="number"
                  placeholder="Min"
                  step={0.1}
                  value={filters.current_ratio_min ?? ''}
                  onChange={(e) => updateFilter('current_ratio_min', e.target.value ? Number(e.target.value) : undefined)}
                  className="range-input"
                  style={{
                    width: "100%", background: P.bg, border: `1px solid ${P.border}`,
                    borderRadius: 3, padding: "6px 10px", fontSize: 11, fontFamily: F.mono,
                    color: P.text, outline: "none",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div style={{ padding: "20px 40px 40px" }}>
          {loading && !data ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 0",
              gap: 16,
              animation: "fadeIn 0.3s ease",
            }}>
              <div style={{
                width: 32,
                height: 32,
                border: `1px solid ${P.border}`,
                borderTop: `1px solid ${P.gold}`,
                borderRadius: "50%",
                animation: "spinGold 1s linear infinite",
              }} />
              <p style={{ fontFamily: F.mono, fontSize: 10, color: P.textMuted, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                {t('جاري البحث...', 'Searching...')}
              </p>
            </div>
          ) : error ? (
            <div style={{
              textAlign: "center",
              padding: "80px 0",
              animation: "fadeIn 0.3s ease",
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: `1px solid rgba(224, 108, 108, 0.3)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={P.red} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p style={{ fontFamily: F.display, fontSize: 18, color: P.text, marginBottom: 8 }} dir={dir}>
                {t('تعذّر تحميل نتائج الفلترة', 'Failed to load screener results')}
              </p>
              <p style={{ fontFamily: F.mono, fontSize: 10, color: P.textMuted, letterSpacing: "0.05em", marginBottom: 20 }} dir={dir}>
                {t('الخوادم غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.', 'Servers may be temporarily unavailable. Please try again later.')}
              </p>
              <button
                onClick={refetch}
                style={{
                  padding: "8px 20px",
                  borderRadius: 3,
                  background: "transparent",
                  border: `1px solid ${P.border}`,
                  color: P.gold,
                  fontFamily: F.mono,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "80px 0",
              animation: "fadeIn 0.3s ease",
            }}>
              <div style={{
                fontFamily: F.display,
                fontSize: 48,
                color: P.textMuted,
                opacity: 0.3,
                marginBottom: 16,
                letterSpacing: "0.1em",
              }}>
                &mdash;
              </div>
              <p style={{ fontFamily: F.display, fontSize: 18, color: P.textSecondary }} dir={dir}>
                {t('لا توجد نتائج مطابقة', 'No matching stocks found')}
              </p>
              <p style={{ fontFamily: F.mono, fontSize: 10, color: P.textMuted, marginTop: 8, letterSpacing: "0.05em" }} dir={dir}>
                {t('حاول تعديل معايير الفلترة', 'Try adjusting your filter criteria')}
              </p>
            </div>
          ) : (
            <div className="screener-content">
              {/* Desktop Table */}
              <div className="hidden md:block" style={{
                background: P.surface,
                border: `1px solid ${P.border}`,
                borderRadius: 4,
                overflow: "hidden",
                marginBottom: 16,
              }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: P.bg, borderBottom: `1px solid ${P.border}` }}>
                        <th style={{
                          padding: "10px 16px",
                          textAlign: "left",
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: P.textMuted,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          fontWeight: 500,
                          width: 200,
                        }}>
                          {t('الشركة', 'Company')}
                        </th>
                        {SORT_COLUMNS.filter((c) => c.id !== 'ticker').map((col) => (
                          <th
                            key={col.id}
                            onClick={() => toggleSort(col.id)}
                            className="sort-th"
                            style={{
                              padding: "10px 16px",
                              textAlign: "right",
                              fontFamily: F.mono,
                              fontSize: 9,
                              color: filters.sort_by === col.id ? P.gold : P.textMuted,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              userSelect: "none",
                            }}
                          >
                            {language === 'ar' ? col.labelAr : col.labelEn}
                            {filters.sort_by === col.id && (
                              <span style={{ marginInlineStart: 4, color: P.gold, fontSize: 8 }}>
                                {filters.sort_dir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr
                          key={item.ticker}
                          className="result-row"
                          style={{
                            borderBottom: idx < items.length - 1 ? `1px solid rgba(197, 179, 138, 0.04)` : "none",
                            background: "transparent",
                          }}
                        >
                          <td style={{ padding: "10px 16px" }}>
                            <Link
                              href={`/stock/${encodeURIComponent(item.ticker)}`}
                              style={{
                                fontFamily: F.display,
                                fontSize: 14,
                                fontWeight: 600,
                                color: P.text,
                                textDecoration: "none",
                                transition: "color 0.15s ease",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = P.goldBright)}
                              onMouseLeave={(e) => (e.currentTarget.style.color = P.text)}
                            >
                              {item.short_name || item.ticker}
                            </Link>
                            <div style={{
                              fontFamily: F.mono,
                              fontSize: 9,
                              color: P.textMuted,
                              marginTop: 2,
                              letterSpacing: "0.06em",
                            }}>
                              {item.ticker.replace('.SR', '')}{item.sector && ` · ${item.sector}`}
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: F.mono, fontSize: 12, color: P.text }}>
                            {item.current_price?.toFixed(2) ?? '-'}
                          </td>
                          <td style={{
                            padding: "10px 16px",
                            textAlign: "right",
                            fontFamily: F.mono,
                            fontSize: 12,
                            fontWeight: 600,
                            color: (item.change_pct ?? 0) >= 0 ? P.green : P.red,
                          }}>
                            {item.change_pct != null
                              ? `${item.change_pct >= 0 ? '+' : ''}${item.change_pct.toFixed(2)}%`
                              : '-'}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: F.mono, fontSize: 11, color: P.textSecondary }}>
                            {formatNumber(item.market_cap)}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: F.mono, fontSize: 11, color: P.textSecondary }}>
                            {item.trailing_pe?.toFixed(1) ?? '-'}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: F.mono, fontSize: 11, color: P.textSecondary }}>
                            {item.price_to_book?.toFixed(2) ?? '-'}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: F.mono, fontSize: 11, color: P.textSecondary }}>
                            {formatPct(item.roe)}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: F.mono, fontSize: 11, color: P.textSecondary }}>
                            {formatPct(item.dividend_yield)}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: F.mono, fontSize: 11, color: P.textSecondary }}>
                            {item.debt_to_equity?.toFixed(2) ?? '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((item) => (
                  <Link
                    key={item.ticker}
                    href={`/stock/${encodeURIComponent(item.ticker)}`}
                    className="mobile-card"
                    style={{
                      display: "block",
                      background: P.surface,
                      border: `1px solid ${P.border}`,
                      borderRadius: 4,
                      padding: "14px 16px",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontFamily: F.display, fontSize: 15, fontWeight: 600, color: P.text }}>
                          {item.short_name || item.ticker}
                        </div>
                        <div style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, marginTop: 2, letterSpacing: "0.06em" }}>
                          {item.ticker.replace('.SR', '')}{item.sector && ` · ${item.sector}`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 600, color: P.text }}>
                          {item.current_price?.toFixed(2) ?? '-'}
                        </div>
                        <div style={{
                          fontFamily: F.mono,
                          fontSize: 11,
                          fontWeight: 600,
                          color: (item.change_pct ?? 0) >= 0 ? P.green : P.red,
                          marginTop: 2,
                        }}>
                          {item.change_pct != null
                            ? `${item.change_pct >= 0 ? '+' : ''}${item.change_pct.toFixed(2)}%`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                      {([
                        ['P/E', item.trailing_pe?.toFixed(1) ?? '-'],
                        ['P/B', item.price_to_book?.toFixed(2) ?? '-'],
                        ['ROE', formatPct(item.roe)],
                        ['Cap', formatNumber(item.market_cap)],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontFamily: F.mono, fontSize: 8, color: P.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                            {label}
                          </div>
                          <div style={{ fontFamily: F.mono, fontSize: 11, color: P.textSecondary, marginTop: 1 }}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 20 }}>
                  <button
                    onClick={() => updateFilter('offset', Math.max(0, (filters.offset ?? 0) - (filters.limit ?? 50)))}
                    disabled={currentPage <= 1}
                    className="page-btn"
                    style={{
                      padding: "8px 18px",
                      borderRadius: 3,
                      background: "transparent",
                      border: `1px solid ${P.border}`,
                      color: P.textSecondary,
                      fontFamily: F.mono,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {t('السابق', 'Previous')}
                  </button>
                  <span style={{ fontFamily: F.mono, fontSize: 10, color: P.textMuted, letterSpacing: "0.1em" }}>
                    {currentPage}
                    <span style={{ margin: "0 6px", color: P.textMuted, opacity: 0.4 }}>/</span>
                    {totalPages}
                  </span>
                  <button
                    onClick={() => updateFilter('offset', (filters.offset ?? 0) + (filters.limit ?? 50))}
                    disabled={currentPage >= totalPages}
                    className="page-btn"
                    style={{
                      padding: "8px 18px",
                      borderRadius: 3,
                      background: "transparent",
                      border: `1px solid ${P.border}`,
                      color: P.textSecondary,
                      fontFamily: F.mono,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {t('التالي', 'Next')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
