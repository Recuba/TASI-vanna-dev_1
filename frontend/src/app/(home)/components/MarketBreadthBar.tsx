'use client';

import { cn } from '@/lib/utils';
import { useMarketBreadth } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';

export function MarketBreadthBar() {
  const { data, loading } = useMarketBreadth();
  const { t } = useLanguage();

  if (loading || !data) {
    return (
      <div className="h-20 bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 rounded-xl animate-pulse" />
    );
  }

  const total = data.advancing + data.declining + data.unchanged;
  const advPct = total > 0 ? (data.advancing / total) * 100 : 0;
  const decPct = total > 0 ? (data.declining / total) * 100 : 0;
  const unchPct = total > 0 ? (data.unchanged / total) * 100 : 0;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 hover:border-gold/30 rounded-xl px-5 py-4 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-gold uppercase tracking-wider">
          {t('نبض السوق', 'Market Breadth')}
        </h3>
        {data.advance_decline_ratio != null && (
          <span className={cn(
            'text-xs font-bold',
            data.advance_decline_ratio >= 1 ? 'text-accent-green' : 'text-accent-red'
          )}>
            A/D {data.advance_decline_ratio.toFixed(2)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex h-2 rounded-full overflow-hidden bg-[var(--bg-input)] mb-3">
        <div className="bg-accent-green transition-all" style={{ width: `${advPct}%` }} />
        <div className="bg-[var(--text-muted)] transition-all" style={{ width: `${unchPct}%` }} />
        <div className="bg-accent-red transition-all" style={{ width: `${decPct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-green" />
          <span className="text-accent-green font-medium">{data.advancing}</span>
          <span className="text-[var(--text-muted)]">{t('صاعد', 'Adv')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" />
          <span className="text-[var(--text-secondary)] font-medium">{data.unchanged}</span>
          <span className="text-[var(--text-muted)]">{t('مستقر', 'Unch')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-red" />
          <span className="text-accent-red font-medium">{data.declining}</span>
          <span className="text-[var(--text-muted)]">{t('هابط', 'Dec')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)]">
            {t('أعلى 52', '52H')} <span className="text-accent-green font-medium">{data.new_52w_highs}</span>
          </span>
          <span className="text-[var(--text-muted)]">
            {t('أدنى 52', '52L')} <span className="text-accent-red font-medium">{data.new_52w_lows}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
