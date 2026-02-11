'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useStockDetail } from '@/lib/hooks/use-api';
import { CandlestickChart, ChartWrapper, TradingViewAttribution, ChartErrorBoundary } from '@/components/charts';
import { useOHLCVData } from '@/lib/hooks/use-chart-data';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';

// ---------------------------------------------------------------------------
// Watchlist localStorage helper
// ---------------------------------------------------------------------------

const WATCHLIST_KEY = 'raid-watchlist-tickers';

function getWatchlistTickers(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function setWatchlistTickers(tickers: string[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(tickers));
}

// ---------------------------------------------------------------------------
// Toast feedback component
// ---------------------------------------------------------------------------

function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-gold text-dark-bg text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300" dir="rtl">
      {message}
    </div>
  );
}

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

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' }) {
  return (
    <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className={cn(
        'text-sm font-bold',
        accent === 'green' ? 'text-accent-green' : accent === 'red' ? 'text-accent-red' : 'text-[var(--text-primary)]'
      )}>
        {value}
      </p>
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
  const { data: ohlcvData, loading: chartLoading, source: chartSource } = useOHLCVData(ticker);

  // Watchlist state
  const [inWatchlist, setInWatchlist] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    setInWatchlist(getWatchlistTickers().includes(ticker));
  }, [ticker]);

  const toggleWatchlist = useCallback(() => {
    const current = getWatchlistTickers();
    let msg: string;
    if (current.includes(ticker)) {
      setWatchlistTickers(current.filter((t) => t !== ticker));
      setInWatchlist(false);
      msg = '\u062A\u0645\u062A \u0627\u0644\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0645\u0641\u0636\u0644\u0629';
    } else {
      setWatchlistTickers([...current, ticker]);
      setInWatchlist(true);
      msg = '\u062A\u0645\u062A \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0644\u0644\u0645\u0641\u0636\u0644\u0629';
    }
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, [ticker]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message={`${ticker} \u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644...`} />
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
          <p className="text-sm text-[var(--text-muted)]" dir="rtl">
            {'\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u0647\u0645 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629'}
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
      <div className="max-w-content-lg mx-auto space-y-5">

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]" dir="rtl">
          <Link href="/" className="hover:text-gold transition-colors">
            الرئيسية
          </Link>
          <span className="text-[var(--text-muted)]">&gt;</span>
          <Link href="/market" className="hover:text-gold transition-colors">
            السوق
          </Link>
          {detail.sector && (
            <>
              <span className="text-[var(--text-muted)]">&gt;</span>
              <Link
                href={`/market?sector=${encodeURIComponent(detail.sector)}`}
                className="hover:text-gold transition-colors"
              >
                {detail.sector}
              </Link>
            </>
          )}
          <span className="text-[var(--text-muted)]">&gt;</span>
          <span className="text-gold font-medium">{ticker}</span>
        </nav>

        {/* Company Header */}
        <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              {/* Watchlist Star */}
              <button
                onClick={toggleWatchlist}
                className="mt-1 text-2xl transition-colors hover:scale-110 active:scale-95"
                aria-label={inWatchlist ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                title={inWatchlist ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
              >
                {inWatchlist ? (
                  <span className="text-gold">&#9733;</span>
                ) : (
                  <span className="text-[var(--text-muted)] hover:text-gold">&#9734;</span>
                )}
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
                  {detail.short_name || ticker}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs bg-gold/10 text-gold px-2 py-0.5 rounded-full font-medium">{ticker}</span>
                  {detail.sector && (
                    <Link
                      href={`/market?sector=${encodeURIComponent(detail.sector)}`}
                      className="text-xs bg-[var(--bg-input)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full hover:text-gold transition-colors"
                    >
                      {detail.sector}
                    </Link>
                  )}
                  {detail.industry && (
                    <span className="text-xs bg-[var(--bg-input)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">{detail.industry}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-end">
              <p className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                {detail.current_price?.toFixed(2) || '-'}
                <span className="text-sm text-[var(--text-muted)] mr-1">{detail.currency || 'SAR'}</span>
              </p>
              {priceChange !== null && (
                <p className={cn('text-sm font-bold mt-0.5', isUp ? 'text-accent-green' : 'text-accent-red')}>
                  {isUp ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePct?.toFixed(2)}%)
                  <span className="text-[10px] mr-1">{isUp ? '\u25B2' : '\u25BC'}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Price Summary Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label={'\u0627\u0644\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0633\u0627\u0628\u0642'} value={detail.previous_close?.toFixed(2) || '-'} />
          <MetricCard
            label={'\u0646\u0637\u0627\u0642 \u0627\u0644\u064A\u0648\u0645'}
            value={`${detail.day_low?.toFixed(2) || '-'} - ${detail.day_high?.toFixed(2) || '-'}`}
          />
          <MetricCard
            label={'\u0646\u0637\u0627\u0642 52 \u0623\u0633\u0628\u0648\u0639'}
            value={`${detail.week_52_low?.toFixed(2) || '-'} - ${detail.week_52_high?.toFixed(2) || '-'}`}
          />
          <MetricCard label={'\u062D\u062C\u0645 \u0627\u0644\u062A\u062F\u0627\u0648\u0644'} value={formatNumber(detail.volume, { decimals: 0 })} />
        </div>

        {/* Chart */}
        <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
          <ChartErrorBoundary fallbackHeight={400}>
            <ChartWrapper title={'\u0627\u0644\u0631\u0633\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A'} source={chartSource}>
              <CandlestickChart data={ohlcvData || []} height={400} ticker={ticker} loading={chartLoading} />
            </ChartWrapper>
          </ChartErrorBoundary>
          <div className="flex items-center justify-between -mt-1">
            <Link
              href={`/charts?ticker=${encodeURIComponent(ticker)}`}
              className="text-xs text-gold hover:text-gold-light transition-colors font-medium"
              dir="rtl"
            >
              عرض الرسم البياني الكامل
            </Link>
            <TradingViewAttribution />
          </div>
        </section>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Key Metrics */}
          <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
            <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir="rtl">
              {'\u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629'}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label={'\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u0648\u0642\u064A\u0629'} value={formatNumber(detail.market_cap, { prefix: 'SAR ' })} />
              <MetricCard label="Beta" value={detail.beta?.toFixed(2) || '-'} />
              <MetricCard label="P/E (\u0645\u062A\u0623\u062E\u0631)" value={detail.trailing_pe?.toFixed(2) || '-'} />
              <MetricCard label="P/E (\u0645\u062A\u0648\u0642\u0639)" value={detail.forward_pe?.toFixed(2) || '-'} />
              <MetricCard label="P/B" value={detail.price_to_book?.toFixed(2) || '-'} />
              <MetricCard label="EPS" value={detail.trailing_eps?.toFixed(2) || '-'} />
            </div>
          </section>

          {/* Profitability */}
          <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
            <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir="rtl">
              {'\u0627\u0644\u0631\u0628\u062D\u064A\u0629'}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label={'\u0627\u0644\u0639\u0627\u0626\u062F \u0639\u0644\u0649 \u0627\u0644\u0645\u0644\u0643\u064A\u0629'}
                value={formatPct(detail.roe)}
                accent={detail.roe !== null && detail.roe !== undefined ? (detail.roe >= 0 ? 'green' : 'red') : undefined}
              />
              <MetricCard
                label={'\u0647\u0627\u0645\u0634 \u0627\u0644\u0631\u0628\u062D'}
                value={formatPct(detail.profit_margin)}
                accent={detail.profit_margin !== null && detail.profit_margin !== undefined ? (detail.profit_margin >= 0 ? 'green' : 'red') : undefined}
              />
              <MetricCard
                label={'\u0646\u0645\u0648 \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A'}
                value={formatPct(detail.revenue_growth)}
                accent={detail.revenue_growth !== null && detail.revenue_growth !== undefined ? (detail.revenue_growth >= 0 ? 'green' : 'red') : undefined}
              />
            </div>
          </section>

        </div>

        {/* Analyst Data */}
        {detail.recommendation && (
          <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
            <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir="rtl">
              {'\u0625\u062C\u0645\u0627\u0639 \u0627\u0644\u0645\u062D\u0644\u0644\u064A\u0646'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-[var(--text-muted)] mb-1">{'\u0627\u0644\u062A\u0648\u0635\u064A\u0629'}</p>
                <p className={cn(
                  'text-sm font-bold uppercase',
                  detail.recommendation.toLowerCase().includes('buy') ? 'text-accent-green'
                    : detail.recommendation.toLowerCase().includes('sell') ? 'text-accent-red'
                    : 'text-gold'
                )}>
                  {detail.recommendation.toUpperCase()}
                </p>
              </div>
              <MetricCard label={'\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641'} value={detail.target_mean_price?.toFixed(2) || '-'} />
              <MetricCard label={'\u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0644\u0644\u064A\u0646'} value={String(detail.analyst_count || '-')} />
            </div>
          </section>
        )}

        {/* AI Chat CTA - pre-filled with ticker */}
        <Link
          href={`/chat?q=${encodeURIComponent(`حلل سهم ${ticker}`)}`}
          className={cn(
            'block p-5 rounded-xl text-center',
            'bg-gradient-to-r from-gold/10 via-gold/5 to-gold/10',
            'border border-gold/20',
            'hover:from-gold/15 hover:via-gold/10 hover:to-gold/15',
            'hover:border-gold/40',
            'transition-all duration-300'
          )}
        >
          <p className="text-sm font-bold gold-text" dir="rtl">
            {'\u0627\u0633\u0623\u0644 \u0639\u0646'} {detail.short_name || ticker}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1" dir="rtl">
            {'\u0627\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0630\u0643\u064A\u0629 \u0644\u0644\u062D\u0635\u0648\u0644 \u0639\u0644\u0649 \u062A\u062D\u0644\u064A\u0644 \u0645\u0641\u0635\u0644'}
          </p>
        </Link>

      </div>
      <Toast message={toastMsg} visible={toastVisible} />
    </div>
  );
}
