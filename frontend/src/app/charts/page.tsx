'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import {
  ChartTabNavigation,
  StocksTab,
  CompareTab,
  AnalyticsTab,
  StockChartPanel,
  type TabId,
} from './components';

// ---------------------------------------------------------------------------
// Main Charts page
// ---------------------------------------------------------------------------

export default function ChartsPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>('stocks');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Comparison tickers
  const [compareTickers, setCompareTickers] = useState<string[]>([]);

  // Read URL params on mount (e.g. /charts?ticker=2222)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tickerParam = params.get('ticker');
    if (tickerParam) {
      setSelectedTicker(tickerParam);
      setActiveTab('stocks');
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Add to comparison handler
  const handleAddToCompare = useCallback((ticker: string) => {
    setCompareTickers((prev) => {
      if (prev.includes(ticker) || prev.length >= 5) return prev;
      return [...prev, ticker];
    });
  }, []);

  const handleRemoveFromCompare = useCallback((ticker: string) => {
    setCompareTickers((prev) => prev.filter((t) => t !== ticker));
  }, []);

  // Escape key exits fullscreen
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Fullscreen layout
  if (isFullscreen && selectedTicker) {
    return (
      <div className="fixed inset-0 z-50 dark:bg-[#0E0E0E] bg-white overflow-auto animate-chart-fullscreen-in">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <StockChartPanel
            ticker={selectedTicker}
            isFullscreen={true}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: t('\u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A\u0629', 'Charts') }]} />

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('الرسوم البيانية', 'Charts')}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {t('رسوم بيانية تفاعلية لأسهم تاسي', 'Interactive charts for TASI stocks')}
          </p>
        </div>

        {/* Tab bar */}
        <ChartTabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === 'stocks' && (
          <StocksTab
            selectedTicker={selectedTicker}
            onSelectTicker={setSelectedTicker}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onAddToCompare={handleAddToCompare}
            compareTickers={compareTickers}
          />
        )}

        {activeTab === 'compare' && (
          <CompareTab
            compareTickers={compareTickers}
            onAddToCompare={handleAddToCompare}
            onRemoveFromCompare={handleRemoveFromCompare}
          />
        )}

        {activeTab === 'analytics' && <AnalyticsTab />}

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
            <p className="text-sm font-bold gold-text">{t('تحتاج تحليل أعمق؟', 'Need deeper analysis?')}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {t('اسأل رعد AI لتحليل أي سهم أو قطاع أو مقياس مالي', 'Ask Ra\u2019d AI to analyze any stock, sector, or financial metric')}
            </p>
          </Link>
        </section>
      </div>
    </div>
  );
}
