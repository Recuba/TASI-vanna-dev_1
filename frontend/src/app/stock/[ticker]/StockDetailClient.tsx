'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useStockDetail, useStockFinancials } from '@/lib/hooks/use-api';
import { CandlestickChart, ChartWrapper, TradingViewAttribution, ChartErrorBoundary } from '@/components/charts';
import { useOHLCVData } from '@/lib/hooks/use-chart-data';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';
import { useLanguage } from '@/providers/LanguageProvider';
import { translateSector } from '@/lib/stock-translations';

// ---------------------------------------------------------------------------
// Watchlist localStorage helper
// ---------------------------------------------------------------------------

const WATCHLIST_KEY = 'rad-ai-watchlist-tickers';

// Migrate old key name
if (typeof window !== 'undefined') {
  const oldVal = localStorage.getItem('raid-watchlist-tickers');
  if (oldVal && !localStorage.getItem('rad-ai-watchlist-tickers')) {
    localStorage.setItem('rad-ai-watchlist-tickers', oldVal);
    localStorage.removeItem('raid-watchlist-tickers');
  }
}

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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-gold text-dark-bg text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
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
// Financial Statements Section
// ---------------------------------------------------------------------------

type StatementTab = 'income_statement' | 'balance_sheet' | 'cash_flow';

const STATEMENT_TABS: { id: StatementTab; labelAr: string; labelEn: string }[] = [
  { id: 'income_statement', labelAr: '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062F\u062E\u0644', labelEn: 'Income Statement' },
  { id: 'balance_sheet', labelAr: '\u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629', labelEn: 'Balance Sheet' },
  { id: 'cash_flow', labelAr: '\u0627\u0644\u062A\u062F\u0641\u0642\u0627\u062A \u0627\u0644\u0646\u0642\u062F\u064A\u0629', labelEn: 'Cash Flow' },
];

