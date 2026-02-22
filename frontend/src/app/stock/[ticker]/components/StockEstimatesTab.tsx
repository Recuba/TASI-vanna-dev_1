'use client';

import { cn } from '@/lib/utils';
import { useStockDetail } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Tooltip as ReTooltip } from 'recharts';

interface StockEstimatesTabProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

export function StockEstimatesTab({ ticker, language, t }: StockEstimatesTabProps) {
  const { data: detail, loading, error, refetch } = useStockDetail(ticker);
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (loading) return <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />;
  if (error) return <div className="text-center py-8"><button onClick={refetch} className="text-sm text-accent-red hover:text-gold">{t('إعادة المحاولة', 'Retry')}</button></div>;
  if (!detail) return <p className="text-sm text-[var(--text-muted)] py-8 text-center">{t('لا توجد بيانات تقديرية', 'No estimates data available')}</p>;

  const hasAnalystData = detail.recommendation || detail.target_mean_price != null || detail.analyst_count;
  if (!hasAnalystData) return <p className="text-sm text-[var(--text-muted)] py-8 text-center">{t('لا توجد تقديرات محللين', 'No analyst estimates available')}</p>;

  const currentPrice = detail.current_price ?? 0;
  const targetMean = detail.target_mean_price ?? 0;
  const targetHigh = detail.target_high_price ?? 0;
  const targetLow = detail.target_low_price ?? 0;
  const targetMedian = detail.target_median_price ?? 0;

  // Build data for area chart showing target price range
  const chartData = [
    { name: t('منخفض', 'Low'), high: targetHigh, mean: targetMean, low: targetLow },
    { name: t('متوسط', 'Median'), high: targetHigh, mean: targetMedian, low: targetLow },
    { name: t('مرتفع', 'High'), high: targetHigh, mean: targetMean, low: targetLow },
  ];

  const upsidePct = currentPrice > 0 ? ((targetMean - currentPrice) / currentPrice) * 100 : 0;
  const isUpside = upsidePct >= 0;

  const recLabel = detail.recommendation?.toUpperCase() || '-';
  const recColor = recLabel.includes('BUY') || recLabel.includes('STRONG')
    ? 'text-accent-green'
    : recLabel.includes('SELL')
      ? 'text-accent-red'
      : 'text-gold';

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5 space-y-6">
      <h2 className="text-sm font-bold text-gold uppercase tracking-wider" dir={dir}>
        {t('تقديرات المحللين', 'Analyst Estimates')}
      </h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-[var(--text-muted)] mb-1">{t('التوصية', 'Recommendation')}</p>
          <p className={cn('text-sm font-bold uppercase', recColor)}>{recLabel}</p>
        </div>
        <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-[var(--text-muted)] mb-1">{t('عدد المحللين', 'Analysts')}</p>
          <p className="text-sm font-bold text-[var(--text-primary)]">{detail.analyst_count ?? '-'}</p>
        </div>
        <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-[var(--text-muted)] mb-1">{t('السعر المستهدف', 'Target Price')}</p>
          <p className="text-sm font-bold text-[var(--text-primary)]">{targetMean ? targetMean.toFixed(2) : '-'}</p>
        </div>
        <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-[var(--text-muted)] mb-1">{t('العائد المتوقع', 'Upside/Downside')}</p>
          <p className={cn('text-sm font-bold', isUpside ? 'text-accent-green' : 'text-accent-red')}>
            {isUpside ? '+' : ''}{upsidePct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Target Price Range Chart */}
      {targetHigh > 0 && targetLow > 0 && (
        <div className="bg-[var(--bg-input)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-3">{t('نطاق السعر المستهدف', 'Target Price Range')}</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis
                domain={[Math.floor(targetLow * 0.95), Math.ceil(targetHigh * 1.05)]}
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                width={50}
              />
              <ReTooltip
                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
              />
              <Area type="monotone" dataKey="high" stackId="range" stroke="#22C55E" fill="#22C55E" fillOpacity={0.1} name={t('أعلى', 'High')} />
              <Area type="monotone" dataKey="mean" stackId="mean" stroke="#D4A84B" fill="#D4A84B" fillOpacity={0.2} name={t('متوسط', 'Mean')} />
              <Area type="monotone" dataKey="low" stackId="range2" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} name={t('أدنى', 'Low')} />
              {currentPrice > 0 && (
                <ReferenceLine
                  y={currentPrice}
                  stroke="#D4A84B"
                  strokeDasharray="5 5"
                  label={{ value: `${t('الحالي', 'Current')} ${currentPrice.toFixed(2)}`, fill: '#D4A84B', fontSize: 10 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Price Target Breakdown */}
      <div className="bg-[var(--bg-input)] rounded-xl p-4">
        <p className="text-xs text-[var(--text-muted)] mb-3">{t('تفاصيل السعر المستهدف', 'Price Target Details')}</p>
        <div className="space-y-2">
          {/* Visual range bar */}
          <div className="relative h-8 bg-[var(--bg-card)] rounded-full overflow-hidden">
            {targetHigh > 0 && targetLow > 0 && (() => {
              const range = targetHigh - targetLow;
              const leftPct = range > 0 ? ((targetMean - targetLow) / range) * 100 : 50;
              const currentPct = range > 0 && currentPrice > 0 ? ((currentPrice - targetLow) / range) * 100 : -1;
              return (
                <>
                  <div className="absolute inset-y-0 bg-gold/20 rounded-full" style={{ left: '10%', right: '10%' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-gold rounded-full border-2 border-[var(--bg-card)]" style={{ left: `${Math.max(5, Math.min(95, leftPct))}%` }} title={`Target: ${targetMean.toFixed(2)}`} />
                  {currentPct >= 0 && (
                    <div className="absolute top-1/2 -translate-y-1/2 w-2 h-6 bg-white/80 rounded-sm" style={{ left: `${Math.max(2, Math.min(98, currentPct))}%` }} title={`Current: ${currentPrice.toFixed(2)}`} />
                  )}
                </>
              );
            })()}
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-accent-red">{t('أدنى', 'Low')}: {targetLow.toFixed(2)}</span>
            <span className="text-gold">{t('متوسط', 'Mean')}: {targetMean.toFixed(2)}</span>
            <span className="text-accent-green">{t('أعلى', 'High')}: {targetHigh.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
