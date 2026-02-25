import React from 'react';
import { cn } from '@/lib/utils';
import { C, fmt, pctFmt } from './constants';
import { Sparkline } from './Sparkline';
import { StatBadge } from './StatBadge';
import type { Instrument } from '@/lib/market-graph';

// ---------------------------------------------------------------------------
// MobileCard - simplified card for small screens
// ---------------------------------------------------------------------------

export interface MobileCardProps {
  inst: Instrument;
  language: 'ar' | 'en';
}

function MobileCardInner({ inst, language }: MobileCardProps) {
  const change = inst.change ?? 0;
  const vol = inst.vol ?? 0;
  const beta = inst.beta ?? 0;
  const sharpe = inst.sharpe ?? 0;
  const positive = change >= 0;
  const accent = positive ? C.green : C.red;
  const bgTint = positive ? C.greenDim : C.redDim;

  return (
    <div
      className="rounded-xl p-3.5 transition-colors border border-[#2A2A2A] bg-[#1A1A1A]"
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 4px ${accent}66` }}
          />
          <span
            className={cn(
              language === 'ar' ? 'font-arabic' : 'font-mono',
              'text-sm font-semibold text-[--text-primary]',
            )}
          >
            {language === 'ar' ? inst.nameAr : inst.nameEn}
          </span>
        </div>
        <span
          className="font-mono text-[12.5px] rounded px-1.5 py-px text-[--text-secondary]"
          style={{ background: bgTint }}
        >
          {inst.key}
        </span>
      </div>

      <div className="flex justify-between items-baseline mb-2">
        <span className="font-mono text-base font-semibold text-[--text-primary]">
          {fmt(inst.value)}
        </span>
        <span className="font-mono text-xs font-medium" style={{ color: accent }}>
          {positive ? '\u25B2' : '\u25BC'} {positive ? '+' : ''}
          {change.toFixed(2)}%
        </span>
      </div>

      <div className="flex justify-center mb-2">
        <Sparkline data={inst.sparkline} positive={positive} width={140} height={28} />
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-[#2A2A2A]">
        <StatBadge label="\u03C3" value={pctFmt(vol)} />
        <StatBadge label="\u03B2" value={beta.toFixed(2)} />
        <StatBadge label="SR" value={sharpe.toFixed(2)} />
        <span
          className={cn(
            language === 'ar' ? 'font-mono' : 'font-arabic',
            'text-[11.5px] text-[--text-muted]',
          )}
          style={{ direction: language === 'ar' ? 'ltr' : 'rtl' }}
        >
          {language === 'ar' ? inst.nameEn : inst.nameAr}
        </span>
      </div>
    </div>
  );
}

export const MobileCard = React.memo(MobileCardInner);
