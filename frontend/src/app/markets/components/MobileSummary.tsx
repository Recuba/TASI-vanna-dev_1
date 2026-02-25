import React from 'react';
import { C, pctFmt } from './constants';
import { MobileCard } from './MobileCard';
import type { Instrument, CorrelationEdge, PortfolioStats } from '@/lib/market-graph';

// ---------------------------------------------------------------------------
// MobileSummary - mobile summary card, instrument grid, and top correlations
// ---------------------------------------------------------------------------

export interface MobileSummaryProps {
  instruments: Instrument[];
  edges: CorrelationEdge[];
  stats: PortfolioStats;
  language: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}

function MobileSummaryInner({
  instruments,
  edges,
  stats,
  language,
  t,
}: MobileSummaryProps) {
  return (
    <div className="lg:hidden">
      {/* Summary card */}
      <div className="rounded-xl p-4 mb-4 bg-[#1A1A1A] border border-[#2A2A2A]">
        <div className="flex items-center justify-between mb-3">
          <span className="font-arabic text-sm font-semibold text-[--text-primary]">
            {t('\u0645\u0644\u062E\u0635 \u0627\u0644\u0633\u0648\u0642', 'Market Summary')}
          </span>
          <span
            className="font-mono text-sm font-semibold"
            style={{ color: stats.avgReturn > 0 ? C.green : stats.avgReturn < 0 ? C.red : C.gold }}
          >
            {stats.avgReturn > 0 ? '+' : ''}
            {stats.avgReturn.toFixed(2)}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="font-mono text-xs font-semibold text-[--text-primary]">
              {stats.advancing}/{instruments.length}
            </div>
            <div className="font-mono text-[12.5px] text-[--text-muted]">
              {t('\u0635\u0627\u0639\u062F/\u0647\u0627\u0628\u0637', 'Adv/Dec')}
            </div>
          </div>
          <div>
            <div
              className="font-mono text-xs font-semibold"
              style={{ color: stats.diversification > 0.5 ? C.green : C.gold }}
            >
              {pctFmt(stats.diversification)}
            </div>
            <div className="font-mono text-[12.5px] text-[--text-muted]">
              {t('\u0627\u0644\u062A\u0646\u0648\u0639', 'Diversification')}
            </div>
          </div>
          <div>
            <div className="font-mono text-xs font-semibold text-[--text-secondary]">
              {Math.round(stats.avgAbsCorr * 100)}%
            </div>
            <div className="font-mono text-[12.5px] text-[--text-muted]">
              {t('\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0627\u0631\u062A\u0628\u0627\u0637', 'Avg Corr')}
            </div>
          </div>
        </div>
      </div>

      {/* Instrument cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {instruments.map((inst) => (
          <MobileCard key={inst.key} inst={inst} language={language} />
        ))}
      </div>

      {/* Top correlations */}
      {edges.length > 0 && (
        <div className="rounded-xl p-4 mt-4 bg-[#1A1A1A] border border-[#2A2A2A]">
          <h3 className="font-arabic text-sm font-semibold mb-3 text-[--text-primary]">
            {t('\u0623\u0642\u0648\u0649 \u0627\u0644\u0627\u0631\u062A\u0628\u0627\u0637\u0627\u062A', 'Strongest Correlations')}
          </h3>
          <div className="space-y-2">
            {edges.slice(0, 5).map((edge, i) => {
              const color = edge.rho > 0 ? C.gold : C.cyan;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between py-1.5 ${i < 4 ? 'border-b border-[#2A2A2A]' : ''}`}
                >
                  <span className="font-mono text-xs text-[--text-primary]">
                    {edge.from} \u2194 {edge.to}
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-16 h-1 rounded-full overflow-hidden"
                      style={{ background: `${color}20` }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${edge.pct}%`,
                          background: color,
                        }}
                      />
                    </div>
                    <span className="font-mono text-[14.5px] font-semibold w-12 text-end" style={{ color }}>
                      {edge.rho > 0 ? '+' : '\u2212'}
                      {edge.pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const MobileSummary = React.memo(MobileSummaryInner);
