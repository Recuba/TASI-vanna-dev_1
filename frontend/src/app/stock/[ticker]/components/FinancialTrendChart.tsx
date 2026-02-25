'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useFinancialTrend } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, Legend } from 'recharts';

const METRIC_COLORS = [
  '#D4A84B', // gold
  '#22C55E', // green
  '#6366F1', // indigo
  '#EF4444', // red
  '#F59E0B', // amber
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#14B8A6', // teal
  '#F97316', // orange
];

function formatValue(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toFixed(2);
}

interface FinancialTrendChartProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

export function FinancialTrendChart({ ticker, language, t }: FinancialTrendChartProps) {
  const { data, loading, error, refetch } = useFinancialTrend(ticker);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());

  if (loading) return <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />;
  if (error) return <div className="text-center py-8"><button onClick={refetch} className="text-sm text-accent-red hover:text-gold">{t('إعادة المحاولة', 'Retry')}</button></div>;
  if (!data || data.metrics.length === 0) return <p className="text-sm text-[var(--text-muted)] py-8 text-center">{t('لا توجد بيانات اتجاهية', 'No trend data available')}</p>;

  const metrics = data.metrics;

  // Initialize selected metrics to first 3 on first render
  const active = selectedMetrics.size > 0
    ? selectedMetrics
    : new Set(metrics.slice(0, 3).map((m) => m.name));

  const toggleMetric = (name: string) => {
    const next = new Set(active);
    if (next.has(name)) {
      if (next.size > 1) next.delete(name); // keep at least 1
    } else {
      next.add(name);
    }
    setSelectedMetrics(next);
  };

  // Build chart data: merge all metric periods into rows by date
  const dateMap = new Map<string, Record<string, number | null>>();
  for (const metric of metrics) {
    if (!active.has(metric.name)) continue;
    for (const period of metric.periods) {
      const date = period.date ?? 'Unknown';
      if (!dateMap.has(date)) dateMap.set(date, {});
      dateMap.get(date)![metric.name] = period.value;
    }
  }

  const chartData: Record<string, string | number | null>[] = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: date.length >= 10 ? date.slice(0, 7) : date, // show YYYY-MM
      ...values,
    }));

  const activeMetrics = metrics.filter((m) => active.has(m.name));

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-bold text-gold uppercase tracking-wider" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        {t('الاتجاهات المالية', 'Financial Trends')}
      </h2>

      {/* Metric selector chips */}
      <div className="flex flex-wrap gap-2">
        {metrics.map((metric, idx) => (
          <button
            key={metric.name}
            onClick={() => toggleMetric(metric.name)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all border',
              active.has(metric.name)
                ? 'border-transparent text-[var(--bg-card)]'
                : 'border-[#2A2A2A] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[#3A3A3A]'
            )}
            style={active.has(metric.name) ? { backgroundColor: METRIC_COLORS[idx % METRIC_COLORS.length] } : undefined}
          >
            {metric.name}
          </button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-[var(--bg-input)] rounded-xl p-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 14.5, fill: 'var(--text-muted)' }}
              />
              <YAxis
                tick={{ fontSize: 14.5, fill: 'var(--text-muted)' }}
                tickFormatter={formatValue}
                width={60}
              />
              <ReTooltip
                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                formatter={(value: number | undefined) => formatValue(value ?? null)}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px' }}
              />
              {activeMetrics.map((metric) => {
                const originalIdx = metrics.findIndex((m) => m.name === metric.name);
                return (
                  <Line
                    key={metric.name}
                    type="monotone"
                    dataKey={metric.name}
                    stroke={METRIC_COLORS[originalIdx % METRIC_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2A2A2A]">
              <th className="text-start py-2 px-2 text-[var(--text-muted)] font-medium">{t('المؤشر', 'Metric')}</th>
              {chartData.map((row) => (
                <th key={row.date} className="text-end py-2 px-2 text-[var(--text-muted)] font-medium">{row.date}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeMetrics.map((metric) => (
              <tr key={metric.name} className="border-b border-[#2A2A2A]/30 hover:bg-[var(--bg-card-hover)] transition-colors">
                <td className="py-1.5 px-2 text-[var(--text-secondary)] font-medium">{metric.name}</td>
                {chartData.map((row) => (
                  <td key={row.date} className="text-end py-1.5 px-2 text-[var(--text-primary)] font-mono">
                    {formatValue(row[metric.name] as number | null | undefined)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
