import React from 'react';
import { cn } from '@/lib/utils';
import { C, pctFmt } from './constants';
import type { PortfolioStats, CorrelationEdge } from '@/lib/market-graph';

// ---------------------------------------------------------------------------
// MarketHeader - title, subtitle, connection status, and summary stats
// ---------------------------------------------------------------------------

export interface MarketHeaderProps {
  stats: PortfolioStats;
  edges: CorrelationEdge[];
  loaded: boolean;
  connectionStatus: 'live' | 'stale' | 'offline';
  lastUpdated: Date | null;
  time: Date;
  formatTime: (d: Date) => string;
  formatDate: (d: Date) => string;
  onRefresh?: () => void;
  t: (ar: string, en: string) => string;
}

function MarketHeaderInner({
  stats,
  edges,
  loaded,
  connectionStatus,
  lastUpdated,
  time,
  formatTime,
  formatDate,
  onRefresh,
  t,
}: MarketHeaderProps) {
  const statusColor =
    connectionStatus === 'live' ? C.green : connectionStatus === 'stale' ? '#F59E0B' : C.red;
  const statusLabel =
    connectionStatus === 'live' ? 'LIVE' : connectionStatus === 'stale' ? 'STALE' : 'OFFLINE';

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row justify-between items-start gap-4 mb-4',
        loaded ? 'animate-fade-in-up' : 'opacity-0',
      )}
    >
      <div>
        <h1 className="text-2xl sm:text-[30px] font-bold leading-tight text-[--text-primary]">
          {t('\u0646\u0638\u0631\u0629 360\u00B0', 'Market Overview 360\u00B0')}
        </h1>
        <p
          className="font-mono text-xs mt-1 text-start"
          style={{ color: C.textSecondary, direction: 'ltr' }}
        >
          <span className="text-gold">{t('\u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629', 'World Markets')}</span>
          <span className="mx-2 text-[--text-muted]">{'\u00B7'}</span>
          {t('World Markets', '\u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629')}
        </p>
        <p className="font-arabic text-xs mt-2 max-w-lg leading-relaxed text-[--text-muted]">
          {t(
            '\u0627\u0644\u062E\u0637\u0648\u0637 \u062A\u064F\u0638\u0647\u0631 \u0646\u0633\u0628\u0629 \u0627\u0644\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u064A\u0646 \u0627\u0644\u0623\u0635\u0648\u0644 \u2014 \u0643\u0644\u0645\u0627 \u0632\u0627\u062F\u062A \u0627\u0644\u0646\u0633\u0628\u0629\u060C \u0632\u0627\u062F \u062A\u062D\u0631\u0643\u0647\u0645\u0627 \u0645\u0639\u0627\u064B. \u0645\u0631\u0651\u0631 \u0639\u0644\u0649 \u0623\u064A \u062E\u0637 \u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0623\u0643\u062B\u0631.',
            'Lines show correlation % between assets \u2014 the higher the percentage, the more they move together. Hover on any line for details.',
          )}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0" style={{ direction: 'ltr' }}>
        <div className="font-mono text-[10px] flex items-center gap-1.5 text-[--text-muted]">
          {/* Connection status badge */}
          <span
            className="font-mono text-[9px] font-bold px-1.5 py-px rounded"
            style={{
              color: statusColor,
              background: `${statusColor}18`,
              border: `1px solid ${statusColor}40`,
            }}
          >
            {statusLabel}
          </span>
          <div
            className="w-[5px] h-[5px] rounded-full"
            style={{
              background: statusColor,
              boxShadow: connectionStatus === 'live' ? `0 0 5px ${statusColor}88` : 'none',
              animation: connectionStatus === 'live' ? 'statusPulse 2s ease-in-out infinite' : 'none',
            }}
          />
          {formatTime(lastUpdated ?? time)}
          <span>{'\u00B7'}</span>
          {formatDate(lastUpdated ?? time)}
          {/* Refresh button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="ms-1 p-0.5 rounded hover:opacity-80 transition-opacity text-[--text-muted]"
              title={t('\u062A\u062D\u062F\u064A\u062B', 'Refresh')}
              aria-label={t('\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A', 'Refresh data')}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1v5h5" />
                <path d="M3.51 10a6 6 0 1 0 .74-6.47L1 6" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex gap-3 font-mono text-[9px] text-[--text-muted]">
          <span>Avg Corr = {Math.round(stats.avgAbsCorr * 100)}%</span>
          <span>{'\u03C3\u0304'} = {pctFmt(stats.avgVol)}</span>
          <span>{edges.length} links</span>
        </div>
      </div>
    </div>
  );
}

export const MarketHeader = React.memo(MarketHeaderInner);
