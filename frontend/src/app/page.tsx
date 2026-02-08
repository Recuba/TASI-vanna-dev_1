'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useSectors, useMarketData } from '@/lib/hooks/use-api';
import { MiniSparkline } from '@/components/charts';
import { useMiniChartData } from '@/lib/hooks/use-chart-data';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';

// ---------------------------------------------------------------------------
// Static quick-action cards (never change)
// ---------------------------------------------------------------------------

const quickActions = [
  {
    title: 'AI Chat',
    description: 'Ask questions about Saudi stocks in natural language',
    href: '/chat',
    icon: '\u{1F4AC}',
  },
  {
    title: 'Market Overview',
    description: 'Browse all TASI-listed companies and sectors',
    href: '/market',
    icon: '\u{1F4C8}',
  },
  {
    title: 'News Feed',
    description: 'Latest market news and announcements',
    href: '/news',
    icon: '\u{1F4F0}',
  },
  {
    title: 'Reports',
    description: 'Technical analysis and research reports',
    href: '/reports',
    icon: '\u{1F4CB}',
  },
];

// Sector display colors by index
const sectorColors = [
  'bg-gold', 'bg-accent-blue', 'bg-accent-green', 'bg-accent-warning',
  'bg-accent-red', 'bg-gold-dark', 'bg-accent-blue', 'bg-accent-green',
  'bg-accent-warning', 'bg-accent-red', 'bg-gold',
];

// ---------------------------------------------------------------------------
// Mini sparkline wrapper -- hooks cannot be called inside a map callback
// ---------------------------------------------------------------------------

function StockSparkline({ ticker }: { ticker: string }) {
  const { data } = useMiniChartData(ticker);
  if (!data || data.length === 0) return null;
  return <MiniSparkline data={data} width={60} height={28} />;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const { data: sectors, loading: sectorsLoading, error: sectorsError, refetch: refetchSectors } = useSectors();
  const { data: topMovers, loading: moversLoading, error: moversError, refetch: refetchMovers } = useMarketData({ limit: 5 });

  const totalCompanies = sectors ? sectors.reduce((sum, s) => sum + s.company_count, 0) : null;

  const marketStats = [
    { label: 'Companies', value: totalCompanies ? `~${totalCompanies}` : '~500', icon: '\u{1F4CA}' },
    { label: 'Data Tables', value: '10', icon: '\u{1F5C3}' },
    { label: 'Exchange', value: 'TASI', icon: '\u{1F3E6}' },
    { label: 'AI Engine', value: 'Claude', icon: '\u26A1' },
  ];

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-6">

        {/* Hero */}
        <section className="text-center py-6 animate-fade-in-up">
          <h2 className="text-2xl sm:text-[28px] xl:text-[32px] font-bold leading-tight mb-2 gold-text">
            Saudi Stock Market AI Analyst
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-lg mx-auto">
            AI-powered financial intelligence for TASI-listed companies.
            Charts, data analysis, and natural language queries.
          </p>
        </section>

        {/* Market Stats */}
        <div className="flex justify-center gap-3 flex-wrap animate-fade-in-up-delay-1">
          {marketStats.map((stat, i) => (
            <div
              key={i}
              className={cn(
                'inline-flex items-center gap-1.5',
                'bg-[var(--bg-card)] border gold-border gold-border-hover',
                'rounded-pill px-4 py-1.5',
                'text-[13px] font-medium text-[var(--text-secondary)]',
                'transition-all duration-300'
              )}
            >
              <span className="text-sm">{stat.icon}</span>
              <span className="text-gold font-bold">{stat.value}</span>
              {stat.label}
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <section className="animate-fade-in-up-delay-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={cn(
                  'block p-4 rounded-md',
                  'bg-[var(--bg-card)] border gold-border',
                  'hover:border-gold hover:bg-[var(--bg-card-hover)]',
                  'transition-all duration-300',
                  'group'
                )}
              >
                <span className="text-2xl mb-2 block">{action.icon}</span>
                <h3 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-gold transition-colors">
                  {action.title}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">{action.description}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Two-column: Sectors + Top Movers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-up-delay-3">

          {/* Sector Cards */}
          <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4">
            <h3 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider">Sectors</h3>
            {sectorsLoading ? (
              <LoadingSpinner message="Loading sectors..." />
            ) : sectorsError ? (
              <ErrorDisplay message={sectorsError} onRetry={refetchSectors} />
            ) : sectors && sectors.length > 0 ? (
              <div className="space-y-2">
                {sectors.map((sector, i) => (
                  <div key={sector.sector} className="flex items-center gap-3">
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', sectorColors[i % sectorColors.length])} />
                    <span className="text-sm text-[var(--text-secondary)] flex-1">{sector.sector}</span>
                    <span className="text-xs font-medium text-[var(--text-muted)]">{sector.company_count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No sector data available.</p>
            )}
          </section>

          {/* Top Movers */}
          <section className="bg-[var(--bg-card)] border gold-border rounded-md p-4">
            <h3 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider">Top by Market Cap</h3>
            {moversLoading ? (
              <LoadingSpinner message="Loading stocks..." />
            ) : moversError ? (
              <ErrorDisplay message={moversError} onRetry={refetchMovers} />
            ) : topMovers && topMovers.items.length > 0 ? (
              <div className="space-y-2">
                {topMovers.items.map((stock) => (
                  <Link
                    key={stock.ticker}
                    href={`/stock/${encodeURIComponent(stock.ticker)}`}
                    className="flex items-center gap-3 py-1.5 hover:bg-[var(--bg-card-hover)] rounded-md px-2 -mx-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {stock.short_name || stock.ticker}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{stock.ticker}</p>
                    </div>
                    <div className="flex-shrink-0 mx-2">
                      <StockSparkline ticker={stock.ticker} />
                    </div>
                    <div className="text-end flex-shrink-0">
                      <p className="text-sm font-bold text-[var(--text-primary)]">
                        {stock.current_price?.toFixed(2) ?? '-'}
                      </p>
                      {stock.change_pct !== null && stock.change_pct !== undefined && (
                        <p className={cn('text-xs font-medium', stock.change_pct >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                          {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No market data available.</p>
            )}
          </section>

        </div>

        {/* AI Chat Quick Access */}
        <section className="animate-fade-in-up-delay-3">
          <Link
            href="/chat"
            className={cn(
              'block p-6 rounded-md text-center',
              'bg-gold/5 border border-gold/20',
              'hover:bg-gold/10 hover:border-gold/40',
              'transition-all duration-300'
            )}
          >
            <p className="text-lg font-bold gold-text mb-1">Start AI Chat</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Ask anything about Saudi stocks, financials, and market data
            </p>
          </Link>
        </section>

      </div>
    </div>
  );
}
