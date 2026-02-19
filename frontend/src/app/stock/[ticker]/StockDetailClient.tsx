'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useStockDetail } from '@/lib/hooks/use-api';
import { CandlestickChart, ChartWrapper, TradingViewAttribution, ChartErrorBoundary } from '@/components/charts';
import { useOHLCVData } from '@/lib/hooks/use-chart-data';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';
import { useLanguage } from '@/providers/LanguageProvider';
import { translateSector } from '@/lib/stock-translations';
import { Tooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/components/common/Toast';
import { StockFinancials } from './components/StockFinancials';
import { StockDividends } from './components/StockDividends';
import { StockNewsSection } from './components/StockNewsSection';
import { StockReportsSection } from './components/StockReportsSection';

// ---------------------------------------------------------------------------
// Watchlist helpers
// ---------------------------------------------------------------------------

const WATCHLIST_KEY = 'rad-ai-watchlist-tickers';

if (typeof window !== 'undefined') {
  const oldVal = localStorage.getItem('raid-watchlist-tickers');
  if (oldVal && !localStorage.getItem('rad-ai-watchlist-tickers')) {
    localStorage.setItem('rad-ai-watchlist-tickers', oldVal);
    localStorage.removeItem('raid-watchlist-tickers');
  }
}

function getWatchlistTickers(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'); } catch { return []; }
}

function setWatchlistTickers(tickers: string[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(tickers));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatNumber(val: number | null | undefined, opts?: { decimals?: number; prefix?: string }): string {
  if (val === null || val === undefined) return '-';
  const { decimals = 2, prefix = '' } = opts || {};
  if (Math.abs(val) >= 1e9) return `${prefix}${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${prefix}${(val / 1e6).toFixed(1)}M`;
  return `${prefix}${val.toFixed(decimals)}`;
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  return `${(val * 100).toFixed(2)}%`;
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' }) {
  return (
    <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className={cn('text-sm font-bold', accent === 'green' ? 'text-accent-green' : accent === 'red' ? 'text-accent-red' : 'text-[var(--text-primary)]')}>{value}</p>
      {sub && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticker normalization + tab types
// ---------------------------------------------------------------------------

function normalizeTicker(raw: string): string {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? `${trimmed}.SR` : trimmed;
}

type PageTab = 'overview' | 'financials' | 'dividends' | 'news';

const PAGE_TABS: { id: PageTab; labelAr: string; labelEn: string }[] = [
  { id: 'overview', labelAr: 'نظرة عامة', labelEn: 'Overview' },
  { id: 'financials', labelAr: 'البيانات المالية', labelEn: 'Financials' },
  { id: 'dividends', labelAr: 'التوزيعات', labelEn: 'Dividends' },
  { id: 'news', labelAr: 'الأخبار والتقارير', labelEn: 'News & Reports' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StockDetailClientProps { ticker: string; }

export function StockDetailClient({ ticker: rawTicker }: StockDetailClientProps) {
  const ticker = normalizeTicker(rawTicker);
  const { data: detail, loading, error, refetch } = useStockDetail(ticker);
  const { data: ohlcvData, loading: chartLoading, source: chartSource } = useOHLCVData(ticker);
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') router.push('/market'); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  const [inWatchlist, setInWatchlist] = useState(false);
  useEffect(() => { setInWatchlist(getWatchlistTickers().includes(ticker)); }, [ticker]);

  const toggleWatchlist = useCallback(() => {
    const current = getWatchlistTickers();
    if (current.includes(ticker)) {
      setWatchlistTickers(current.filter((tk) => tk !== ticker));
      setInWatchlist(false);
      showToast(t('تمت الإزالة من المفضلة', 'Removed from watchlist'), 'info');
    } else {
      setWatchlistTickers([...current, ticker]);
      setInWatchlist(true);
      showToast(t('تمت الإضافة للمفضلة', 'Added to watchlist'), 'success');
    }
  }, [ticker, t, showToast]);

  const [activeTab, setActiveTab] = useState<PageTab>('overview');
  const [shareCopied, setShareCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const shareTitle = `${detail?.short_name || ticker} - Ra'd AI`;
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: shareTitle, url: window.location.href }); return; } catch { /* fall through */ }
    }
    try { await navigator.clipboard.writeText(window.location.href); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); } catch { /* ignore */ }
  }, [detail?.short_name, ticker]);

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (loading) return <div className="flex-1 flex items-center justify-center"><LoadingSpinner message={t(`${ticker} جاري التحميل...`, `Loading ${ticker}...`)} /></div>;
  if (error) return <div className="flex-1 flex items-center justify-center"><ErrorDisplay message={error} onRetry={refetch} /></div>;
  if (!detail) return <div className="flex-1 flex items-center justify-center"><div className="text-center"><p className="text-lg font-bold text-[var(--text-primary)] mb-2">{ticker}</p><p className="text-sm text-[var(--text-muted)]" dir={dir}>{t('بيانات السهم غير متاحة', 'Stock data not available')}</p></div></div>;

  const priceChange = detail.current_price != null && detail.previous_close != null ? detail.current_price - detail.previous_close : null;
  const priceChangePct = priceChange != null && detail.previous_close != null && detail.previous_close > 0 ? (priceChange / detail.previous_close) * 100 : null;
  const isUp = priceChange !== null && priceChange >= 0;

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-5">

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] flex-wrap" dir={dir}>
          <Link href="/" className="hover:text-gold transition-colors">{t('الرئيسية', 'Home')}</Link>
          <span>&gt;</span>
          <Link href="/market" className="hover:text-gold transition-colors">{t('السوق', 'Market')}</Link>
          {detail.sector && (<><span>&gt;</span><Link href={`/market?sector=${encodeURIComponent(detail.sector)}`} className="hover:text-gold transition-colors">{translateSector(detail.sector, language)}</Link></>)}
          <span>&gt;</span>
          <span className="text-gold font-medium">{ticker}</span>
        </nav>

        {/* Company Header */}
        <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <button onClick={toggleWatchlist} className="mt-1 text-2xl transition-colors hover:scale-110 active:scale-95" aria-label={inWatchlist ? t('إزالة من المفضلة', 'Remove from watchlist') : t('إضافة للمفضلة', 'Add to watchlist')}>
                {inWatchlist ? <span className="text-gold">&#9733;</span> : <span className="text-[var(--text-muted)] hover:text-gold">&#9734;</span>}
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] break-words">{detail.short_name || ticker}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs bg-gold/10 text-gold px-2 py-0.5 rounded-full font-medium">{ticker}</span>
                  {detail.sector && (<Link href={`/market?sector=${encodeURIComponent(detail.sector)}`} className="text-xs bg-[var(--bg-input)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full hover:text-gold transition-colors">{translateSector(detail.sector, language)}</Link>)}
                  {detail.industry && (<span className="text-xs bg-[var(--bg-input)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">{detail.industry}</span>)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="text-end">
                <p className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">{detail.current_price?.toFixed(2) || '-'}<span className="text-sm text-[var(--text-muted)] ms-1">{detail.currency || 'SAR'}</span></p>
                {priceChange !== null && (<p className={cn('text-sm font-bold mt-0.5', isUp ? 'text-accent-green' : 'text-accent-red')}>{isUp ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePct?.toFixed(2)}%)<span className="text-[10px] ms-1">{isUp ? '▲' : '▼'}</span></p>)}
              </div>
              <Tooltip text={shareCopied ? t('تم نسخ الرابط', 'Link copied') : t('مشاركة', 'Share')} position="bottom">
                <button onClick={handleShare} className={cn('p-2 rounded-md transition-colors mt-1', 'text-[var(--text-muted)] hover:text-gold hover:bg-[var(--bg-card-hover)]')} aria-label={t('مشاركة', 'Share')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Price Summary Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label={t('الإغلاق السابق', 'Previous Close')} value={detail.previous_close?.toFixed(2) || '-'} />
          <MetricCard label={t('نطاق اليوم', 'Day Range')} value={`${detail.day_low?.toFixed(2) || '-'} - ${detail.day_high?.toFixed(2) || '-'}`} />
          <MetricCard label={t('نطاق 52 أسبوع', '52-Week Range')} value={`${detail.week_52_low?.toFixed(2) || '-'} - ${detail.week_52_high?.toFixed(2) || '-'}`} />
          <MetricCard label={t('حجم التداول', 'Volume')} value={formatNumber(detail.volume, { decimals: 0 })} />
        </div>

        {/* Tab Navigation */}
        <nav className="flex gap-1 bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-1.5 overflow-x-auto" role="tablist">
          {PAGE_TABS.map((tab) => (
            <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn('px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all', activeTab === tab.id ? 'bg-gold/15 text-gold border border-gold/30' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-input)]')}>
              {language === 'ar' ? tab.labelAr : tab.labelEn}
            </button>
          ))}
        </nav>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
              <ChartErrorBoundary fallbackHeight={400}>
                <ChartWrapper title={t('الرسم البياني', 'Price Chart')} source={chartSource}>
                  <CandlestickChart data={ohlcvData || []} height={400} ticker={ticker} loading={chartLoading} />
                </ChartWrapper>
              </ChartErrorBoundary>
              <div className="flex items-center justify-between -mt-1">
                <Link href={`/charts?ticker=${encodeURIComponent(ticker)}`} className="text-xs text-gold hover:text-gold-light transition-colors font-medium" dir={dir}>{t('عرض الرسم البياني الكامل', 'View full chart')}</Link>
                <TradingViewAttribution />
              </div>
            </section>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
                <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>{t('المؤشرات الرئيسية', 'Key Metrics')}</h2>
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard label={t('القيمة السوقية', 'Market Cap')} value={formatNumber(detail.market_cap, { prefix: 'SAR ' })} />
                  <MetricCard label="Beta" value={detail.beta?.toFixed(2) || '-'} />
                  <MetricCard label={t('P/E (متأخر)', 'P/E (Trailing)')} value={detail.trailing_pe?.toFixed(2) || '-'} />
                  <MetricCard label={t('P/E (متوقع)', 'P/E (Forward)')} value={detail.forward_pe?.toFixed(2) || '-'} />
                  <MetricCard label="P/B" value={detail.price_to_book?.toFixed(2) || '-'} />
                  <MetricCard label="EPS" value={detail.trailing_eps?.toFixed(2) || '-'} />
                </div>
              </section>
              <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
                <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>{t('الربحية', 'Profitability')}</h2>
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard label={t('العائد على الملكية', 'Return on Equity')} value={formatPct(detail.roe)} accent={detail.roe !== null && detail.roe !== undefined ? (detail.roe >= 0 ? 'green' : 'red') : undefined} />
                  <MetricCard label={t('هامش الربح', 'Profit Margin')} value={formatPct(detail.profit_margin)} accent={detail.profit_margin !== null && detail.profit_margin !== undefined ? (detail.profit_margin >= 0 ? 'green' : 'red') : undefined} />
                  <MetricCard label={t('نمو الإيرادات', 'Revenue Growth')} value={formatPct(detail.revenue_growth)} accent={detail.revenue_growth !== null && detail.revenue_growth !== undefined ? (detail.revenue_growth >= 0 ? 'green' : 'red') : undefined} />
                </div>
              </section>
            </div>
            {detail.recommendation && (
              <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
                <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>{t('إجماع المحللين', 'Analyst Consensus')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3 text-center">
                    <p className="text-xs text-[var(--text-muted)] mb-1">{t('التوصية', 'Recommendation')}</p>
                    <p className={cn('text-sm font-bold uppercase', detail.recommendation.toLowerCase().includes('buy') ? 'text-accent-green' : detail.recommendation.toLowerCase().includes('sell') ? 'text-accent-red' : 'text-gold')}>{detail.recommendation.toUpperCase()}</p>
                  </div>
                  <MetricCard label={t('السعر المستهدف', 'Target Price')} value={detail.target_mean_price?.toFixed(2) || '-'} />
                  <MetricCard label={t('عدد المحللين', 'Number of Analysts')} value={String(detail.analyst_count || '-')} />
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === 'financials' && <StockFinancials ticker={ticker} language={language} t={t} />}
        {activeTab === 'dividends' && <StockDividends ticker={ticker} language={language} t={t} />}
        {activeTab === 'news' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StockNewsSection ticker={ticker} language={language} t={t} />
            <StockReportsSection ticker={ticker} language={language} t={t} />
          </div>
        )}

        {/* AI Chat CTA */}
        <Link href={`/chat?q=${encodeURIComponent(language === 'ar' ? 'حلل سهم ' + ticker : 'Analyze stock ' + ticker)}`}
          className={cn('block p-5 rounded-xl text-center', 'bg-gradient-to-r from-gold/10 via-gold/5 to-gold/10', 'border border-gold/20', 'hover:from-gold/15 hover:via-gold/10 hover:to-gold/15', 'hover:border-gold/40', 'transition-all duration-300')}>
          <p className="text-sm font-bold gold-text" dir={dir}>{t('اسأل عن', 'Ask about')} {detail.short_name || ticker}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1" dir={dir}>{t('استخدم المحادثة الذكية للحصول على تحليل مفصل', 'Use AI chat for detailed analysis')}</p>
        </Link>

      </div>
    </div>
  );
}
