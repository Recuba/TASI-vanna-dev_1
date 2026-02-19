'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { useStockDividends } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' }) {
  return (
    <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className={cn('text-sm font-bold', accent === 'green' ? 'text-accent-green' : accent === 'red' ? 'text-accent-red' : 'text-[var(--text-primary)]')}>
        {value}
      </p>
      {sub && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

interface StockDividendsProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

export const StockDividends = memo(function StockDividends({ ticker, language, t }: StockDividendsProps) {
  const { data: dividends, loading } = useStockDividends(ticker);
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (!loading && (!dividends || (dividends.dividend_rate === null && dividends.dividend_yield === null))) {
    return null;
  }

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
      <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
        {t('توزيعات الأرباح', 'Dividends')}
      </h2>
      {loading ? (
        <div className="flex justify-center py-6"><LoadingSpinner message={t('جاري التحميل...', 'Loading...')} /></div>
      ) : dividends ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <MetricCard label={t('معدل التوزيع', 'Dividend Rate')} value={dividends.dividend_rate?.toFixed(2) || '-'} sub={dividends.dividend_rate ? 'SAR' : undefined} />
          <MetricCard label={t('عائد التوزيعات', 'Dividend Yield')} value={dividends.dividend_yield !== null ? `${(dividends.dividend_yield * 100).toFixed(2)}%` : '-'} accent={dividends.dividend_yield !== null && dividends.dividend_yield > 0 ? 'green' : undefined} />
          <MetricCard label={t('نسبة التوزيع', 'Payout Ratio')} value={dividends.payout_ratio !== null ? `${(dividends.payout_ratio * 100).toFixed(1)}%` : '-'} />
          <MetricCard label={t('متوسط 5 سنوات', '5-Year Avg Yield')} value={dividends.five_year_avg_dividend_yield !== null ? `${dividends.five_year_avg_dividend_yield.toFixed(2)}%` : '-'} />
          <MetricCard label={t('تاريخ الاستحقاق', 'Ex-Dividend Date')} value={dividends.ex_dividend_date || '-'} />
          <MetricCard label={t('آخر توزيع', 'Last Dividend')} value={dividends.last_dividend_value?.toFixed(2) || '-'} sub={dividends.last_dividend_date || undefined} />
          <MetricCard label={t('التوزيع السنوي المتأخر', 'Trailing Annual Rate')} value={dividends.trailing_annual_dividend_rate?.toFixed(2) || '-'} />
          <MetricCard label={t('العائد السنوي المتأخر', 'Trailing Annual Yield')} value={dividends.trailing_annual_dividend_yield !== null ? `${(dividends.trailing_annual_dividend_yield * 100).toFixed(2)}%` : '-'} />
        </div>
      ) : null}
    </section>
  );
});
