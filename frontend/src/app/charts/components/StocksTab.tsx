'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useEntities } from '@/lib/hooks/use-api';
import { TASIIndexChart } from '@/components/charts';
import { getTASIStockName } from '@/lib/tradingview-utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { getRecentSearches, addRecentSearch } from './types';
import { PopularStocks } from './PopularStocks';
import { RecentSearches } from './RecentSearches';
import { StockChartPanel } from './StockChartPanel';

// ---------------------------------------------------------------------------
// Search result item (local to this tab)
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
        <span className="text-sm text-[var(--text-primary)] ms-2">
          {name || ticker}
        </span>
        {sector && (
          <span className="text-xs text-[var(--text-muted)] ms-2">{sector}</span>
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
// StocksTab
// ---------------------------------------------------------------------------

interface StocksTabProps {
  selectedTicker: string | null;
  onSelectTicker: (ticker: string | null) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onAddToCompare: (ticker: string) => void;
  compareTickers: string[];
}

function StocksTabInner({
  selectedTicker,
  onSelectTicker,
  isFullscreen: _isFullscreen,
  onToggleFullscreen,
  onAddToCompare,
  compareTickers,
}: StocksTabProps) {
  void _isFullscreen;
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<{ ticker: string; name: string }[]>([]);
  const [animateKey, setAnimateKey] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const { data: searchResults } = useEntities({
    limit: 10,
    search: search.length >= 2 ? search : undefined,
  });

  const handleSelect = useCallback((ticker: string, name?: string) => {
    onSelectTicker(ticker);
    setSearch('');
    setSearchFocused(false);
    setHighlightedIndex(-1);
    setAnimateKey((k) => k + 1);
    const displayName = name || getTASIStockName(ticker);
    addRecentSearch(ticker, displayName);
    setRecentSearches(getRecentSearches());
  }, [onSelectTicker]);

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

  return (
    <div className="space-y-5 animate-tab-in">
      {/* Search + Quick picks */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <div className="relative">
            <svg
              className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
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
                'border gold-border rounded-md ps-9 pe-3 py-2.5 text-sm',
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
                'max-h-64 overflow-y-auto animate-slide-down',
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
            <RecentSearches
              recentSearches={recentSearches}
              onSelect={(ticker, name) => handleSelect(ticker, name)}
            />
          )}
        </div>

        {/* Quick pick chips */}
        <PopularStocks
          selectedTicker={selectedTicker}
          onSelect={(ticker, name) => handleSelect(ticker, name)}
        />
      </div>

      {/* Chart area */}
      {selectedTicker ? (
        <section
          key={animateKey}
          className="bg-[var(--bg-card)] border gold-border rounded-md p-4 animate-chart-section-in"
        >
          <StockChartPanel
            ticker={selectedTicker}
            isFullscreen={false}
            onToggleFullscreen={onToggleFullscreen}
            onAddToCompare={onAddToCompare}
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
          <TASIIndexChart height={typeof window !== 'undefined' ? (window.innerWidth < 640 ? 280 : window.innerWidth < 1024 ? 350 : 550) : 550} />

          {/* Hint */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gold/[0.04] border border-gold/[0.08]">
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
  );
}

export const StocksTab = React.memo(StocksTabInner);
