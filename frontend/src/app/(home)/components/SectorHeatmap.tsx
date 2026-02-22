'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useMarketHeatmap } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { LoadingSpinner } from '@/components/common/loading-spinner';

// ---------------------------------------------------------------------------
// Color scale
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Cell component
// ---------------------------------------------------------------------------

interface HeatmapCellData {
  name: string;
  ticker: string;
  sector: string;
  change_pct: number;
  market_cap: number;
  tier: 'large' | 'mid' | 'small';
}

function HeatmapCell({ item }: { item: HeatmapCellData }) {
  const [hovered, setHovered] = useState(false);
  const shortTicker = item.ticker.replace('.SR', '');

  const sizeClasses = {
    large: 'w-[110px] h-[72px] sm:w-[120px] sm:h-[80px]',
    mid:   'w-[85px]  h-[54px] sm:w-[90px]  sm:h-[60px]',
    small: 'w-[65px]  h-[44px] sm:w-[70px]  sm:h-[50px]',
  };

  return (
    <div
      className={cn(
        'relative rounded-sm cursor-pointer transition-all duration-150 flex flex-col items-center justify-center overflow-visible',
        sizeClasses[item.tier],
        hovered && 'scale-105 ring-1 ring-white/30 z-10',
      )}
      style={{ backgroundColor: getHeatmapColor(item.change_pct) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className={cn(
        'font-bold text-white leading-tight truncate max-w-full px-1',
        item.tier === 'large' ? 'text-[11px] sm:text-xs' : item.tier === 'mid' ? 'text-[10px] sm:text-[11px]' : 'text-[9px] sm:text-[10px]',
      )}>
        {shortTicker}
      </span>
      <span className={cn(
        'text-white/80 leading-tight',
        item.tier === 'small' ? 'text-[8px]' : 'text-[9px] sm:text-[10px]',
      )}>
        {item.change_pct >= 0 ? '+' : ''}{item.change_pct.toFixed(1)}%
      </span>

      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-[var(--bg-card)] border border-[#2A2A2A] rounded-lg px-3 py-2 shadow-xl z-20 whitespace-nowrap pointer-events-none animate-fade-in">
          <p className="text-xs font-bold text-[var(--text-primary)]">{item.name}</p>
          <p className="text-[10px] text-[var(--text-muted)]">{item.sector}</p>
          <p className={cn('text-[10px] font-bold', item.change_pct >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {item.change_pct >= 0 ? '+' : ''}{item.change_pct.toFixed(2)}%
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {(item.market_cap / 1e9).toFixed(1)}B SAR
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gradient legend
// ---------------------------------------------------------------------------

function GradientLegend() {
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      <span className="text-[10px] text-[var(--text-muted)]">-3%+</span>
      <div
        className="h-2.5 w-32 sm:w-48 rounded-full"
        style={{
          background: 'linear-gradient(to right, #880E4F, #B71C1C, #C62828, #E53935, #616161, #4CAF50, #388E3C, #2E7D32, #1B5E20)',
        }}
      />
      <span className="text-[10px] text-[var(--text-muted)]">+3%+</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SectorHeatmap() {
  const { data: heatmapData, loading, error, refetch } = useMarketHeatmap();
  const { t } = useLanguage();

  const cells = useMemo<HeatmapCellData[]>(() => {
    if (!heatmapData) return [];
    const sorted = heatmapData
      .filter((item) => item.market_cap && item.market_cap > 0 && item.change_pct != null)
      .sort((a, b) => b.market_cap - a.market_cap)
      .slice(0, 100);

    return sorted.map((item, idx) => ({
      name: item.name || item.ticker,
      ticker: item.ticker,
      sector: item.sector || '',
      change_pct: item.change_pct,
      market_cap: item.market_cap,
      tier: idx < 10 ? 'large' as const : idx < 30 ? 'mid' as const : 'small' as const,
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
      ) : cells.length > 0 ? (
        <Link href="/market" className="block">
          <div className="flex flex-wrap gap-0.5 justify-center min-h-[280px]">
            {cells.map((cell) => (
              <HeatmapCell key={cell.ticker} item={cell} />
            ))}
          </div>
        </Link>
      ) : (
        <div className="h-[320px] flex items-center justify-center">
          <p className="text-sm text-[var(--text-muted)]">{t('لا توجد بيانات', 'No data available')}</p>
        </div>
      )}

      <GradientLegend />
    </section>
  );
}
