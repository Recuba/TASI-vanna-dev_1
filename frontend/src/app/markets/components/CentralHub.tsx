import React from 'react';
import { C, pctFmt } from './constants';
import { HUB_RADIUS } from '@/lib/market-graph';
import type { PortfolioStats } from '@/lib/market-graph';

// ---------------------------------------------------------------------------
// CentralHub - center of the constellation
// ---------------------------------------------------------------------------

export interface CentralHubProps {
  stats: PortfolioStats;
  count: number;
  cx: number;
  cy: number;
  t: (ar: string, en: string) => string;
}

function CentralHubInner({ stats, count, cx, cy, t }: CentralHubProps) {
  const color = stats.avgReturn > 0 ? C.green : stats.avgReturn < 0 ? C.red : C.gold;
  const sentiment =
    stats.breadth > 0.3
      ? t('\u0635\u0627\u0639\u062F', 'Bullish')
      : stats.breadth < -0.3
        ? t('\u0647\u0627\u0628\u0637', 'Bearish')
        : t('\u0645\u062A\u0648\u0627\u0632\u0646', 'Neutral');

  const hubSize = HUB_RADIUS * 2;

  return (
    <div
      className="absolute z-10 flex flex-col items-center justify-center rounded-full -translate-x-1/2 -translate-y-1/2"
      style={{
        left: cx,
        top: cy,
        width: hubSize,
        height: hubSize,
        background: `radial-gradient(circle, ${C.surface} 0%, ${C.bg} 100%)`,
        border: `1px solid ${C.border}`,
        boxShadow: `0 0 60px ${color}18, 0 0 100px ${color}06`,
      }}
      aria-label={`Market sentiment: ${sentiment}, average return ${stats.avgReturn > 0 ? '+' : ''}${stats.avgReturn.toFixed(2)}%`}
    >
      <div
        className="absolute inset-[-2px] rounded-full animate-[pulseRing_3s_ease-in-out_infinite] pointer-events-none"
        style={{ border: `2px solid ${color}30` }}
      />
      <span
        aria-live="polite"
        className="font-arabic text-2xl font-bold leading-none text-[--text-primary]"
      >
        {sentiment}
      </span>
      <span
        className="font-mono text-lg font-bold mt-2 leading-none"
        style={{ color }}
      >
        {stats.avgReturn > 0 ? '+' : ''}
        {stats.avgReturn.toFixed(2)}%
      </span>
      <div className="flex gap-3 mt-3">
        <div className="text-center">
          <div className="font-mono text-sm font-bold text-[--text-primary]">
            {stats.advancing}/{count}
          </div>
          <div className="font-mono text-[10px] text-[--text-muted]">
            A/D
          </div>
        </div>
        <div className="w-px h-6 bg-[#2A2A2A]" />
        <div className="text-center">
          <div
            className="font-mono text-sm font-bold"
            style={{ color: stats.diversification > 0.5 ? C.green : C.gold }}
          >
            {pctFmt(stats.diversification)}
          </div>
          <div className="font-mono text-[10px] text-[--text-muted]">
            Div.R
          </div>
        </div>
      </div>
    </div>
  );
}

export const CentralHub = React.memo(CentralHubInner);
