'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { useEntities } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { POPULAR_STOCKS } from './types';

const StockComparisonChart = dynamic(
  () => import('@/components/charts/StockComparisonChart'),
  { ssr: false, loading: () => <div className="h-[500px] rounded-xl dark:bg-[#1A1A1A] bg-gray-100 animate-pulse" /> },
);

// ---------------------------------------------------------------------------
// Comparison ticker selector (local to this tab)
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

  const CHIP_COLORS = ['#D4A84B', '#2196F3', '#4CAF50', '#F44336', '#9C27B0'];

  return (
    <div className="space-y-3">
      {/* Selected ticker chips */}
      {selectedTickers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTickers.map((ticker, i) => {
            const color = CHIP_COLORS[i % CHIP_COLORS.length];
            return (
              <span
                key={ticker}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: `${color}20`,
                  border: `1px solid ${color}60`,
                  color: color,
                }}
              >
                {ticker}
                <button
                  onClick={() => onRemove(ticker)}
                  className="hover:opacity-70 transition-opacity ms-0.5"
                  aria-label={`Remove ${ticker}`}
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
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              placeholder={t(`أضف سهم للمقارنة (${selectedTickers.length}/5)...`, `Add stock to compare (${selectedTickers.length}/5)...`)}
              className={cn(
                'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
                'border gold-border rounded-md ps-9 pe-3 py-2.5 text-sm',
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
                'max-h-48 overflow-y-auto animate-slide-down',
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
                      <span className="text-sm text-[var(--text-primary)] ms-2">
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
                  'px-2.5 py-1 rounded-full text-[14.5px] font-medium',
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
// CompareTab
// ---------------------------------------------------------------------------

interface CompareTabProps {
  compareTickers: string[];
  onAddToCompare: (ticker: string) => void;
  onRemoveFromCompare: (ticker: string) => void;
}

function CompareTabInner({ compareTickers, onAddToCompare, onRemoveFromCompare }: CompareTabProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-5 animate-tab-in">
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
          onAdd={onAddToCompare}
          onRemove={onRemoveFromCompare}
        />
      </section>

      {/* Comparison chart */}
      <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4">
        <StockComparisonChart tickers={compareTickers} height={typeof window !== 'undefined' ? (window.innerWidth < 640 ? 280 : window.innerWidth < 1024 ? 350 : 500) : 500} />
      </section>
    </div>
  );
}

export const CompareTab = React.memo(CompareTabInner);
