'use client';

import { cn } from '@/lib/utils';
import { useStockDetail } from '@/lib/hooks/use-api';
import { TASIChart } from '@/components/charts/TASIChart';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(val: number | null | undefined, opts?: { decimals?: number; prefix?: string; suffix?: string }): string {
  if (val === null || val === undefined) return '-';
  const { decimals = 2, prefix = '', suffix = '' } = opts || {};
  if (Math.abs(val) >= 1e9) return `${prefix}${(val / 1e9).toFixed(1)}B${suffix}`;
  if (Math.abs(val) >= 1e6) return `${prefix}${(val / 1e6).toFixed(1)}M${suffix}`;
  return `${prefix}${val.toFixed(decimals)}${suffix}`;
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  return `${(val * 100).toFixed(2)}%`;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--bg-input)] rounded-md px-3 py-2.5">
      <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className="text-sm font-bold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StockDetailClientProps {
  ticker: string;
}

export function StockDetailClient({ ticker }: StockDetailClientProps) {
  const { data: detail, loading, error, refetch } = useStockDetail(ticker);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message={`Loading ${ticker}...`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <ErrorDisplay message={error} onRetry={refetch} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--text-primary)] mb-2">{ticker}</p>
          <p className="text-sm text-[var(--text-muted)]">
            Stock data not available. The API endpoint may not be configured yet.
          </p>
        </div>
      </div>
    );
  }

  const priceChange = detail.current_price != null && detail.previous_close != null
    ? detail.current_price - detail.previous_close
    : null;
  const priceChangePct = priceChange != null && detail.previous_close != null && detail.previous_close > 0
    ? (priceChange / detail.previous_close) * 100
    : null;
  const isUp = priceChange !== null && priceChange >= 0;

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Company Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">{detail.short_name || ticker}</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {ticker}
              {detail.sector && <> &middot; {detail.sector}</>}
              {detail.industry && <> &middot; {detail.industry}</>}
            </p>
          </div>
          <div className="text-end">
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {detail.current_price?.toFixed(2) || '-'}{' '}
              <span className="text-sm text-[var(--text-muted)]">{detail.currency || 'SAR'}</span>
            </p>
            {priceChange !== null && (
              <p className={cn('text-sm font-medium', isUp ? 'text-accent-green' : 'text-accent-red')}>
                {isUp ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePct?.toFixed(2)}%)
              </p>
            )}
          </div>
        </div>

        {/* Chart */}
        <TASIChart ticker={ticker} height={400} />

        {/* Key Metrics Grid */}
        <section>
          <h2 className="text-sm font-bold text-gold mb-2 uppercase tracking-wider">Key Metrics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <MetricCard label="Market Cap" value={formatNumber(detail.market_cap, { prefix: 'SAR ' })} />
            <MetricCard label="Volume" value={formatNumber(detail.volume, { decimals: 0 })} />
            <MetricCard label="52W High" value={detail.week_52_high?.toFixed(2) || '-'} />
            <MetricCard label="52W Low" value={detail.week_52_low?.toFixed(2) || '-'} />
            <MetricCard label="Beta" value={detail.beta?.toFixed(2) || '-'} />
            <MetricCard
              label="Day Range"
              value={`${detail.day_low?.toFixed(2) || '-'} - ${detail.day_high?.toFixed(2) || '-'}`}
            />
          </div>
        </section>

        {/* Valuation */}
        <section>
          <h2 className="text-sm font-bold text-gold mb-2 uppercase tracking-wider">Valuation</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <MetricCard label="Trailing P/E" value={detail.trailing_pe?.toFixed(2) || '-'} />
            <MetricCard label="Forward P/E" value={detail.forward_pe?.toFixed(2) || '-'} />
            <MetricCard label="P/B" value={detail.price_to_book?.toFixed(2) || '-'} />
            <MetricCard label="Trailing EPS" value={detail.trailing_eps?.toFixed(2) || '-'} />
          </div>
        </section>

        {/* Profitability */}
        <section>
          <h2 className="text-sm font-bold text-gold mb-2 uppercase tracking-wider">Profitability</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <MetricCard label="ROE" value={formatPct(detail.roe)} />
            <MetricCard label="Profit Margin" value={formatPct(detail.profit_margin)} />
            <MetricCard label="Revenue Growth" value={formatPct(detail.revenue_growth)} />
          </div>
        </section>

        {/* Analyst Data */}
        {detail.recommendation && (
          <section>
            <h2 className="text-sm font-bold text-gold mb-2 uppercase tracking-wider">Analyst Consensus</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              <MetricCard label="Recommendation" value={detail.recommendation.toUpperCase()} />
              <MetricCard label="Target (Mean)" value={detail.target_mean_price?.toFixed(2) || '-'} />
              <MetricCard label="Analysts" value={String(detail.analyst_count || '-')} />
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