/** Human-readable labels for common financial data keys */
const FIELD_LABELS: Record<string, { ar: string; en: string }> = {
  total_revenue: { ar: '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A', en: 'Total Revenue' },
  cost_of_revenue: { ar: '\u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A', en: 'Cost of Revenue' },
  gross_profit: { ar: '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0631\u0628\u062D', en: 'Gross Profit' },
  operating_income: { ar: '\u0627\u0644\u062F\u062E\u0644 \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A', en: 'Operating Income' },
  net_income: { ar: '\u0635\u0627\u0641\u064A \u0627\u0644\u062F\u062E\u0644', en: 'Net Income' },
  ebitda: { ar: 'EBITDA', en: 'EBITDA' },
  total_assets: { ar: '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0623\u0635\u0648\u0644', en: 'Total Assets' },
  total_liabilities: { ar: '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0627\u0644\u062A\u0632\u0627\u0645\u0627\u062A', en: 'Total Liabilities' },
  total_equity: { ar: '\u0625\u062C\u0645\u0627\u0644\u064A \u062D\u0642\u0648\u0642 \u0627\u0644\u0645\u0644\u0643\u064A\u0629', en: 'Total Equity' },
  total_debt: { ar: '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u062F\u064A\u0648\u0646', en: 'Total Debt' },
  total_current_assets: { ar: '\u0627\u0644\u0623\u0635\u0648\u0644 \u0627\u0644\u0645\u062A\u062F\u0627\u0648\u0644\u0629', en: 'Current Assets' },
  total_current_liabilities: { ar: '\u0627\u0644\u0627\u0644\u062A\u0632\u0627\u0645\u0627\u062A \u0627\u0644\u0645\u062A\u062F\u0627\u0648\u0644\u0629', en: 'Current Liabilities' },
  cash_and_equivalents: { ar: '\u0627\u0644\u0646\u0642\u062F \u0648\u0645\u0627 \u064A\u0639\u0627\u062F\u0644\u0647', en: 'Cash & Equivalents' },
  retained_earnings: { ar: '\u0627\u0644\u0623\u0631\u0628\u0627\u062D \u0627\u0644\u0645\u0628\u0642\u0627\u0629', en: 'Retained Earnings' },
  operating_cash_flow: { ar: '\u0627\u0644\u062A\u062F\u0641\u0642 \u0627\u0644\u0646\u0642\u062F\u064A \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A', en: 'Operating Cash Flow' },
  investing_cash_flow: { ar: '\u0627\u0644\u062A\u062F\u0641\u0642 \u0627\u0644\u0646\u0642\u062F\u064A \u0627\u0644\u0627\u0633\u062A\u062B\u0645\u0627\u0631\u064A', en: 'Investing Cash Flow' },
  financing_cash_flow: { ar: '\u0627\u0644\u062A\u062F\u0641\u0642 \u0627\u0644\u0646\u0642\u062F\u064A \u0627\u0644\u062A\u0645\u0648\u064A\u0644\u064A', en: 'Financing Cash Flow' },
  free_cash_flow: { ar: '\u0627\u0644\u062A\u062F\u0641\u0642 \u0627\u0644\u0646\u0642\u062F\u064A \u0627\u0644\u062D\u0631', en: 'Free Cash Flow' },
  capital_expenditure: { ar: '\u0627\u0644\u0625\u0646\u0641\u0627\u0642 \u0627\u0644\u0631\u0623\u0633\u0645\u0627\u0644\u064A', en: 'Capital Expenditure' },
  depreciation_and_amortization: { ar: '\u0627\u0644\u0627\u0633\u062A\u0647\u0644\u0627\u0643 \u0648\u0627\u0644\u0625\u0637\u0641\u0627\u0621', en: 'Depreciation & Amortization' },
  change_in_working_capital: { ar: '\u0627\u0644\u062A\u063A\u064A\u0631 \u0641\u064A \u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644 \u0627\u0644\u0639\u0627\u0645\u0644', en: 'Change in Working Capital' },
  interest_expense: { ar: '\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0627\u0644\u0641\u0648\u0627\u0626\u062F', en: 'Interest Expense' },
  tax_provision: { ar: '\u0645\u062E\u0635\u0635 \u0627\u0644\u0636\u0631\u0627\u0626\u0628', en: 'Tax Provision' },
  basic_eps: { ar: '\u0631\u0628\u062D\u064A\u0629 \u0627\u0644\u0633\u0647\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629', en: 'Basic EPS' },
  diluted_eps: { ar: '\u0631\u0628\u062D\u064A\u0629 \u0627\u0644\u0633\u0647\u0645 \u0627\u0644\u0645\u062E\u0641\u0636\u0629', en: 'Diluted EPS' },
  operating_expense: { ar: '\u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A\u0629', en: 'Operating Expenses' },
  research_and_development: { ar: '\u0627\u0644\u0628\u062D\u062B \u0648\u0627\u0644\u062A\u0637\u0648\u064A\u0631', en: 'Research & Development' },
};

