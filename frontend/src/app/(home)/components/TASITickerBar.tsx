'use client';

import { cn } from '@/lib/utils';
import { useMarketSummary } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';

function formatLargeNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (Math.abs(val) >= 1e12) return `${(val / 1e12).toFixed(1)}T`;
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  return val.toLocaleString();
}

export function TASITickerBar() {
  const { data: summary, loading } = useMarketSummary();
  const { t } = useLanguage();

  if (loading || !summary) {
    return (
      <div className="h-12 bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 rounded-xl animate-pulse" />
    );
  }

  const totalStocks = summary.gainers_count + summary.losers_count + summary.unchanged_count;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 rounded-xl px-4 py-2.5 flex items-center gap-4 sm:gap-6 overflow-x-auto">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs font-bold text-gold uppercase tracking-wider">TASI</span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-[var(--text-muted)]">{t('القيمة السوقية', 'Market Cap')}</span>
        <span className="text-sm font-bold text-[var(--text-primary)]">
          {formatLargeNumber(summary.total_market_cap)}
        </span>
      </div>

      <div className="w-px h-5 bg-[var(--border-color)] dark:bg-[#2A2A2A] flex-shrink-0" />

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-[var(--text-muted)]">{t('الحجم', 'Volume')}</span>
        <span className="text-sm font-bold text-[var(--text-primary)]">
          {formatLargeNumber(summary.total_volume)}
        </span>
      </div>

      <div className="w-px h-5 bg-[var(--border-color)] dark:bg-[#2A2A2A] flex-shrink-0" />

      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={cn('text-xs font-bold', 'text-accent-green')}>
          {t('صاعد', 'Up')} {summary.gainers_count}
        </span>
        <span className={cn('text-xs font-bold', 'text-accent-red')}>
          {t('هابط', 'Down')} {summary.losers_count}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {t('مستقر', 'Flat')} {summary.unchanged_count}
        </span>
      </div>

      <div className="w-px h-5 bg-[var(--border-color)] dark:bg-[#2A2A2A] flex-shrink-0" />

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-[var(--text-muted)]">{t('الإجمالي', 'Total')}</span>
        <span className="text-xs font-medium text-[var(--text-secondary)]">{totalStocks}</span>
      </div>
    </div>
  );
}
