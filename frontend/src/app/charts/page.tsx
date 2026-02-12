'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { useEntities } from '@/lib/hooks/use-api';
import { TASIIndexChart, StockOHLCVChart } from '@/components/charts';
import { getTASIStockName } from '@/lib/tradingview-utils';
import { useStockDetail } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { translateSector } from '@/lib/stock-translations';

// Dynamic imports for new chart components (no SSR)
const StockComparisonChart = dynamic(
  () => import('@/components/charts/StockComparisonChart'),
  { ssr: false, loading: () => <div className="h-[500px] rounded-xl dark:bg-[#1A1A1A] bg-gray-100 animate-pulse" /> },
);

const PreBuiltCharts = dynamic(
  () => import('@/components/charts/PreBuiltCharts'),
  { ssr: false, loading: () => <div className="h-[400px] rounded-xl dark:bg-[#1A1A1A] bg-gray-100 animate-pulse" /> },
);

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'stocks' | 'compare' | 'analytics';

const TABS: { id: TabId; labelAr: string; labelEn: string }[] = [
  { id: 'stocks', labelAr: 'الأسهم', labelEn: 'Stocks' },
  { id: 'compare', labelAr: 'المقارنة', labelEn: 'Compare' },
  { id: 'analytics', labelAr: 'تحليلات السوق', labelEn: 'Market Analytics' },
];

// ---------------------------------------------------------------------------
// Popular TASI stocks for quick selection
// ---------------------------------------------------------------------------

const POPULAR_STOCKS = [
  { ticker: '2222', name: 'Aramco' },
  { ticker: '1120', name: 'Al Rajhi' },
  { ticker: '2010', name: 'SABIC' },
  { ticker: '7010', name: 'STC' },
  { ticker: '1180', name: 'SNB' },
  { ticker: '2350', name: 'Saudi Kayan' },
  { ticker: '1010', name: 'RIBL' },
  { ticker: '2280', name: 'Almarai' },
  { ticker: '4030', name: 'BAJ' },
  { ticker: '7020', name: 'ETIHAD' },
];

// ---------------------------------------------------------------------------
// Recent searches helpers (localStorage)
// ---------------------------------------------------------------------------

const RECENT_KEY = 'rad-ai-charts-recent';
const MAX_RECENT = 5;

// Migrate old key name
if (typeof window !== 'undefined') {
  const oldVal = localStorage.getItem('raid-charts-recent');
  if (oldVal && !localStorage.getItem('rad-ai-charts-recent')) {
    localStorage.setItem('rad-ai-charts-recent', oldVal);
    localStorage.removeItem('raid-charts-recent');
  }
}

