'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useMarketMovers } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { LoadingSpinner } from '@/components/common/loading-spinner';

type TabType = 'gainers' | 'losers';

export function MarketMoversWidget() {
  const [tab, setTab] = useState<TabType>('gainers');
  const { t, language } = useLanguage();
  const { data: movers, loading, error, refetch } = useMarketMovers(tab, 8);

  const tabs: { id: TabType; labelAr: string; labelEn: string }[] = [
    { id: 'gainers', labelAr: 'الرابحون', labelEn: 'Gainers' },
    { id: 'losers', labelAr: 'الخاسرون', labelEn: 'Losers' },
  ];

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 hover:border-gold/30 rounded-xl p-5 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider">
          {t('محركات السوق', 'Market Movers')}
        </h3>
        <Link href="/market" className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors">
          {t('عرض الكل', 'View All')}
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              tab === item.id
                ? 'bg-gold/15 text-gold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
            )}
          >
            {language === 'ar' ? item.labelAr : item.labelEn}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />
      ) : error ? (
        <button onClick={refetch} className="text-sm text-accent-red hover:text-gold transition-colors">
          {t('إعادة المحاولة', 'Retry')}
        </button>
      ) : movers && movers.length > 0 ? (
        <div className="space-y-1">
          {movers.map((stock) => (
            <Link
              key={stock.ticker}
              href={`/stock/${encodeURIComponent(stock.ticker)}`}
              className="flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate">
                  {stock.ticker}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {stock.current_price?.toFixed(2) ?? '-'}
                </span>
                <span className={cn(
                  'text-xs font-bold min-w-[52px] text-end',
                  stock.change_pct >= 0 ? 'text-accent-green' : 'text-accent-red'
                )}>
                  {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct?.toFixed(2)}%
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          {t('لا توجد بيانات', 'No data available')}
        </p>
      )}
    </section>
  );
}
