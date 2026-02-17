'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { StockOHLCVChart } from '@/components/charts';
import { getTASIStockName } from '@/lib/tradingview-utils';
import { useStockDetail } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { translateSector } from '@/lib/stock-translations';

interface StockChartPanelProps {
  ticker: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onAddToCompare?: (ticker: string) => void;
  compareDisabled?: boolean;
}

export function StockChartPanel({
  ticker,
  isFullscreen,
  onToggleFullscreen,
  onAddToCompare,
  compareDisabled,
}: StockChartPanelProps) {
  const { t, language } = useLanguage();
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

  const displayName = detail?.short_name || getTASIStockName(ticker);

  return (
    <div className="space-y-4">
      {/* Stock header */}
      <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            {displayName}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {ticker}
            {detail?.sector && <> &middot; {translateSector(detail.sector, language)}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            {detail?.current_price != null && (
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {detail.current_price.toFixed(2)}{' '}
                <span className="text-sm text-[var(--text-muted)]">SAR</span>
              </p>
            )}
            {priceChange !== null && (
              <p
                className={cn(
                  'text-base font-medium',
                  isUp ? 'text-accent-green' : 'text-accent-red',
                )}
              >
                {isUp ? '+' : ''}
                {priceChange.toFixed(2)} ({priceChangePct?.toFixed(2)}%)
              </p>
            )}
          </div>
          {/* Add to comparison button */}
          {onAddToCompare && (
            <button
              onClick={() => onAddToCompare(ticker)}
              disabled={compareDisabled}
              className={cn(
                'px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                compareDisabled
                  ? 'bg-[#2A2A2A] text-[#505050] cursor-not-allowed'
                  : 'bg-gold/10 border border-gold/30 text-gold hover:bg-gold/20',
              )}
              title={compareDisabled ? t('موجود بالفعل في المقارنة أو تم بلوغ الحد', 'Already in comparison or limit reached') : t('إضافة للمقارنة', 'Add to comparison')}
            >
              + {t('مقارنة', 'Compare')}
            </button>
          )}
          {/* Fullscreen toggle */}
          <button
            onClick={onToggleFullscreen}
            className="p-2 rounded-md transition-colors hover:bg-[var(--bg-card-hover)]"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Stock OHLCV Candlestick Chart */}
      <StockOHLCVChart
        ticker={ticker}
        stockName={displayName}
        height={isFullscreen ? Math.max(window.innerHeight - 180, 400) : (typeof window !== 'undefined' ? (window.innerWidth < 640 ? 280 : window.innerWidth < 1024 ? 350 : 550) : 550)}
      />

      {/* Footer */}
      {!isFullscreen && (
        <div className="flex items-center justify-end text-xs">
          <Link
            href={`/stock/${encodeURIComponent(ticker)}`}
            className="text-gold hover:text-gold-light transition-colors font-medium"
          >
            {t('عرض التفاصيل الكاملة', 'View full details')} &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
