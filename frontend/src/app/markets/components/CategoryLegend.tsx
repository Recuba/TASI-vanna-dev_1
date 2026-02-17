import React from 'react';
import { cn } from '@/lib/utils';
import { C, LEGEND_ITEMS } from './constants';

// ---------------------------------------------------------------------------
// CategoryLegend - legend items + correlation type indicators + explainer
// ---------------------------------------------------------------------------

export interface CategoryLegendProps {
  language: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}

function CategoryLegendInner({ language, t }: CategoryLegendProps) {
  return (
    <>
      {/* Legend */}
      <div className="flex gap-4 py-3 justify-center flex-wrap items-center">
        {LEGEND_ITEMS.map((c) => (
          <div key={c.labelEn} className="flex items-center gap-1.5">
            <div
              className="w-[7px] h-[7px] rounded-sm opacity-70"
              style={{ background: c.color }}
            />
            <span
              className={cn(
                language === 'ar' ? 'font-arabic' : 'font-mono',
                'text-[11px] text-[--text-secondary]',
              )}
            >
              {t(c.labelAr, c.labelEn)}
            </span>
            <span
              className={cn(
                language === 'ar' ? 'font-mono' : 'font-arabic',
                'text-[9px] text-[--text-muted]',
              )}
            >
              {t(c.labelEn, c.labelAr)}
            </span>
          </div>
        ))}
        <div className="w-px h-3.5 bg-[#2A2A2A]" />
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-0.5 rounded-sm bg-gold" />
          <span className="font-mono text-[9px] text-[--text-muted]">
            {t('\u0627\u0631\u062A\u0628\u0627\u0637 \u0625\u064A\u062C\u0627\u0628\u064A', 'Positive corr.')}
          </span>
          <span className="font-mono text-[8px] opacity-50 text-[--text-muted]">
            {'+\u03C1'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-0.5 rounded-sm" style={{ background: C.cyan }} />
          <span className="font-mono text-[9px] text-[--text-muted]">
            {t('\u0627\u0631\u062A\u0628\u0627\u0637 \u0639\u0643\u0633\u064A', 'Inverse corr.')}
          </span>
          <span className="font-mono text-[8px] opacity-50 text-[--text-muted]">
            {'\u2212\u03C1'}
          </span>
        </div>
      </div>

      {/* Explainer */}
      <div className="text-center pb-4 max-w-3xl mx-auto">
        <p className="font-arabic text-xs leading-relaxed mb-2 text-[--text-muted]">
          {t(
            '\u0627\u0644\u0646\u0633\u0628 \u0639\u0644\u0649 \u0627\u0644\u062E\u0637\u0648\u0637 \u062A\u064F\u0638\u0647\u0631 \u0645\u062F\u0649 \u0627\u0631\u062A\u0628\u0627\u0637 \u062D\u0631\u0643\u0629 \u0627\u0644\u0623\u0635\u0648\u0644 \u0628\u0628\u0639\u0636\u0647\u0627 \u2014 \u2197 90% \u062A\u0639\u0646\u064A \u0623\u0646\u0647\u0645\u0627 \u064A\u062A\u062D\u0631\u0643\u0627\u0646 \u0645\u0639\u0627\u064B \u0628\u0646\u0633\u0628\u0629 90%\u060C \u0628\u064A\u0646\u0645\u0627 \u2198 70% \u062A\u0639\u0646\u064A \u0623\u0646\u0647\u0645\u0627 \u064A\u062A\u062D\u0631\u0643\u0627\u0646 \u0628\u0634\u0643\u0644 \u0639\u0643\u0633\u064A \u0628\u0646\u0633\u0628\u0629 70%.',
            'The percentages on lines show how much assets move together \u2014 \u2197 90% means they move together 90% of the time, while \u2198 70% means they move inversely 70% of the time.',
          )}
        </p>
        <div className="flex gap-3.5 justify-center flex-wrap font-mono text-[8px] opacity-50 text-[--text-muted]">
          <span>{'\u03C3'} = {t('\u0627\u0644\u062A\u0642\u0644\u0628 \u0627\u0644\u0633\u0646\u0648\u064A', 'Ann. Volatility')}</span>
          <span>{'\u03B2'} = {t('\u0628\u064A\u062A\u0627 \u0645\u0642\u0627\u0628\u0644 SPX', 'Beta vs SPX')}</span>
          <span>SR = {t('\u0646\u0633\u0628\u0629 \u0634\u0627\u0631\u0628', 'Sharpe Ratio')}</span>
          <span>{'\u03C1'} = {t('\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u064A\u0631\u0633\u0648\u0646', 'Pearson Corr.')}</span>
          <span>R{'\u00B2'} = {t('\u0645\u0639\u0627\u0645\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062F', 'Determination')}</span>
          <span>Div.R = 1{'\u2212'}|{'\u03C1\u0304'}|</span>
        </div>
      </div>
    </>
  );
}

export const CategoryLegend = React.memo(CategoryLegendInner);