function getRecentSearches(): { ticker: string; name: string }[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(ticker: string, name: string) {
  if (typeof window === 'undefined') return;
  try {
    const prev = getRecentSearches().filter((r) => r.ticker !== ticker);
    const next = [{ ticker, name }, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Stock chart panel (must be a component so hooks work)
// ---------------------------------------------------------------------------

function StockChartPanel({
  ticker,
  isFullscreen,
  onToggleFullscreen,
  onAddToCompare,
  compareDisabled,
}: {
  ticker: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onAddToCompare?: (ticker: string) => void;
  compareDisabled?: boolean;
}) {
  const { t, language } = useLanguage();
  const { data: detail } = useStockDetail(ticker);

  const priceChange =
    detail?.current_price != null && detail?.previous_close != null
      ? detail.current_price - detail.previous_close
      : null;
  const priceChangePct =
    priceChange != null && detail?.previous_close != null && detail.previous_close > 0
      ? (priceChange / detail.previous_close) * 100
      : null;
  const isUp = priceChange !== null && priceChange >= 0;

  const displayName = detail?.short_name || getTASIStockName(ticker);

  return (
    <div className="space-y-4">
      {/* Stock header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            {displayName}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {ticker}
            {detail?.sector && <> &middot; {translateSector(detail.sector, language)}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            {detail?.current_price != null && (
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {detail.current_price.toFixed(2)}{' '}
                <span className="text-sm text-[var(--text-muted)]">SAR</span>
              </p>
            )}
            {priceChange !== null && (
              <p
                className={cn(
                  'text-base font-medium',
                  isUp ? 'text-accent-green' : 'text-accent-red',
                )}
              >
                {isUp ? '+' : ''}
                {priceChange.toFixed(2)} ({priceChangePct?.toFixed(2)}%)
              </p>
            )}
          </div>
          {/* Add to comparison button */}
          {onAddToCompare && (
            <button
              onClick={() => onAddToCompare(ticker)}
              disabled={compareDisabled}
              className={cn(
                'px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                compareDisabled
                  ? 'bg-[#2A2A2A] text-[#505050] cursor-not-allowed'
                  : 'bg-gold/10 border border-gold/30 text-gold hover:bg-gold/20',
              )}
              title={compareDisabled ? t('موجود بالفعل في المقارنة أو تم بلوغ الحد', 'Already in comparison or limit reached') : t('إضافة للمقارنة', 'Add to comparison')}
            >
              + {t('مقارنة', 'Compare')}
            </button>
          )}
          {/* Fullscreen toggle */}
          <button
            onClick={onToggleFullscreen}
            className="p-2 rounded-md transition-colors hover:bg-[var(--bg-card-hover)]"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Stock OHLCV Candlestick Chart */}
      <StockOHLCVChart
        ticker={ticker}
        stockName={displayName}
        height={isFullscreen ? Math.max(window.innerHeight - 180, 400) : 550}
      />

      {/* Footer */}
      {!isFullscreen && (
        <div className="flex items-center justify-end text-xs">
          <Link
            href={`/stock/${encodeURIComponent(ticker)}`}
            className="text-gold hover:text-gold-light transition-colors font-medium"
          >
            {t('عرض التفاصيل الكاملة', 'View full details')} &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search result item
// ---------------------------------------------------------------------------

function SearchResultItem({
  ticker,
  name,
  sector,
  price,
  isHighlighted,
  onSelect,
}: {
  ticker: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  isHighlighted: boolean;
  onSelect: (ticker: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(ticker)}
      className={cn(
        'w-full flex items-center justify-between',
        'px-3 py-2 text-start',
        'transition-colors',
        'border-b border-[var(--bg-input)]',
        isHighlighted
          ? 'bg-[rgba(212,168,75,0.1)]'
          : 'hover:bg-[var(--bg-card-hover)]',
      )}
    >
      <div>
        <span className="text-sm font-medium text-gold">{ticker}</span>
        <span className="text-sm text-[var(--text-primary)] ml-2">
          {name || ticker}
        </span>
        {sector && (
          <span className="text-xs text-[var(--text-muted)] ml-2">{sector}</span>
        )}
      </div>
      {price != null && (
        <span className="text-sm text-[var(--text-secondary)]">
          {price.toFixed(2)}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Comparison ticker selector
// ---------------------------------------------------------------------------

function CompareTickerSelector({
  selectedTickers,
  onAdd,
  onRemove,
}: {
  selectedTickers: string[];
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);

  const { data: searchResults } = useEntities({
    limit: 8,
    search: search.length >= 2 ? search : undefined,
  });

  const items = searchResults?.items;
  const showDropdown = focused && search.length >= 2 && items && items.length > 0;

  return (
    <div className="space-y-3">
      {/* Selected ticker chips */}
      {selectedTickers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTickers.map((t, i) => {
            const colors = ['#D4A84B', '#2196F3', '#4CAF50', '#F44336', '#9C27B0'];
            return (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: `${colors[i % colors.length]}20`,
                  border: `1px solid ${colors[i % colors.length]}60`,
                  color: colors[i % colors.length],
                }}
              >
                {t}
                <button
                  onClick={() => onRemove(t)}
                  className="hover:opacity-70 transition-opacity ml-0.5"
                  aria-label={`Remove ${t}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search input */}
      {selectedTickers.length < 5 && (
        <div className="relative">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              placeholder={t(`أضف سهم للمقارنة (${selectedTickers.length}/5)...`, `Add stock to compare (${selectedTickers.length}/5)...`)}
              className={cn(
                'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
                'border gold-border rounded-md pl-9 pr-3 py-2.5 text-sm',
                'placeholder:text-[var(--text-muted)]',
                'focus:outline-none focus:border-gold transition-colors',
              )}
            />
          </div>

          {showDropdown && (
            <div
              className={cn(
                'absolute z-20 w-full mt-1',
                'bg-[var(--bg-card)] border gold-border rounded-md',
                'shadow-lg shadow-black/40 overflow-hidden',
                'max-h-48 overflow-y-auto',
              )}
            >
              {items
                .filter((s) => !selectedTickers.includes(s.ticker))
                .map((stock) => (
                  <button
                    key={stock.ticker}
                    onClick={() => {
                      onAdd(stock.ticker);
                      setSearch('');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-start hover:bg-[var(--bg-card-hover)] transition-colors border-b border-[var(--bg-input)]"
                  >
                    <div>
                      <span className="text-sm font-medium text-gold">{stock.ticker}</span>
                      <span className="text-sm text-[var(--text-primary)] ml-2">
                        {stock.short_name || stock.ticker}
                      </span>
                    </div>
                    {stock.current_price != null && (
                      <span className="text-sm text-[var(--text-secondary)]">
                        {stock.current_price.toFixed(2)}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Quick picks for comparison */}
      {selectedTickers.length < 5 && (
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_STOCKS.filter((s) => !selectedTickers.includes(s.ticker))
            .slice(0, 6)
            .map((stock) => (
              <button
                key={stock.ticker}
                onClick={() => onAdd(stock.ticker)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-medium',
                  'border transition-all duration-200',
                  'bg-[var(--bg-input)] border-[var(--bg-input)] text-[var(--text-secondary)]',
                  'hover:border-gold/40 hover:text-gold',
                )}
              >
                + {stock.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Charts page
// ---------------------------------------------------------------------------

export default function ChartsPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>('stocks');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<{ ticker: string; name: string }[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [animateKey, setAnimateKey] = useState(0);

  // Comparison tickers
  const [compareTickers, setCompareTickers] = useState<string[]>([]);

  // Read URL params on mount (e.g. /charts?ticker=2222)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tickerParam = params.get('ticker');
    if (tickerParam) {
      setSelectedTicker(tickerParam);
      setActiveTab('stocks');
    }
  }, []);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const { data: searchResults } = useEntities({
    limit: 10,
    search: search.length >= 2 ? search : undefined,
  });

  const handleSelect = useCallback((ticker: string, name?: string) => {
    setSelectedTicker(ticker);
    setSearch('');
    setSearchFocused(false);
    setHighlightedIndex(-1);
    setAnimateKey((k) => k + 1);
    const displayName = name || getTASIStockName(ticker);
    addRecentSearch(ticker, displayName);
    setRecentSearches(getRecentSearches());
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Add to comparison handler
  const handleAddToCompare = useCallback((ticker: string) => {
    setCompareTickers((prev) => {
      if (prev.includes(ticker) || prev.length >= 5) return prev;
      return [...prev, ticker];
    });
  }, []);

  const handleRemoveFromCompare = useCallback((ticker: string) => {
    setCompareTickers((prev) => prev.filter((t) => t !== ticker));
  }, []);

  // Escape key exits fullscreen
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const items = searchResults?.items;
  const showDropdown = searchFocused && search.length >= 2 && items && items.length > 0;

  // Keyboard navigation in search dropdown
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || !items) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < items.length) {
        e.preventDefault();
        const item = items[highlightedIndex];
        handleSelect(item.ticker, item.short_name ?? undefined);
      }
    },
    [showDropdown, items, highlightedIndex, handleSelect],
  );

  // Reset highlight when search text changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  // Show recent searches dropdown when focused and no search text
  const showRecents = searchFocused && search.length < 2 && recentSearches.length > 0;

  // Fullscreen layout
  if (isFullscreen && selectedTicker) {
    return (
      <div
        className="fixed inset-0 z-50 dark:bg-[#0E0E0E] bg-white overflow-auto"
        style={{ animation: 'chart-fullscreen-in 0.3s ease-out' }}
      >
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <StockChartPanel
            ticker={selectedTicker}
            isFullscreen={true}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
        <style>{`
          @keyframes chart-fullscreen-in {
            from { opacity: 0; transform: scale(0.98); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('الرسوم البيانية', 'Charts')}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {t('رسوم بيانية تفاعلية لأسهم تاسي', 'Interactive charts for TASI stocks')}
          </p>
        </div>

        {/* Tab bar */}
        <div
          className="flex items-center gap-0 rounded-lg overflow-hidden dark:bg-[#2A2A2A] bg-gray-100"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative px-5 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-gold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              <span className="relative z-10">{t(tab.labelAr, tab.labelEn)}</span>
              {/* Active indicator */}
              {activeTab === tab.id && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ background: '#D4A84B' }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ============================================================= */}
        {/* STOCKS TAB */}
        {/* ============================================================= */}
        {activeTab === 'stocks' && (
          <div className="space-y-5" style={{ animation: 'tab-in 0.25s ease-out' }}>
            {/* Search + Quick picks */}
            <div className="space-y-3">
              {/* Search bar */}
              <div className="relative">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={t('البحث بالرمز أو اسم الشركة...', 'Search by ticker or company name...')}
                    className={cn(
                      'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
                      'border gold-border rounded-md pl-9 pr-3 py-2.5 text-sm',
                      'placeholder:text-[var(--text-muted)]',
                      'focus:outline-none focus:border-gold transition-colors',
                    )}
                  />
                </div>

                {/* Search results dropdown */}
                {showDropdown && (
                  <div
                    className={cn(
                      'absolute z-20 w-full mt-1',
                      'bg-[var(--bg-card)] border gold-border rounded-md',
                      'shadow-lg shadow-black/40 overflow-hidden',
                      'max-h-64 overflow-y-auto',
                    )}
                  >
                    {items.map((stock, idx) => (
                      <SearchResultItem
                        key={stock.ticker}
                        ticker={stock.ticker}
                        name={stock.short_name}
                        sector={stock.sector}
                        price={stock.current_price}
                        isHighlighted={idx === highlightedIndex}
                        onSelect={(t) => handleSelect(t, stock.short_name ?? undefined)}
                      />
                    ))}
                  </div>
                )}

                {/* Recent searches dropdown */}
                {showRecents && (
                  <div
                    className={cn(
                      'absolute z-20 w-full mt-1',
                      'bg-[var(--bg-card)] border gold-border rounded-md',
                      'shadow-lg shadow-black/40 overflow-hidden',
                    )}
                  >
                    <div className="px-3 py-1.5 text-xs text-[var(--text-muted)] border-b border-[var(--bg-input)]">
                      {t('عمليات البحث الأخيرة', 'Recent searches')}
                    </div>
                    {recentSearches.map((r) => (
                      <button
                        key={r.ticker}
                        onClick={() => handleSelect(r.ticker, r.name)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-[var(--bg-card-hover)] transition-colors border-b border-[var(--bg-input)] last:border-0"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-[var(--text-muted)] shrink-0"
                        >
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                        <span className="text-sm font-medium text-gold">{r.ticker}</span>
                        <span className="text-sm text-[var(--text-secondary)]">{r.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick pick chips */}
              <div className="flex flex-wrap gap-2">
                {POPULAR_STOCKS.map((stock) => (
                  <button
                    key={stock.ticker}
                    onClick={() => handleSelect(stock.ticker, stock.name)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium',
                      'border transition-all duration-200',
                      selectedTicker === stock.ticker
                        ? 'bg-gold/20 border-gold text-gold'
                        : 'bg-[var(--bg-input)] border-[var(--bg-input)] text-[var(--text-secondary)] hover:border-gold/40 hover:text-gold',
                    )}
                  >
                    {stock.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart area */}
            {selectedTicker ? (
              <section
                key={animateKey}
                className="bg-[var(--bg-card)] border gold-border rounded-md p-4"
                style={{ animation: 'chart-section-in 0.35s ease-out' }}
              >
                <StockChartPanel
                  ticker={selectedTicker}
                  isFullscreen={false}
                  onToggleFullscreen={toggleFullscreen}
                  onAddToCompare={handleAddToCompare}
                  compareDisabled={compareTickers.includes(selectedTicker) || compareTickers.length >= 5}
                />
              </section>
            ) : (
              /* Default: TASI Index + welcome empty state */
              <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4 space-y-3">
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">{t('مؤشر تاسي', 'TASI Index')}</h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('مؤشر السوق الرئيسي - تداول السعودية', 'Tadawul All Share Index - Saudi Stock Exchange')}
                  </p>
                </div>

                {/* TASI Candlestick Chart (lightweight-charts) */}
                <TASIIndexChart height={550} />

                {/* Hint */}
                <div
                  className="flex items-center gap-3 p-3 rounded-lg"
                  style={{
                    background: 'rgba(212, 168, 75, 0.04)',
                    border: '1px solid rgba(212, 168, 75, 0.08)',
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#D4A84B"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {t(
                      'ابحث عن سهم أعلاه أو اختر من الأسهم الشائعة لعرض الرسم البياني التفصيلي مع بيانات OHLCV.',
                      'Search for a stock above or choose from popular stocks to view its detailed candlestick chart with OHLCV data.'
                    )}
                  </p>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* COMPARE TAB */}
        {/* ============================================================= */}
        {activeTab === 'compare' && (
          <div className="space-y-5" style={{ animation: 'tab-in 0.25s ease-out' }}>
            {/* Ticker selector */}
            <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4 space-y-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {t('مقارنة الأسهم', 'Stock Comparison')}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {t('قارن أداء الأسعار لما يصل إلى 5 أسهم (تطبيع إلى أساس 100)', 'Compare price performance of up to 5 stocks (normalized to base 100)')}
                </p>
              </div>
              <CompareTickerSelector
                selectedTickers={compareTickers}
                onAdd={handleAddToCompare}
                onRemove={handleRemoveFromCompare}
              />
            </section>

            {/* Comparison chart */}
            <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4">
              <StockComparisonChart tickers={compareTickers} height={500} />
            </section>
          </div>
        )}

        {/* ============================================================= */}
        {/* MARKET ANALYTICS TAB */}
        {/* ============================================================= */}
        {activeTab === 'analytics' && (
          <div className="space-y-5" style={{ animation: 'tab-in 0.25s ease-out' }}>
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {t('تحليلات السوق', 'Market Analytics')}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {t('بيانات تحليلية مباشرة من سوق تداول', 'Live analytical data from Tadawul market')}
                </p>
              </div>
              <PreBuiltCharts />
            </section>
          </div>
        )}

        {/* AI Chat CTA */}
        <section>
          <Link
            href="/chat"
            className={cn(
              'block p-4 rounded-md text-center',
              'bg-gold/5 border border-gold/20',
              'hover:bg-gold/10 hover:border-gold/40',
              'transition-all duration-300',
            )}
          >
            <p className="text-sm font-bold gold-text">{t('تحتاج تحليل أعمق؟', 'Need deeper analysis?')}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {t('اسأل رعد AI لتحليل أي سهم أو قطاع أو مقياس مالي', 'Ask Ra\u2019d AI to analyze any stock, sector, or financial metric')}
            </p>
          </Link>
        </section>
      </div>

      <style>{`
        @keyframes chart-section-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes chart-fullscreen-in {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes tab-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
