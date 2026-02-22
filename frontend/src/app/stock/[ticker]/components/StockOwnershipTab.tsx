'use client';

import { cn } from '@/lib/utils';
import { useStockOwnership } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';

function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  return val.toLocaleString();
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  return `${(val * 100).toFixed(1)}%`;
}

const COLORS = ['#D4A84B', '#22C55E', '#6366F1', '#64748B'];

interface StockOwnershipTabProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

export function StockOwnershipTab({ ticker, language, t }: StockOwnershipTabProps) {
  const { data, loading, error, refetch } = useStockOwnership(ticker);
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (loading) return <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />;
  if (error) return <div className="text-center py-8"><button onClick={refetch} className="text-sm text-accent-red hover:text-gold">{t('إعادة المحاولة', 'Retry')}</button></div>;
  if (!data) return <p className="text-sm text-[var(--text-muted)] py-8 text-center">{t('لا توجد بيانات ملكية', 'No ownership data available')}</p>;

  const insiders = data.pct_held_insiders ?? 0;
  const institutions = data.pct_held_institutions ?? 0;
  const publicFloat = Math.max(0, 1 - insiders - institutions);

  const pieData = [
    { name: t('المطلعون', 'Insiders'), value: insiders, pct: insiders },
    { name: t('المؤسسات', 'Institutions'), value: institutions, pct: institutions },
    { name: t('التداول الحر', 'Public Float'), value: publicFloat, pct: publicFloat },
  ].filter((d) => d.value > 0);

  const hasChart = pieData.length > 0 && pieData.some((d) => d.value > 0);

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
      <h2 className="text-sm font-bold text-gold mb-4 uppercase tracking-wider" dir={dir}>
        {t('هيكل الملكية', 'Ownership Structure')}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Donut Chart */}
        {hasChart && (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value: number | undefined) => value != null ? `${(value * 100).toFixed(1)}%` : '-'}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-4 mt-2">
              {pieData.map((entry, idx) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-xs text-[var(--text-secondary)]">{entry.name}</span>
                  <span className="text-xs font-bold text-[var(--text-primary)]">{(entry.pct * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="space-y-3">
          <div className="bg-[var(--bg-input)] rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">{t('نسبة المطلعين', 'Insider Ownership')}</span>
            <span className={cn('text-sm font-bold', data.pct_held_insiders != null ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]')}>
              {formatPct(data.pct_held_insiders)}
            </span>
          </div>
          <div className="bg-[var(--bg-input)] rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">{t('نسبة المؤسسات', 'Institutional Ownership')}</span>
            <span className={cn('text-sm font-bold', data.pct_held_institutions != null ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]')}>
              {formatPct(data.pct_held_institutions)}
            </span>
          </div>
          <div className="bg-[var(--bg-input)] rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">{t('الأسهم الحرة', 'Float Shares')}</span>
            <span className="text-sm font-bold text-[var(--text-primary)]">{formatNumber(data.float_shares)}</span>
          </div>
          <div className="bg-[var(--bg-input)] rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">{t('الأسهم القائمة', 'Shares Outstanding')}</span>
            <span className="text-sm font-bold text-[var(--text-primary)]">{formatNumber(data.shares_outstanding)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
