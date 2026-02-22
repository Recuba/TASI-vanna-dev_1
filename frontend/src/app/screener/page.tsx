'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { useSectors, useScreener } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import type { ScreenerFilters, ScreenerItem } from '@/lib/api/screener';

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
  filters: Partial<ScreenerFilters>;
}

const PRESETS: FilterPreset[] = [
  { label: 'Value Stocks', labelAr: 'أسهم القيمة', filters: { pe_max: 15, pb_max: 1.5, sort_by: 'trailing_pe', sort_dir: 'asc' } },
  { label: 'Growth Stocks', labelAr: 'أسهم النمو', filters: { revenue_growth_min: 0.1, roe_min: 0.15, sort_by: 'revenue_growth', sort_dir: 'desc' } },
  { label: 'Dividend Plays', labelAr: 'توزيعات أرباح', filters: { dividend_yield_min: 0.03, sort_by: 'dividend_yield', sort_dir: 'desc' } },
  { label: 'Low Debt', labelAr: 'ديون منخفضة', filters: { debt_to_equity_max: 0.5, current_ratio_min: 1.5, sort_by: 'debt_to_equity', sort_dir: 'asc' } },
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
      <label className="text-xs text-[var(--text-muted)] mb-1 block">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Min"
          step={step}
          value={min ?? ''}
          onChange={(e) => onMinChange(e.target.value ? Number(e.target.value) : undefined)}
          className="w-full bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-gold/50 focus:outline-none"
        />
        <input
          type="number"
          placeholder="Max"
          step={step}
          value={max ?? ''}
          onChange={(e) => onMaxChange(e.target.value ? Number(e.target.value) : undefined)}
          className="w-full bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-gold/50 focus:outline-none"
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
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]" dir={dir}>
              {t('فرز الأسهم', 'Stock Screener')}
            </h1>
            <p className="text-xs text-[var(--text-muted)]" dir={dir}>
              {t('فلترة وترتيب أسهم تداول', 'Filter and sort TASI stocks')}
              {totalCount > 0 && ` — ${totalCount} ${t('نتيجة', 'results')}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                filtersOpen ? 'bg-gold/15 text-gold border-gold/30' : 'text-[var(--text-muted)] border-[#2A2A2A] hover:text-[var(--text-secondary)]'
              )}
            >
              {t('الفلاتر', 'Filters')} {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            {items.length > 0 && (
              <button
                onClick={() => exportCSV(items)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] border border-[#2A2A2A] hover:text-gold hover:border-gold/30 transition-colors"
              >
                {t('تصدير CSV', 'Export CSV')}
              </button>
            )}
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-gold/10 hover:text-gold border border-[#2A2A2A] hover:border-gold/30 transition-colors"
            >
              {language === 'ar' ? preset.labelAr : preset.label}
            </button>
          ))}
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-accent-red/80 hover:text-accent-red transition-colors"
            >
              {t('مسح الكل', 'Clear All')}
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {filtersOpen && (
          <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Sector */}
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('القطاع', 'Sector')}</label>
                <select
                  value={filters.sector || ''}
                  onChange={(e) => updateFilter('sector', e.target.value || undefined)}
                  className="w-full bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-gold/50 focus:outline-none"
                >
                  <option value="">{t('الكل', 'All Sectors')}</option>
                  {sectors?.map((s) => (
                    <option key={s.sector} value={s.sector}>{s.sector} ({s.company_count})</option>
                  ))}
                </select>
              </div>

              {/* Recommendation */}
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('التوصية', 'Recommendation')}</label>
                <select
                  value={filters.recommendation || ''}
                  onChange={(e) => updateFilter('recommendation', e.target.value || undefined)}
                  className="w-full bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-gold/50 focus:outline-none"
                >
                  <option value="">{t('الكل', 'All')}</option>
                  <option value="buy">{t('شراء', 'Buy')}</option>
                  <option value="hold">{t('احتفاظ', 'Hold')}</option>
                  <option value="sell">{t('بيع', 'Sell')}</option>
                </select>
              </div>

              {/* Ranges */}
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

              {/* Single max / min */}
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('الحد الأقصى للديون/الملكية', 'Max D/E Ratio')}</label>
                <input
                  type="number"
                  placeholder="Max"
                  step={0.1}
                  value={filters.debt_to_equity_max ?? ''}
                  onChange={(e) => updateFilter('debt_to_equity_max', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-gold/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('الحد الأدنى للنسبة الجارية', 'Min Current Ratio')}</label>
                <input
                  type="number"
                  placeholder="Min"
                  step={0.1}
                  value={filters.current_ratio_min ?? ''}
                  onChange={(e) => updateFilter('current_ratio_min', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-gold/50 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {loading && !data ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner message={t('جاري البحث...', 'Searching...')} />
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-sm text-accent-red">{error}</p>
            <button onClick={refetch} className="text-xs text-gold hover:text-gold-light">{t('إعادة المحاولة', 'Retry')}</button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--text-muted)]" dir={dir}>{t('لا توجد نتائج مطابقة', 'No matching stocks found')}</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2A2A2A] bg-[var(--bg-input)]">
                      <th className="text-start py-2.5 px-3 text-xs text-[var(--text-muted)] font-medium w-[180px]">
                        {t('الشركة', 'Company')}
                      </th>
                      {SORT_COLUMNS.filter((c) => c.id !== 'ticker').map((col) => (
                        <th
                          key={col.id}
                          onClick={() => toggleSort(col.id)}
                          className="text-end py-2.5 px-3 text-xs text-[var(--text-muted)] font-medium cursor-pointer hover:text-gold transition-colors whitespace-nowrap"
                        >
                          {language === 'ar' ? col.labelAr : col.labelEn}
                          {filters.sort_by === col.id && (
                            <span className="ms-1 text-gold">{filters.sort_dir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.ticker} className="border-b border-[#2A2A2A]/30 hover:bg-[var(--bg-card-hover)] transition-colors">
                        <td className="py-2 px-3">
                          <Link href={`/stock/${encodeURIComponent(item.ticker)}`} className="text-[var(--text-primary)] hover:text-gold transition-colors font-medium text-sm">
                            {item.short_name || item.ticker}
                          </Link>
                          <div className="text-[10px] text-[var(--text-muted)]">{item.ticker.replace('.SR', '')} {item.sector && `· ${item.sector}`}</div>
                        </td>
                        <td className="text-end py-2 px-3 text-[var(--text-primary)] font-mono text-xs">{item.current_price?.toFixed(2) ?? '-'}</td>
                        <td className={cn('text-end py-2 px-3 font-medium font-mono text-xs', (item.change_pct ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                          {item.change_pct != null ? `${item.change_pct >= 0 ? '+' : ''}${item.change_pct.toFixed(2)}%` : '-'}
                        </td>
                        <td className="text-end py-2 px-3 text-[var(--text-secondary)] text-xs">{formatNumber(item.market_cap)}</td>
                        <td className="text-end py-2 px-3 text-[var(--text-secondary)] text-xs">{item.trailing_pe?.toFixed(1) ?? '-'}</td>
                        <td className="text-end py-2 px-3 text-[var(--text-secondary)] text-xs">{item.price_to_book?.toFixed(2) ?? '-'}</td>
                        <td className="text-end py-2 px-3 text-[var(--text-secondary)] text-xs">{formatPct(item.roe)}</td>
                        <td className="text-end py-2 px-3 text-[var(--text-secondary)] text-xs">{formatPct(item.dividend_yield)}</td>
                        <td className="text-end py-2 px-3 text-[var(--text-secondary)] text-xs">{item.debt_to_equity?.toFixed(2) ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {items.map((item) => (
                <Link
                  key={item.ticker}
                  href={`/stock/${encodeURIComponent(item.ticker)}`}
                  className="block bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-[var(--text-primary)]">{item.short_name || item.ticker}</span>
                      <span className="text-[10px] text-[var(--text-muted)] ms-1.5">{item.ticker.replace('.SR', '')}</span>
                    </div>
                    <div className="text-end">
                      <span className="text-sm font-bold text-[var(--text-primary)]">{item.current_price?.toFixed(2) ?? '-'}</span>
                      <span className={cn('text-[10px] font-bold ms-1', (item.change_pct ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                        {item.change_pct != null ? `${item.change_pct >= 0 ? '+' : ''}${item.change_pct.toFixed(2)}%` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[10px]">
                    <div><span className="text-[var(--text-muted)]">P/E</span> <span className="text-[var(--text-secondary)]">{item.trailing_pe?.toFixed(1) ?? '-'}</span></div>
                    <div><span className="text-[var(--text-muted)]">P/B</span> <span className="text-[var(--text-secondary)]">{item.price_to_book?.toFixed(2) ?? '-'}</span></div>
                    <div><span className="text-[var(--text-muted)]">ROE</span> <span className="text-[var(--text-secondary)]">{formatPct(item.roe)}</span></div>
                    <div><span className="text-[var(--text-muted)]">Cap</span> <span className="text-[var(--text-secondary)]">{formatNumber(item.market_cap)}</span></div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-2">
                <button
                  onClick={() => updateFilter('offset', Math.max(0, (filters.offset ?? 0) - (filters.limit ?? 50)))}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[#2A2A2A] hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t('السابق', 'Previous')}
                </button>
                <span className="text-xs text-[var(--text-muted)]">
                  {t('صفحة', 'Page')} {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => updateFilter('offset', (filters.offset ?? 0) + (filters.limit ?? 50))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[#2A2A2A] hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t('التالي', 'Next')}
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
