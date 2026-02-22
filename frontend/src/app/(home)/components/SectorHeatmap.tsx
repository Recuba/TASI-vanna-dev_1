'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { useMarketHeatmap } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { LoadingSpinner } from '@/components/common/loading-spinner';

interface TreemapNode {
  name: string;
  size: number;
  change_pct: number;
  ticker: string;
  sector: string;
  fill: string;
}

function getHeatmapColor(changePct: number): string {
  if (changePct >= 3) return '#1B5E20';
  if (changePct >= 1.5) return '#2E7D32';
  if (changePct >= 0.5) return '#388E3C';
  if (changePct > 0) return '#4CAF50';
  if (changePct === 0) return '#616161';
  if (changePct > -0.5) return '#E53935';
  if (changePct > -1.5) return '#C62828';
  if (changePct > -3) return '#B71C1C';
  return '#880E4F';
}

function CustomContent(props: Record<string, unknown>) {
  const { x, y, width, height, name, change_pct, ticker } = props as {
    x: number; y: number; width: number; height: number;
    name: string; change_pct: number; ticker: string;
  };

  if (width < 30 || height < 20) return null;

  const displayName = width > 80 ? (name || ticker) : ticker?.replace('.SR', '');
  const showPct = height > 32 && width > 50;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={getHeatmapColor(change_pct)} stroke="#0E0E0E" strokeWidth={1} rx={2} />
      <text x={x + width / 2} y={y + height / 2 - (showPct ? 5 : 0)} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={width > 60 ? 10 : 8} fontWeight="bold">
        {displayName?.slice(0, Math.floor(width / 7)) || ''}
      </text>
      {showPct && (
        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.8)" fontSize={8}>
          {change_pct != null ? `${change_pct >= 0 ? '+' : ''}${change_pct.toFixed(1)}%` : ''}
        </text>
      )}
    </g>
  );
}

function HeatmapTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TreemapNode }> }) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-sm font-bold text-[var(--text-primary)]">{data.name}</p>
      <p className="text-xs text-[var(--text-muted)]">{data.ticker} | {data.sector}</p>
      <p className={cn('text-xs font-bold mt-1', data.change_pct >= 0 ? 'text-accent-green' : 'text-accent-red')}>
        {data.change_pct >= 0 ? '+' : ''}{data.change_pct?.toFixed(2)}%
      </p>
    </div>
  );
}

export function SectorHeatmap() {
  const { data: heatmapData, loading, error, refetch } = useMarketHeatmap();
  const { t } = useLanguage();

  const treemapData = useMemo(() => {
    if (!heatmapData) return [];
    return heatmapData
      .filter((item) => item.market_cap && item.market_cap > 0 && item.change_pct != null)
      .slice(0, 100)
      .map((item) => ({
        name: item.name || item.ticker,
        size: item.market_cap,
        change_pct: item.change_pct,
        ticker: item.ticker,
        sector: item.sector || '',
        fill: getHeatmapColor(item.change_pct),
      }));
  }, [heatmapData]);

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 hover:border-gold/30 rounded-xl p-5 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider">
          {t('خريطة السوق', 'Market Heatmap')}
        </h3>
        <Link href="/market" className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors">
          {t('عرض الكل', 'View All')}
        </Link>
      </div>

      {loading ? (
        <div className="h-[320px] flex items-center justify-center">
          <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />
        </div>
      ) : error ? (
        <div className="h-[320px] flex items-center justify-center">
          <button onClick={refetch} className="text-sm text-accent-red hover:text-gold transition-colors">
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      ) : treemapData.length > 0 ? (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treemapData}
              dataKey="size"
              stroke="#0E0E0E"
              content={<CustomContent />}
            >
              <Tooltip content={<HeatmapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[320px] flex items-center justify-center">
          <p className="text-sm text-[var(--text-muted)]">{t('لا توجد بيانات', 'No data available')}</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
        {[
          { label: '-3%+', color: '#880E4F' },
          { label: '-1.5%', color: '#C62828' },
          { label: '0%', color: '#616161' },
          { label: '+1.5%', color: '#388E3C' },
          { label: '+3%+', color: '#1B5E20' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] text-[var(--text-muted)]">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
