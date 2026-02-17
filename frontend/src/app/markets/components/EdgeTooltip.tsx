import React from 'react';
import { C } from './constants';
import type { EdgeLabel } from '@/lib/market-graph';

// ---------------------------------------------------------------------------
// EdgeTooltip - hover tooltip for correlation edges
// ---------------------------------------------------------------------------

export interface EdgeTooltipProps {
  edge: EdgeLabel;
  x: number;
  y: number;
  t: (ar: string, en: string) => string;
  isRTL: boolean;
}

function EdgeTooltipInner({ edge, x, y, t, isRTL }: EdgeTooltipProps) {
  const color = edge.rho > 0 ? C.gold : C.cyan;
  const dirLabel =
    edge.rho > 0
      ? t(
          '\u064A\u062A\u062D\u0631\u0643\u0627\u0646 \u0641\u064A \u0646\u0641\u0633 \u0627\u0644\u0627\u062A\u062C\u0627\u0647',
          'Move together',
        )
      : t(
          '\u064A\u062A\u062D\u0631\u0643\u0627\u0646 \u0628\u0634\u0643\u0644 \u0639\u0643\u0633\u064A',
          'Move inversely',
        );

  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 rounded-[10px] z-30"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -130%)',
        background: C.surface,
        border: `1px solid ${color}55`,
        padding: '10px 14px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${color}10`,
        minWidth: 175,
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-mono text-xs font-semibold text-[--text-primary]">
          {edge.from} \u2194 {edge.to}
        </span>
        <span
          className="font-mono text-[9px] rounded px-1.5 py-px"
          style={{ color, background: `${color}18` }}
        >
          {edge.rho > 0 ? '+' : '\u2212'}
          {edge.pct}%
        </span>
      </div>
      <div className="font-arabic text-xs leading-relaxed mb-1.5 text-[--text-secondary]">
        <span style={{ color }}>
          {t('\u0627\u0631\u062A\u0628\u0627\u0637', 'Corr.')} {edge.pct}%
        </span>{' '}
        \u2014 {dirLabel}
      </div>
      <div className="flex gap-3.5">
        <div>
          <div className="font-mono text-[8px] text-[--text-muted]">
            {t('\u0627\u0644\u0627\u0631\u062A\u0628\u0627\u0637 (\u03C1)', 'Correlation (\u03C1)')}
          </div>
          <div className="font-mono text-[13px] font-semibold" style={{ color }}>
            {edge.rho > 0 ? '+' : ''}
            {edge.rho.toFixed(3)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[8px] text-[--text-muted]">
            {t('\u0627\u0644\u062A\u0641\u0633\u064A\u0631 (R\u00B2)', 'Explained (R\u00B2)')}
          </div>
          <div className="font-mono text-[13px] font-semibold text-[--text-secondary]">
            {(edge.r2 * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export const EdgeTooltip = React.memo(EdgeTooltipInner);
