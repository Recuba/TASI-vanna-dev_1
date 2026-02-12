'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSectors, useEntities } from '@/lib/hooks/use-api';
import { AreaChart, MiniSparkline, ChartWrapper, TradingViewAttribution, ChartErrorBoundary } from '@/components/charts';
import { useMarketIndex, useMiniChartData } from '@/lib/hooks/use-chart-data';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';
import { useLanguage } from '@/providers/LanguageProvider';
import { translateSector, findTickersByAlias, matchesSearch } from '@/lib/stock-translations';
// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

type SortField = 'short_name' | 'ticker' | 'current_price' | 'change_pct' | 'market_cap';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Mini sparkline wrapper
// ---------------------------------------------------------------------------

function StockSparkline({ ticker }: { ticker: string }) {
  const { data } = useMiniChartData(ticker);
  if (!data || data.length === 0) return null;
  return <MiniSparkline data={data} width={60} height={28} />;
}

// ---------------------------------------------------------------------------
// Sort icon
// ---------------------------------------------------------------------------

function SortIndicator({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) {
    return (
      <svg className="w-3 h-3 text-[var(--text-muted)] opacity-40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
      </svg>
    );
  }
  return dir === 'asc' ? (
    <svg className="w-3 h-3 text-gold" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 15l4-4 4 4" />
    </svg>
  ) : (
    <svg className="w-3 h-3 text-gold" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 9l-4 4-4-4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Format market cap
// ---------------------------------------------------------------------------

function fmtCap(val: number | null): string {
  if (val === null || val === undefined) return '-';
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
  return val.toFixed(0);
}

// ---------------------------------------------------------------------------
// Market overview page
// ---------------------------------------------------------------------------

export default function MarketPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, language } = useLanguage();

  const initialPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const initialSector = searchParams.get('sector') || undefined;

  const [selectedSector, setSelectedSector] = useState<string | undefined>(initialSector);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('market_cap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(initialPage);
  const { data: indexData, loading: indexLoading, source: indexSource } = useMarketIndex();

  const { data: sectors, loading: sectorsLoading, error: sectorsError, refetch: refetchSectors } = useSectors();

  // Expand aliases: if search matches an alias (e.g. "Aramco" -> "2222.SR"),
  // send the matched ticker to the backend for precise results.
  const aliasMatchedTickers = useMemo(() => findTickersByAlias(search), [search]);
  const effectiveSearch = useMemo(() => {
    if (!search) return undefined;
    // If the search matches aliases, use the first matched ticker (without .SR)
    // so the backend LIKE query will match.
    if (aliasMatchedTickers.length > 0) {
      return aliasMatchedTickers[0].replace('.SR', '');
    }
    return search;
  }, [search, aliasMatchedTickers]);

  const { data: entities, loading: entitiesLoading, error: entitiesError, refetch: refetchEntities } = useEntities({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sector: selectedSector,
    search: effectiveSearch,
  });

  const totalCount = entities?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function updateUrl(newPage: number, newSector?: string) {
    const params = new URLSearchParams();
    if (newPage > 1) params.set('page', String(newPage));
    if (newSector) params.set('sector', newSector);
    const qs = params.toString();
    router.replace(`/market${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    updateUrl(newPage, selectedSector);
  }

  function handleSectorChange(sector: string | undefined) {
    setSelectedSector(sector);
    setPage(1);
    updateUrl(1, sector);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'short_name' || field === 'ticker' ? 'asc' : 'desc');
    }
  }

  const sortedItems = useMemo(() => {
    if (!entities?.items) return [];
    // Apply client-side alias filtering when the user typed an alias search.
    // The backend already returned matching items via the expanded ticker search,
    // but if the search was by original text and aliases matched, we further filter.
    let filtered = entities.items;
    if (search && aliasMatchedTickers.length > 0) {
      filtered = entities.items.filter((item) => matchesSearch(item, search));
    }
    return [...filtered].sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;
      if (sortField === 'short_name') {
        aVal = a.short_name || a.ticker;
        bVal = b.short_name || b.ticker;
      } else if (sortField === 'ticker') {
        aVal = a.ticker;
        bVal = b.ticker;
      } else {
        aVal = a[sortField];
        bVal = b[sortField];
      }
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [entities?.items, sortField, sortDir, search, aliasMatchedTickers]);

  const headerCols: { field: SortField; labelAr: string; labelEn: string; align: 'start' | 'end' }[] = [
    { field: 'short_name', labelAr: '\u0627\u0644\u0634\u0631\u0643\u0629', labelEn: 'Company', align: 'start' },
    { field: 'current_price', labelAr: '\u0627\u0644\u0633\u0639\u0631', labelEn: 'Price', align: 'end' },
    { field: 'change_pct', labelAr: '\u0627\u0644\u062A\u063A\u064A\u0631', labelEn: 'Change', align: 'end' },
    { field: 'market_cap', labelAr: '\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u0648\u0642\u064A\u0629', labelEn: 'Market Cap', align: 'end' },
  ];

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-6">

        {/* Header */}
        <div dir={dir}>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {t('\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0633\u0648\u0642', 'Market Overview')}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {t('\u062A\u0635\u0641\u062D \u0642\u0637\u0627\u0639\u0627\u062A \u0648\u0634\u0631\u0643\u0627\u062A \u062A\u0627\u0633\u064A', 'Browse TASI sectors and companies')}
          </p>
        </div>

        {/* TASI Index Chart */}
        <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
          <ChartErrorBoundary fallbackHeight={250}>
            <ChartWrapper title={t('\u0645\u0624\u0634\u0631 \u062A\u0627\u0633\u064A', 'TASI Index')} source={indexSource}>
              <AreaChart data={indexData || []} height={250} loading={indexLoading} title="" />
            </ChartWrapper>
          </ChartErrorBoundary>
          <div className="mt-2 text-end">
            <TradingViewAttribution />
          </div>
        </section>

        {/* Search + Sector Filter Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <svg className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]", language === 'ar' ? 'right-3' : 'left-3')} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('\u0628\u062D\u062B \u0628\u0627\u0644\u0631\u0645\u0632 \u0623\u0648 \u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629...', 'Search by ticker or company name...')}
              dir={dir}
              className={cn(
                'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
                'border border-[#2A2A2A] rounded-xl px-3 py-2.5 text-sm',
                language === 'ar' ? 'pr-10' : 'pl-10',
                'placeholder:text-[var(--text-muted)]',
                'focus:outline-none focus:border-gold transition-colors',
              )}
            />
          </div>

          {/* Sector Dropdown */}
          <div className="sm:w-56">
            <select
              value={selectedSector || ''}
              onChange={(e) => handleSectorChange(e.target.value || undefined)}
              dir={dir}
              className={cn(
                'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
                'border border-[#2A2A2A] rounded-xl px-3 py-2.5 text-sm',
                'focus:outline-none focus:border-gold transition-colors',
                'appearance-none cursor-pointer',
              )}
            >
              <option value="">{t('\u062C\u0645\u064A\u0639 \u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062A', 'All Sectors')}</option>
              {sectors?.map((s) => (
                <option key={s.sector} value={s.sector}>
                  {translateSector(s.sector, language)} ({s.company_count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sector Chips */}
        {sectorsLoading ? (
          <LoadingSpinner message={t('\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062A...', 'Loading sectors...')} />
        ) : sectorsError ? (
          <ErrorDisplay message={sectorsError} onRetry={refetchSectors} />
        ) : sectors && sectors.length > 0 ? (
          <div className="flex flex-wrap gap-2" dir={dir}>
            <button
              onClick={() => handleSectorChange(undefined)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                !selectedSector
                  ? 'bg-gold text-[#0E0E0E]'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[#2A2A2A] hover:border-gold/40'
              )}
            >
              {t('\u0627\u0644\u0643\u0644', 'All')}
            </button>
            {sectors.map((s) => (
              <button
                key={s.sector}
                onClick={() => handleSectorChange(selectedSector === s.sector ? undefined : s.sector)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  selectedSector === s.sector
                    ? 'bg-gold text-[#0E0E0E]'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[#2A2A2A] hover:border-gold/40'
                )}
              >
                {translateSector(s.sector, language)}
                <span className={cn("text-[10px] opacity-70", language === 'ar' ? 'mr-1' : 'ml-1')}>({s.company_count})</span>
              </button>
            ))}
          </div>
        ) : null}

        {/* Companies Table */}
        <section>
          <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
            {selectedSector ? translateSector(selectedSector, language) : t('\u062C\u0645\u064A\u0639 \u0627\u0644\u0634\u0631\u0643\u0627\u062A', 'All Companies')}
            {entities && <span className={cn("text-[var(--text-muted)] font-normal", language === 'ar' ? 'mr-2' : 'ml-2')}>({totalCount})</span>}
          </h2>

          {entitiesLoading ? (
            <LoadingSpinner message={t('\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0634\u0631\u0643\u0627\u062A...', 'Loading companies...')} />
          ) : entitiesError ? (
            <ErrorDisplay message={entitiesError} onRetry={refetchEntities} />
          ) : sortedItems.length > 0 ? (
            <ChartErrorBoundary fallbackHeight={200}>
            <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-input)]">
                      {headerCols.map((col) => (
                        <th
                          key={col.field}
                          onClick={() => toggleSort(col.field)}
                          className={cn(
                            'px-4 py-3 text-xs font-medium text-gold uppercase tracking-wider cursor-pointer select-none',
                            'hover:bg-gold/5 transition-colors',
                            col.align === 'end' ? 'text-end' : 'text-start'
                          )}
                        >
                          <span className="inline-flex items-center gap-1">
                            {language === 'ar' ? col.labelAr : col.labelEn}
                            <SortIndicator field={col.field} current={sortField} dir={sortDir} />
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-end text-xs font-medium text-gold uppercase tracking-wider w-20">
                        {t('\u0627\u0644\u0631\u0633\u0645', 'Chart')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((stock, idx) => (
                      <tr
                        key={stock.ticker}
                        className={cn(
                          'border-t border-[#2A2A2A]/50 hover:bg-[var(--bg-card-hover)] transition-colors',
                          idx % 2 === 1 && 'bg-[#1A1A1A]/30'
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <Link href={`/stock/${encodeURIComponent(stock.ticker)}`} className="block group">
                            <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-gold transition-colors truncate max-w-[200px]">
                              {stock.short_name || stock.ticker}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {stock.ticker}
                              {stock.sector && <span className={language === 'ar' ? 'mr-1' : 'ml-1'}> &middot; {translateSector(stock.sector, language)}</span>}
                            </p>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          <span className="text-sm font-bold text-[var(--text-primary)]">
                            {stock.current_price !== null ? stock.current_price.toFixed(2) : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          {stock.change_pct !== null && stock.change_pct !== undefined ? (
                            <span className={cn(
                              'text-xs font-bold px-2 py-0.5 rounded-full',
                              stock.change_pct >= 0
                                ? 'text-accent-green bg-accent-green/10'
                                : 'text-accent-red bg-accent-red/10'
                            )}>
                              {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          <span className="text-xs text-[var(--text-secondary)]">
                            {stock.market_cap !== null ? `SAR ${fmtCap(stock.market_cap)}` : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          <StockSparkline ticker={stock.ticker} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 py-3 border-t border-[#2A2A2A]" dir={dir}>
                  <button
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-md border transition-colors',
                      page === 1
                        ? 'border-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed opacity-50'
                        : 'border-gold/30 text-gold bg-[var(--bg-card)] hover:bg-gold/10 hover:border-gold/50'
                    )}
                  >
                    {t('\u0627\u0644\u0633\u0627\u0628\u0642', 'Previous')}
                  </button>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">
                    {t(
                      `\u0635\u0641\u062D\u0629 ${page} \u0645\u0646 ${totalPages}`,
                      `Page ${page} of ${totalPages}`
                    )}
                    <span className={cn("text-[var(--text-muted)]", language === 'ar' ? 'mr-1' : 'ml-1')}>
                      ({totalCount} {t('\u0634\u0631\u0643\u0629', 'companies')})
                    </span>
                  </span>
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-md border transition-colors',
                      page >= totalPages
                        ? 'border-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed opacity-50'
                        : 'border-gold/30 text-gold bg-[var(--bg-card)] hover:bg-gold/10 hover:border-gold/50'
                    )}
                  >
                    {t('\u0627\u0644\u062A\u0627\u0644\u064A', 'Next')}
                  </button>
                </div>
              )}
            </div>
            </ChartErrorBoundary>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--text-muted)]" dir={dir}>
                {t('\u0644\u0627 \u062A\u0648\u062C\u062F \u0634\u0631\u0643\u0627\u062A \u0645\u0637\u0627\u0628\u0642\u0629', 'No matching companies found')}
              </p>
            </div>
          )}
        </section>

        {/* AI Chat CTA */}
        <section>
          <Link
            href="/chat"
            className={cn(
              'block p-5 rounded-xl text-center',
              'bg-gradient-to-r from-gold/10 via-gold/5 to-gold/10',
              'border border-gold/20',
              'hover:from-gold/15 hover:via-gold/10 hover:to-gold/15',
              'hover:border-gold/40',
              'transition-all duration-300'
            )}
          >
            <p className="text-sm font-bold gold-text" dir={dir}>
              {t('\u062A\u0631\u064A\u062F \u062A\u062D\u0644\u064A\u0644 \u0623\u0639\u0645\u0642\u061F', 'Want deeper analysis?')}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1" dir={dir}>
              {t('\u0627\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0630\u0643\u064A\u0629 \u0644\u0644\u0627\u0633\u062A\u0639\u0644\u0627\u0645 \u0639\u0646 \u0623\u064A \u0634\u0631\u0643\u0629 \u0623\u0648 \u0642\u0637\u0627\u0639 \u0623\u0648 \u0645\u0624\u0634\u0631', 'Use AI chat to ask about any company, sector, or index')}
            </p>
          </Link>
        </section>

      </div>
    </div>
  );
}
