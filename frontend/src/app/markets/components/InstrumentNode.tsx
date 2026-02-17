import React from 'react';
import { cn } from '@/lib/utils';
import { C, fmt, pctFmt } from './constants';
import { Sparkline } from './Sparkline';
import { StatBadge } from './StatBadge';
import type { Instrument } from '@/lib/market-graph';

// ---------------------------------------------------------------------------
// InstrumentNode - Desktop instrument card positioned in constellation
// ---------------------------------------------------------------------------

export interface InstrumentNodeProps {
  inst: Instrument;
  x: number;
  y: number;
  isHovered: boolean;
  isDimmed: boolean;
  isFlashing?: boolean;
  isRTL: boolean;
  language: 'ar' | 'en';
  onHover: () => void;
  onLeave: () => void;
}

function InstrumentNodeInner({
  inst,
  x,
  y,
  isHovered,
  isDimmed,
  isFlashing,
  isRTL,
  language,
  onHover,
  onLeave,
}: InstrumentNodeProps) {
  const change = inst.change ?? 0;
  const beta = inst.beta ?? 0;
  const sharpe = inst.sharpe ?? 0;
  const vol = inst.vol ?? 0;
  const positive = change >= 0;
  const accent = positive ? C.green : C.red;
  const bgTint = positive ? C.greenDim : C.redDim;
  const betaColor = Math.abs(beta) > 1.5 ? C.red : Math.abs(beta) > 0.8 ? C.gold : C.green;
  const sharpeColor = sharpe > 1 ? C.green : sharpe > 0 ? C.gold : C.red;

  const displayName = language === 'ar' ? inst.nameAr : inst.nameEn;

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="cursor-default select-none absolute -translate-x-1/2 -translate-y-1/2 rounded-[14px] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      aria-label={`${displayName} (${inst.key}): ${fmt(inst.value)}, ${positive ? '+' : ''}${change.toFixed(2)}%`}
      style={{
        left: x,
        top: y,
        width: isHovered ? 210 : 190,
        padding: '12px 14px',
        background: isHovered
          ? `linear-gradient(135deg, ${C.surfaceHover} 0%, ${C.surface} 100%)`
          : C.surface,
        border: `1px solid ${isHovered ? accent + '50' : C.border}`,
        boxShadow: isHovered
          ? `0 0 28px ${accent}15, 0 6px 28px rgba(0,0,0,0.4)`
          : `0 2px 10px rgba(0,0,0,0.3)`,
        animation: isFlashing ? 'priceFlash 1.2s ease-out' : 'none',
        opacity: isDimmed ? 0.3 : 1,
        zIndex: isHovered ? 20 : 5,
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      {/* Header row */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}66` }}
          />
          <span
            className={cn(
              language === 'ar' ? 'font-arabic' : 'font-mono',
              'text-sm font-bold text-[--text-primary]',
            )}
          >
            {language === 'ar' ? inst.nameAr : inst.nameEn}
          </span>
        </div>
        <span
          className="font-mono text-xs rounded-md px-2 py-0.5 font-medium text-[--text-secondary]"
          style={{ background: bgTint }}
        >
          {inst.key}
        </span>
      </div>

      {/* Price row */}
      <div className="flex justify-between items-baseline mb-2">
        <span className="font-mono text-lg font-bold tracking-tight text-[--text-primary]">
          {fmt(inst.value)}
        </span>
        <span className="font-mono text-sm font-semibold" style={{ color: accent }}>
          {positive ? '\u25B2' : '\u25BC'} {positive ? '+' : ''}
          {change.toFixed(2)}%
        </span>
      </div>

      {/* Sparkline */}
      <div className="flex justify-center my-2">
        <Sparkline
          data={inst.sparkline}
          positive={positive}
          width={isHovered ? 180 : 160}
          height={26}
        />
      </div>

      {/* Stats row */}
      <div
        className="flex justify-between items-center mt-2 pt-2 border-t border-[#2A2A2A]"
      >
        <StatBadge label="\u03C3" value={pctFmt(vol)} />
        <StatBadge label="\u03B2" value={beta.toFixed(2)} color={betaColor} />
        <StatBadge label="SR" value={sharpe.toFixed(2)} color={sharpeColor} />
      </div>

      {/* Opposite language name */}
      <div
        className={cn(
          language === 'ar' ? 'font-mono' : 'font-arabic',
          'text-[10px] text-center mt-1.5 text-[--text-muted]',
        )}
        style={{ direction: language === 'ar' ? 'ltr' : 'rtl' }}
      >
        {language === 'ar' ? inst.nameEn : inst.nameAr}
      </div>
    </div>
  );
}

export const InstrumentNode = React.memo(InstrumentNodeInner);
