'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useSectors, useMarketData } from '@/lib/hooks/use-api';
import { MiniSparkline, TradingViewAttribution, ChartErrorBoundary } from '@/components/charts';
import { useMiniChartData } from '@/lib/hooks/use-chart-data';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';
import { useLanguage } from '@/providers/LanguageProvider';
import { translateSector } from '@/lib/stock-translations';

// ---------------------------------------------------------------------------
// Quick action cards - bilingual
// ---------------------------------------------------------------------------

const quickActions = [
  {
    titleAr: '\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0630\u0643\u064A\u0629',
    titleEn: 'AI Chat',
    descAr: '\u0627\u0633\u0623\u0644 \u0639\u0646 \u0627\u0644\u0623\u0633\u0647\u0645 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0637\u0628\u064A\u0639\u064A\u0629',
    descEn: 'Ask about Saudi stocks in natural language',
    href: '/chat',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
      </svg>
    ),
  },
  {
    titleAr: '\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u0648\u0642',
    titleEn: 'Market Data',
    descAr: '\u062A\u0635\u0641\u062D \u062C\u0645\u064A\u0639 \u0627\u0644\u0634\u0631\u0643\u0627\u062A \u0648\u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062A \u0641\u064A \u062A\u0627\u0633\u064A',
    descEn: 'Browse all companies and sectors in TASI',
    href: '/market',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    titleAr: '\u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A\u0629',
    titleEn: 'Charts',
    descAr: '\u0631\u0633\u0648\u0645 \u0628\u064A\u0627\u0646\u064A\u0629 \u062A\u0641\u0627\u0639\u0644\u064A\u0629 \u0644\u0644\u0645\u0624\u0634\u0631 \u0648\u0627\u0644\u0623\u0633\u0647\u0645',
    descEn: 'Interactive charts for index and stocks',
    href: '/charts',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v-5.5m3 5.5V8.25m3 3v-2" />
      </svg>
    ),
  },
  {
    titleAr: '\u0627\u0644\u0623\u062E\u0628\u0627\u0631',
    titleEn: 'News',
    descAr: '\u0622\u062E\u0631 \u0623\u062E\u0628\u0627\u0631 \u0627\u0644\u0633\u0648\u0642 \u0648\u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A',
    descEn: 'Latest market news and announcements',
    href: '/news',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
      </svg>
    ),
  },
];

// Sector display colors by index
const sectorColors = [
  'bg-gold', 'bg-accent-blue', 'bg-accent-green', 'bg-accent-warning',
  'bg-accent-red', 'bg-gold-dark', 'bg-accent-blue', 'bg-accent-green',
  'bg-accent-warning', 'bg-accent-red', 'bg-gold',
];

