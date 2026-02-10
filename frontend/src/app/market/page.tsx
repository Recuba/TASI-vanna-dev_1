'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useSectors, useEntities } from '@/lib/hooks/use-api';
import { AreaChart, MiniSparkline, ChartWrapper, TradingViewAttribution, ChartErrorBoundary } from '@/components/charts';
import { useMarketIndex, useMiniChartData } from '@/lib/hooks/use-chart-data';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';

// ---------------------------------------------------------------------------
// Mini sparkline wrapper -- hooks cannot be called inside a map callback
// ---------------------------------------------------------------------------

function StockSparkline({ ticker }: { ticker: string }) {
  const { data } = useMiniChartData(ticker);
  if (!data || data.length === 0) return null;
  return <MiniSparkline data={data} width={60} height={28} />;
}

// ---------------------------------------------------------------------------
// Market overview page - fetches real data from /api/entities and /api/entities/sectors
// ---------------------------------------------------------------------------

export default function MarketPage() {
  const [selectedSector, setSelectedSector] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const { data: indexData, loading: indexLoading, source: indexSource } = useMarketIndex();

  const { data: sectors, loading: sectorsLoading, error: sectorsError, refetch: refetchSectors } = useSectors();
  const { data: entities, loading: entitiesLoading, error: entitiesError, refetch: refetchEntities } = useEntities({
    limit: 50,
    sector: selectedSector,
    search: search || undefined,
  });

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Market Overview</h1>
          <p className="text-sm text-[var(--text-muted)]">Browse TASI sectors and companies</p>
        </div>

        {/* TASI Index Chart */}
        <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4">
          <ChartErrorBoundary fallbackHeight={250}>
            <ChartWrapper title="TASI Index" source={indexSource}>
              <AreaChart data={indexData || []} height={250} loading={indexLoading} title="" />
            </ChartWrapper>
          </ChartErrorBoundary>
          <div className="mt-2 text-end">
            <TradingViewAttribution />
          </div>
        </section>

        {/* Search */}
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ticker or company name..."
            className={cn(
              'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
              'border gold-border rounded-md px-3 py-2 text-sm',
              'placeholder:text-[var(--text-muted)]',
              'focus:outline-none focus:border-gold transition-colors',
            )}
          />
        </div>

        {/* Sector Table */}
        <section>
          <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider">Sectors</h2>
          {sectorsLoading ? (
            <LoadingSpinner message="Loading sectors..." />
          ) : sectorsError ? (
            <ErrorDisplay message={sectorsError} onRetry={refetchSectors} />
          ) : sectors && sectors.length > 0 ? (
            <div className="bg-[var(--bg-card)] border gold-border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-input)]">
                      <th className="px-3 py-2 text-start text-xs font-medium text-gold uppercase tracking-wider">Sector</th>
                      <th className="px-3 py-2 text-end text-xs font-medium text-gold uppercase tracking-wider">Companies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectors.map((s) => (
                      <tr
                        key={s.sector}
                        onClick={() => setSelectedSector(selectedSector === s.sector ? undefined : s.sector)}
                        className={cn(
                          'border-t border-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer',
                          selectedSector === s.sector && 'bg-gold/5',
                        )}
                      >
                        <td className="px-3 py-2 text-[var(--text-primary)] font-medium">{s.sector}</td>
                        <td className="px-3 py-2 text-end text-[var(--text-secondary)]">{s.company_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No sector data available.</p>
          )}
        </section>

        {/* Companies List */}
        <section>
          <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider">
            {selectedSector ? `Companies - ${selectedSector}` : 'All Companies'}
          </h2>
          {entitiesLoading ? (
            <LoadingSpinner message="Loading companies..." />
          ) : entitiesError ? (
            <ErrorDisplay message={entitiesError} onRetry={refetchEntities} />
          ) : entities && entities.items.length > 0 ? (
            <ChartErrorBoundary fallbackHeight={200}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {entities.items.map((stock) => (
                <Link
                  key={stock.ticker}
                  href={`/stock/${encodeURIComponent(stock.ticker)}`}
                  className={cn(
                    'block p-3 rounded-md',
                    'bg-[var(--bg-card)] border gold-border',
                    'hover:border-gold hover:bg-[var(--bg-card-hover)]',
                    'transition-all duration-300 group'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gold font-medium group-hover:text-gold-light">{stock.ticker}</p>
                    {stock.change_pct !== null && stock.change_pct !== undefined && (
                      <p className={cn('text-xs font-medium', stock.change_pct >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                        {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{stock.short_name || stock.ticker}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{stock.sector || '-'}</p>
                  <div className="my-1.5">
                    <StockSparkline ticker={stock.ticker} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-[var(--text-secondary)]">
                      {stock.current_price !== null ? stock.current_price.toFixed(2) : '-'}
                    </p>
                    {stock.market_cap !== null && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {stock.market_cap >= 1e9
                          ? `SAR ${(stock.market_cap / 1e9).toFixed(1)}B`
                          : stock.market_cap >= 1e6
                            ? `SAR ${(stock.market_cap / 1e6).toFixed(0)}M`
                            : `SAR ${stock.market_cap.toFixed(0)}`}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            </ChartErrorBoundary>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No companies found.</p>
          )}
        </section>

        {/* AI Chat CTA */}
        <section>
          <Link
            href="/chat"
            className={cn(
              'block p-4 rounded-md text-center',
              'bg-gold/5 border border-gold/20',
              'hover:bg-gold/10 hover:border-gold/40',
              'transition-all duration-300'
            )}
          >
            <p className="text-sm font-bold gold-text">Want deeper analysis?</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Use AI Chat to query any company, sector, or metric with natural language
            </p>
          </Link>
        </section>

      </div>
    </div>
  );
}