function getFieldLabel(key: string, lang: string): string {
  const label = FIELD_LABELS[key];
  if (label) return lang === 'ar' ? label.ar : label.en;
  // Fallback: convert snake_case to Title Case
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function FinancialStatementsSection({ ticker, language, t }: {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}) {
  const [activeStatement, setActiveStatement] = useState<StatementTab>('income_statement');
  const { data: financials, loading: financialsLoading } = useStockFinancials(ticker, activeStatement, 'annual');

  const periods = financials?.periods ?? [];

  // Get all data keys from all periods (preserving order from first period)
  const dataKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const period of periods) {
    for (const key of Object.keys(period.data)) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        dataKeys.push(key);
      }
    }
  }

  // Don't render the section if there's no data after loading
  if (!financialsLoading && periods.length === 0) return null;

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
      <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
        {t('\u0627\u0644\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u0627\u0644\u064A\u0629', 'Financial Statements')}
      </h2>

      {/* Statement type tabs */}
      <div className="flex gap-1 mb-4 bg-[var(--bg-input)] rounded-lg p-1 overflow-x-auto">
        {STATEMENT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveStatement(tab.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all',
              activeStatement === tab.id
                ? 'bg-gold/20 text-gold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {language === 'ar' ? tab.labelAr : tab.labelEn}
          </button>
        ))}
      </div>

      {financialsLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner message={t('\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644...', 'Loading...')} />
        </div>
      ) : periods.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-6" dir={dir}>
          {t('\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0627\u0644\u064A\u0629 \u0645\u062A\u0627\u062D\u0629', 'No financial data available')}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-[#2A2A2A]">
                <th className="text-start px-2 py-2 text-xs font-medium text-[var(--text-muted)] sticky left-0 bg-[var(--bg-card)] min-w-[160px]">
                  {t('\u0627\u0644\u0628\u0646\u062F', 'Item')}
                </th>
                {periods.map((p) => (
                  <th key={p.period_index} className="text-end px-2 py-2 text-xs font-medium text-[var(--text-muted)] min-w-[100px]">
                    {p.period_date || `P${p.period_index}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataKeys.map((key) => (
                <tr key={key} className="border-b border-[#2A2A2A]/30 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <td className="px-2 py-1.5 text-xs text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-card)]">
                    {getFieldLabel(key, language)}
                  </td>
                  {periods.map((p) => {
                    const val = p.data[key];
                    return (
                      <td key={p.period_index} className="text-end px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono">
                        {val !== null && val !== undefined
                          ? formatNumber(Number(val))
                          : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Normalize a Saudi stock ticker: if the input is purely numeric
 * (e.g. "2222"), append ".SR" so the API lookup matches the database
 * format ("2222.SR"). Tickers that already include a suffix are
 * returned as-is.
 */
function normalizeTicker(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}.SR`;
  }
  return trimmed;
}

interface StockDetailClientProps {
  ticker: string;
}

export function StockDetailClient({ ticker: rawTicker }: StockDetailClientProps) {
  const ticker = normalizeTicker(rawTicker);
  const { data: detail, loading, error, refetch } = useStockDetail(ticker);
  const { data: ohlcvData, loading: chartLoading, source: chartSource } = useOHLCVData(ticker);
  const { t, language } = useLanguage();

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
      setWatchlistTickers(current.filter((tk) => tk !== ticker));
      setInWatchlist(false);
      msg = t('\u062A\u0645\u062A \u0627\u0644\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0645\u0641\u0636\u0644\u0629', 'Removed from watchlist');
    } else {
      setWatchlistTickers([...current, ticker]);
      setInWatchlist(true);
      msg = t('\u062A\u0645\u062A \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0644\u0644\u0645\u0641\u0636\u0644\u0629', 'Added to watchlist');
    }
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, [ticker, t]);

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message={t(`${ticker} \u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644...`, `Loading ${ticker}...`)} />
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
          <p className="text-sm text-[var(--text-muted)]" dir={dir}>
            {t('\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u0647\u0645 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629', 'Stock data not available')}
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
        <nav className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] flex-wrap" dir={dir}>
          <Link href="/" className="hover:text-gold transition-colors">
            {t('\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629', 'Home')}
          </Link>
          <span className="text-[var(--text-muted)]">&gt;</span>
          <Link href="/market" className="hover:text-gold transition-colors">
            {t('\u0627\u0644\u0633\u0648\u0642', 'Market')}
          </Link>
          {detail.sector && (
            <>
              <span className="text-[var(--text-muted)]">&gt;</span>
              <Link
                href={`/market?sector=${encodeURIComponent(detail.sector)}`}
                className="hover:text-gold transition-colors"
              >
                {translateSector(detail.sector, language)}
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
                aria-label={inWatchlist ? t('\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0645\u0641\u0636\u0644\u0629', 'Remove from watchlist') : t('\u0625\u0636\u0627\u0641\u0629 \u0644\u0644\u0645\u0641\u0636\u0644\u0629', 'Add to watchlist')}
                title={inWatchlist ? t('\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0645\u0641\u0636\u0644\u0629', 'Remove from watchlist') : t('\u0625\u0636\u0627\u0641\u0629 \u0644\u0644\u0645\u0641\u0636\u0644\u0629', 'Add to watchlist')}
              >
                {inWatchlist ? (
                  <span className="text-gold">&#9733;</span>
                ) : (
                  <span className="text-[var(--text-muted)] hover:text-gold">&#9734;</span>
                )}
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] break-words">
                  {detail.short_name || ticker}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs bg-gold/10 text-gold px-2 py-0.5 rounded-full font-medium">{ticker}</span>
                  {detail.sector && (
                    <Link
                      href={`/market?sector=${encodeURIComponent(detail.sector)}`}
                      className="text-xs bg-[var(--bg-input)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full hover:text-gold transition-colors"
                    >
                      {translateSector(detail.sector, language)}
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
                <span className="text-sm text-[var(--text-muted)] ms-1">{detail.currency || 'SAR'}</span>
              </p>
              {priceChange !== null && (
                <p className={cn('text-sm font-bold mt-0.5', isUp ? 'text-accent-green' : 'text-accent-red')}>
                  {isUp ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePct?.toFixed(2)}%)
                  <span className="text-[10px] ms-1">{isUp ? '\u25B2' : '\u25BC'}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Price Summary Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label={t('\u0627\u0644\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0633\u0627\u0628\u0642', 'Previous Close')} value={detail.previous_close?.toFixed(2) || '-'} />
          <MetricCard
            label={t('\u0646\u0637\u0627\u0642 \u0627\u0644\u064A\u0648\u0645', 'Day Range')}
            value={`${detail.day_low?.toFixed(2) || '-'} - ${detail.day_high?.toFixed(2) || '-'}`}
          />
          <MetricCard
            label={t('\u0646\u0637\u0627\u0642 52 \u0623\u0633\u0628\u0648\u0639', '52-Week Range')}
            value={`${detail.week_52_low?.toFixed(2) || '-'} - ${detail.week_52_high?.toFixed(2) || '-'}`}
          />
          <MetricCard label={t('\u062D\u062C\u0645 \u0627\u0644\u062A\u062F\u0627\u0648\u0644', 'Volume')} value={formatNumber(detail.volume, { decimals: 0 })} />
        </div>

        {/* Chart */}
        <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
          <ChartErrorBoundary fallbackHeight={400}>
            <ChartWrapper title={t('\u0627\u0644\u0631\u0633\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A', 'Price Chart')} source={chartSource}>
              <CandlestickChart data={ohlcvData || []} height={400} ticker={ticker} loading={chartLoading} />
            </ChartWrapper>
          </ChartErrorBoundary>
          <div className="flex items-center justify-between -mt-1">
            <Link
              href={`/charts?ticker=${encodeURIComponent(ticker)}`}
              className="text-xs text-gold hover:text-gold-light transition-colors font-medium"
              dir={dir}
            >
              {t('\u0639\u0631\u0636 \u0627\u0644\u0631\u0633\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A \u0627\u0644\u0643\u0627\u0645\u0644', 'View full chart')}
            </Link>
            <TradingViewAttribution />
          </div>
        </section>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Key Metrics */}
          <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
            <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
              {t('\u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629', 'Key Metrics')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label={t('\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u0648\u0642\u064A\u0629', 'Market Cap')} value={formatNumber(detail.market_cap, { prefix: 'SAR ' })} />
              <MetricCard label="Beta" value={detail.beta?.toFixed(2) || '-'} />
              <MetricCard label={t('P/E (\u0645\u062A\u0623\u062E\u0631)', 'P/E (Trailing)')} value={detail.trailing_pe?.toFixed(2) || '-'} />
              <MetricCard label={t('P/E (\u0645\u062A\u0648\u0642\u0639)', 'P/E (Forward)')} value={detail.forward_pe?.toFixed(2) || '-'} />
              <MetricCard label="P/B" value={detail.price_to_book?.toFixed(2) || '-'} />
              <MetricCard label="EPS" value={detail.trailing_eps?.toFixed(2) || '-'} />
            </div>
          </section>

          {/* Profitability */}
          <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
            <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
              {t('\u0627\u0644\u0631\u0628\u062D\u064A\u0629', 'Profitability')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label={t('\u0627\u0644\u0639\u0627\u0626\u062F \u0639\u0644\u0649 \u0627\u0644\u0645\u0644\u0643\u064A\u0629', 'Return on Equity')}
                value={formatPct(detail.roe)}
                accent={detail.roe !== null && detail.roe !== undefined ? (detail.roe >= 0 ? 'green' : 'red') : undefined}
              />
              <MetricCard
                label={t('\u0647\u0627\u0645\u0634 \u0627\u0644\u0631\u0628\u062D', 'Profit Margin')}
                value={formatPct(detail.profit_margin)}
                accent={detail.profit_margin !== null && detail.profit_margin !== undefined ? (detail.profit_margin >= 0 ? 'green' : 'red') : undefined}
              />
              <MetricCard
                label={t('\u0646\u0645\u0648 \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A', 'Revenue Growth')}
                value={formatPct(detail.revenue_growth)}
                accent={detail.revenue_growth !== null && detail.revenue_growth !== undefined ? (detail.revenue_growth >= 0 ? 'green' : 'red') : undefined}
              />
            </div>
          </section>

        </div>

        {/* Analyst Data */}
        {detail.recommendation && (
          <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
            <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
              {t('\u0625\u062C\u0645\u0627\u0639 \u0627\u0644\u0645\u062D\u0644\u0644\u064A\u0646', 'Analyst Consensus')}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-[var(--text-muted)] mb-1">{t('\u0627\u0644\u062A\u0648\u0635\u064A\u0629', 'Recommendation')}</p>
                <p className={cn(
                  'text-sm font-bold uppercase',
                  detail.recommendation.toLowerCase().includes('buy') ? 'text-accent-green'
                    : detail.recommendation.toLowerCase().includes('sell') ? 'text-accent-red'
                    : 'text-gold'
                )}>
                  {detail.recommendation.toUpperCase()}
                </p>
              </div>
              <MetricCard label={t('\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641', 'Target Price')} value={detail.target_mean_price?.toFixed(2) || '-'} />
              <MetricCard label={t('\u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0644\u0644\u064A\u0646', 'Number of Analysts')} value={String(detail.analyst_count || '-')} />
            </div>
          </section>
        )}

        {/* Financial Statements */}
        <FinancialStatementsSection ticker={ticker} language={language} t={t} />

        {/* AI Chat CTA - pre-filled with ticker */}
        <Link
          href={`/chat?q=${encodeURIComponent(language === 'ar' ? '\u062D\u0644\u0644 \u0633\u0647\u0645 ' + ticker : 'Analyze stock ' + ticker)}`}
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
            {t('\u0627\u0633\u0623\u0644 \u0639\u0646', 'Ask about')} {detail.short_name || ticker}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1" dir={dir}>
            {t('\u0627\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0630\u0643\u064A\u0629 \u0644\u0644\u062D\u0635\u0648\u0644 \u0639\u0644\u0649 \u062A\u062D\u0644\u064A\u0644 \u0645\u0641\u0635\u0644', 'Use AI chat for detailed analysis')}
          </p>
        </Link>

      </div>
      <Toast message={toastMsg} visible={toastVisible} />
    </div>
  );
}