// ---------------------------------------------------------------------------
// Mini sparkline wrapper
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
  const { t, language, isRTL } = useLanguage();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Migrate old key name
      const oldVal = localStorage.getItem('raid-onboarding-seen');
      if (oldVal && !localStorage.getItem('rad-ai-onboarding-seen')) {
        localStorage.setItem('rad-ai-onboarding-seen', oldVal);
        localStorage.removeItem('raid-onboarding-seen');
      }
      if (!localStorage.getItem('rad-ai-onboarding-seen')) {
        setShowOnboarding(true);
      }
    }
  }, []);

  function dismissOnboarding() {
    localStorage.setItem('rad-ai-onboarding-seen', '1');
    setShowOnboarding(false);
  }

  const { data: sectors, loading: sectorsLoading, error: sectorsError, refetch: refetchSectors } = useSectors();
  const { data: topMovers, loading: moversLoading, error: moversError, refetch: refetchMovers } = useMarketData({ limit: 5 });

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-8">

        {/* Onboarding Banner */}
        {showOnboarding && (
          <div className={cn(
            'flex items-start gap-3 p-4 rounded-xl',
            'bg-gold/5 border border-gold/20',
            'animate-fade-in-up'
          )}>
            <div className="flex-1">
              <p className="text-sm font-bold text-gold mb-1">
                {t('\u0645\u0631\u062D\u0628\u064B\u0627 \u0628\u0643 \u0641\u064A \u0631\u0639\u062F', 'Welcome to Ra\'d')}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {t(
                  '\u0627\u0633\u062A\u0643\u0634\u0641 \u0628\u064A\u0627\u0646\u0627\u062A \u0633\u0648\u0642 \u0627\u0644\u0623\u0633\u0647\u0645 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 \u0648\u0627\u0633\u0623\u0644 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0637\u0628\u064A\u0639\u064A\u0629. \u0627\u0633\u062A\u062E\u062F\u0645 Ctrl+K \u0644\u0644\u0627\u0646\u062A\u0642\u0627\u0644 \u0644\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0630\u0643\u064A\u0629.',
                  'Explore Saudi stock market data and ask questions in natural language. Use Ctrl+K to jump to AI Chat.'
                )}
              </p>
            </div>
            <button
              onClick={dismissOnboarding}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 flex-shrink-0"
              aria-label="Dismiss welcome banner"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Hero Section */}
        <section className="text-center py-8 animate-fade-in-up">
          <div className="inline-block mb-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#D4A84B] via-[#E8C872] to-[#B8860B] flex items-center justify-center shadow-lg shadow-gold/20">
              <svg className="w-8 h-8 text-[#0E0E0E]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v-5.5m3 5.5V8.25m3 3v-2" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-3 gold-text">
            {t('\u0631\u0639\u062F \u2014 \u0645\u062D\u0644\u0644 \u0627\u0644\u0623\u0633\u0647\u0645 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A', 'Ra\'d \u2014 Saudi Stock AI Analyst')}
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
            {t(
              '\u0645\u0646\u0635\u0629 \u0630\u0643\u064A\u0629 \u0644\u062A\u062D\u0644\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0633\u0648\u0642 \u062A\u0627\u0633\u064A \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0637\u0628\u064A\u0639\u064A\u0629\u060C \u0645\u0639 \u0631\u0633\u0648\u0645 \u0628\u064A\u0627\u0646\u064A\u0629 \u062A\u0641\u0627\u0639\u0644\u064A\u0629 \u0648\u0623\u062E\u0628\u0627\u0631 \u0644\u062D\u0638\u064A\u0629',
              'Smart platform for TASI market analysis using natural language, with interactive charts and live news'
            )}
          </p>
        </section>

        {/* Quick Action Cards */}
        <section className="animate-fade-in-up-delay-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={cn(
                  'block p-5 rounded-xl',
                  'bg-[var(--bg-card)]',
                  'border border-[var(--border-color)] dark:border-[#2A2A2A]/50',
                  'hover:border-gold/30 hover:bg-[var(--bg-card-hover)]',
                  'transition-all duration-300',
                  'group relative overflow-hidden'
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">
                  <div className="text-[var(--text-muted)] group-hover:text-gold transition-colors duration-300 mb-3">
                    {action.icon}
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-gold transition-colors mb-1">
                    {language === 'ar' ? action.titleAr : action.titleEn}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {language === 'ar' ? action.descAr : action.descEn}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Two-column: Sectors + Top Movers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-up-delay-3">

          {/* Sector Cards */}
          <section className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 hover:border-gold/30 rounded-xl p-5 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gold uppercase tracking-wider">
                {t('\u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062A', 'Sectors')}
              </h3>
              <Link href="/market" className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors">
                {t('\u0639\u0631\u0636 \u0627\u0644\u0643\u0644', 'View All')} {isRTL ? '\u2190' : '\u2192'}
              </Link>
            </div>
            {sectorsLoading ? (
              <LoadingSpinner message={t('\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644...', 'Loading...')} />
            ) : sectorsError ? (
              <ErrorDisplay message={sectorsError} onRetry={refetchSectors} />
            ) : sectors && sectors.length > 0 ? (
              <div className="space-y-1.5">
                {sectors.map((sector, i) => (
                  <Link
                    key={sector.sector}
                    href={`/market?sector=${encodeURIComponent(sector.sector)}`}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', sectorColors[i % sectorColors.length])} />
                    <span className="text-sm text-[var(--text-secondary)] flex-1 truncate">{translateSector(sector.sector, language)}</span>
                    <span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-input)] px-2 py-0.5 rounded-full">
                      {sector.company_count}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{t('\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A', 'No data available')}</p>
            )}
          </section>

          {/* Top Movers */}
          <section className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 hover:border-gold/30 rounded-xl p-5 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gold uppercase tracking-wider">
                {t('\u0623\u0639\u0644\u0649 \u0627\u0644\u0634\u0631\u0643\u0627\u062A \u0642\u064A\u0645\u0629', 'Top Companies by Value')}
              </h3>
              <Link href="/market" className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors">
                {t('\u0639\u0631\u0636 \u0627\u0644\u0643\u0644', 'View All')} {isRTL ? '\u2190' : '\u2192'}
              </Link>
            </div>
            {moversLoading ? (
              <LoadingSpinner message={t('\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644...', 'Loading...')} />
            ) : moversError ? (
              <ErrorDisplay message={moversError} onRetry={refetchMovers} />
            ) : topMovers && topMovers.items.length > 0 ? (
              <ChartErrorBoundary fallbackHeight={200}>
              <div className="space-y-1">
                {topMovers.items.map((stock) => (
                  <Link
                    key={stock.ticker}
                    href={`/stock/${encodeURIComponent(stock.ticker)}`}
                    className="flex items-center gap-3 py-2 hover:bg-[var(--bg-card-hover)] rounded-lg px-2 -mx-2 transition-colors"
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
              </ChartErrorBoundary>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{t('\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A', 'No data available')}</p>
            )}
          </section>

        </div>

        {/* About Section */}
        <section className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 hover:border-gold/30 rounded-xl p-6 animate-fade-in-up-delay-3 transition-colors">
          <h3 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider">
            {t('\u0639\u0646 \u0631\u0639\u062F', 'About Ra\'d')}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {t(
              '\u0631\u0639\u062F \u0647\u064A \u0645\u0646\u0635\u0629 \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0645\u062A\u0642\u062F\u0645\u0629 \u0644\u062A\u062D\u0644\u064A\u0644 \u0633\u0648\u0642 \u0627\u0644\u0623\u0633\u0647\u0645 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 (TASI). \u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u0646\u0635\u0629 \u0625\u0645\u0643\u0627\u0646\u064A\u0629 \u0627\u0644\u0627\u0633\u062A\u0639\u0644\u0627\u0645 \u0639\u0646 \u0628\u064A\u0627\u0646\u0627\u062A \u0623\u0643\u062B\u0631 \u0645\u0646 500 \u0634\u0631\u0643\u0629 \u0645\u062F\u0631\u062C\u0629 \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0623\u0648 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629\u060C \u0645\u0639 \u0631\u0633\u0648\u0645 \u0628\u064A\u0627\u0646\u064A\u0629 \u062A\u0641\u0627\u0639\u0644\u064A\u0629\u060C \u0648\u0623\u062E\u0628\u0627\u0631 \u0645\u0646 5 \u0645\u0635\u0627\u062F\u0631 \u0639\u0631\u0628\u064A\u0629\u060C \u0648\u062A\u0642\u0627\u0631\u064A\u0631 \u0645\u0627\u0644\u064A\u0629 \u0645\u0641\u0635\u0644\u0629.',
              'Ra\'d is an advanced AI platform for analyzing the Saudi stock market (TASI). The platform enables querying data for over 500 listed companies using Arabic or English, with interactive charts, news from 5 Arabic sources, and detailed financial reports.'
            )}
          </p>
        </section>

        {/* AI Chat CTA */}
        <section className="animate-fade-in-up-delay-3">
          <Link
            href="/chat"
            className={cn(
              'block p-6 rounded-xl text-center',
              'bg-gradient-to-r from-gold/10 via-gold/5 to-gold/10',
              'border border-gold/20',
              'hover:from-gold/15 hover:via-gold/10 hover:to-gold/15',
              'hover:border-gold/40',
              'transition-all duration-300'
            )}
          >
            <p className="text-lg font-bold gold-text mb-1">
              {t('\u0627\u0628\u062F\u0623 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0630\u0643\u064A\u0629', 'Start AI Chat')}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {t('\u0627\u0633\u0623\u0644 \u0623\u064A \u0633\u0624\u0627\u0644 \u0639\u0646 \u0627\u0644\u0623\u0633\u0647\u0645 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 \u0648\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629', 'Ask any question about Saudi stocks and financial data')}
            </p>
          </Link>
        </section>

        {/* TradingView Attribution */}
        <div className="text-center pb-4">
          <TradingViewAttribution />
        </div>

      </div>
    </div>
  );
}
