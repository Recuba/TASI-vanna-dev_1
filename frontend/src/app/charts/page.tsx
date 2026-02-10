'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useEntities } from '@/lib/hooks/use-api';
import {
  CandlestickChart,
  AreaChart,
  ChartWrapper,
  TradingViewAttribution,
  ChartErrorBoundary,
} from '@/components/charts';
import { useOHLCVData, useMarketIndex } from '@/lib/hooks/use-chart-data';
import { useStockDetail } from '@/lib/hooks/use-api';

// ---------------------------------------------------------------------------
// Popular TASI stocks for quick selection
// ---------------------------------------------------------------------------

const POPULAR_STOCKS = [
  { ticker: '2222', name: 'Aramco' },
  { ticker: '1120', name: 'Al Rajhi' },
  { ticker: '2010', name: 'SABIC' },
  { ticker: '7010', name: 'STC' },
  { ticker: '1180', name: 'Al Inma' },
  { ticker: '2350', name: 'Saudi Kayan' },
  { ticker: '1010', name: 'RIBL' },
  { ticker: '2280', name: 'Almarai' },
  { ticker: '4030', name: 'BAJ' },
  { ticker: '7020', name: 'ETIHAD' },
];

// ---------------------------------------------------------------------------
// Stock chart panel (must be a component so hooks work)
// ---------------------------------------------------------------------------

function StockChartPanel({ ticker }: { ticker: string }) {
  const {
    data: ohlcvData,
    loading: chartLoading,
    error: chartError,
    source: chartSource,
    refetch: chartRefetch,
  } = useOHLCVData(ticker);
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

  return (
    <div className="space-y-3">
      {/* Stock header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {detail?.short_name || ticker}
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            {ticker}
            {detail?.sector && <> &middot; {detail.sector}</>}
          </p>
        </div>
        <div className="text-end">
          {detail?.current_price != null && (
            <p className="text-xl font-bold text-[var(--text-primary)]">
              {detail.current_price.toFixed(2)}{' '}
              <span className="text-xs text-[var(--text-muted)]">SAR</span>
            </p>
          )}
          {priceChange !== null && (
            <p
              className={cn(
                'text-sm font-medium',
                isUp ? 'text-accent-green' : 'text-accent-red',
              )}
            >
              {isUp ? '+' : ''}
              {priceChange.toFixed(2)} ({priceChangePct?.toFixed(2)}%)
            </p>
          )}
        </div>
      </div>

      {/* Chart */}
      <ChartErrorBoundary fallbackHeight={500}>
        <ChartWrapper title="Price Chart" source={chartSource}>
          <CandlestickChart
            data={ohlcvData || []}
            height={500}
            ticker={ticker}
            loading={chartLoading}
            error={chartError}
            refetch={chartRefetch}
          />
        </ChartWrapper>
      </ChartErrorBoundary>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <TradingViewAttribution />
        <Link
          href={`/stock/${encodeURIComponent(ticker)}`}
          className="text-xs text-gold hover:text-gold-light transition-colors"
        >
          View full details &rarr;
        </Link>
      </div>
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
  onSelect,
}: {
  ticker: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  onSelect: (ticker: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(ticker)}
      className={cn(
        'w-full flex items-center justify-between',
        'px-3 py-2 text-start',
        'hover:bg-[var(--bg-card-hover)] transition-colors',
        'border-b border-[var(--bg-input)]',
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
// Main Charts page
// ---------------------------------------------------------------------------

export default function ChartsPage() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const {
    data: indexData,
    loading: indexLoading,
    source: indexSource,
  } = useMarketIndex();

  const { data: searchResults } = useEntities({
    limit: 10,
    search: search.length >= 2 ? search : undefined,
  });

  const handleSelect = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    setSearch('');
    setSearchFocused(false);
  }, []);

  const showDropdown =
    searchFocused && search.length >= 2 && searchResults?.items && searchResults.items.length > 0;

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Charts</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Interactive TradingView charts for TASI stocks
          </p>
        </div>

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
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                placeholder="Search by ticker or company name..."
                className={cn(
                  'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
                  'border gold-border rounded-md pl-9 pr-3 py-2.5 text-sm',
                  'placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-gold transition-colors',
                )}
              />
            </div>

            {/* Search dropdown */}
            {showDropdown && (
              <div
                className={cn(
                  'absolute z-20 w-full mt-1',
                  'bg-[var(--bg-card)] border gold-border rounded-md',
                  'shadow-lg shadow-black/40 overflow-hidden',
                  'max-h-64 overflow-y-auto',
                )}
              >
                {searchResults.items.map((stock) => (
                  <SearchResultItem
                    key={stock.ticker}
                    ticker={stock.ticker}
                    name={stock.short_name}
                    sector={stock.sector}
                    price={stock.current_price}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Quick pick chips */}
          <div className="flex flex-wrap gap-2">
            {POPULAR_STOCKS.map((stock) => (
              <button
                key={stock.ticker}
                onClick={() => handleSelect(stock.ticker)}
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
          <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4">
            <StockChartPanel ticker={selectedTicker} />
          </section>
        ) : (
          /* Default: TASI Index */
          <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4">
            <ChartErrorBoundary fallbackHeight={400}>
              <ChartWrapper title="TASI Index" source={indexSource}>
                <AreaChart
                  data={indexData || []}
                  height={400}
                  loading={indexLoading}
                  title=""
                />
              </ChartWrapper>
            </ChartErrorBoundary>
            <div className="mt-2 text-end">
              <TradingViewAttribution />
            </div>
            <p className="text-xs text-[var(--text-muted)] text-center mt-3">
              Select a stock above to view its detailed candlestick chart
            </p>
          </section>
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
            <p className="text-sm font-bold gold-text">Need deeper analysis?</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Ask Ra&apos;d AI to analyze any stock, sector, or financial metric
            </p>
          </Link>
        </section>
      </div>
    </div>
  );
}
