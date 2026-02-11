'use client';

import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { DataSource } from './chart-types';

interface DataSourceBadgeProps {
  source: DataSource | null;
  lastUpdated?: string;
  className?: string;
}

const BADGE_CONFIG: Record<DataSource, { label: string; bg: string; text: string; description?: string }> = {
  real: {
    label: 'LIVE',
    bg: 'rgba(76, 175, 80, 0.15)',
    text: '#4CAF50',
  },
  mock: {
    label: 'SAMPLE',
    bg: 'rgba(255, 167, 38, 0.15)',
    text: '#FFA726',
    description: 'Fallback data \u2014 real market data unavailable',
  },
  cached: {
    label: 'CACHED',
    bg: 'rgba(74, 159, 255, 0.15)',
    text: '#4A9FFF',
    description: 'Data from cache \u2014 may be slightly delayed',
  },
};

function formatTimeAgo(dateStr: string): { en: string; ar: string } | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return { en: 'Updated just now', ar: '\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0622\u0646' };
    if (diffMin < 60) return {
      en: `Updated ${diffMin} min ago`,
      ar: `\u062A\u062D\u062F\u064A\u062B \u0645\u0646\u0630 ${diffMin} \u062F\u0642\u0627\u0626\u0642`,
    };

    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return {
      en: `Updated ${diffHrs}h ago`,
      ar: `\u062A\u062D\u062F\u064A\u062B \u0645\u0646\u0630 ${diffHrs} \u0633\u0627\u0639\u0627\u062A`,
    };

    const diffDays = Math.floor(diffHrs / 24);
    return {
      en: `Updated ${diffDays}d ago`,
      ar: `\u062A\u062D\u062F\u064A\u062B \u0645\u0646\u0630 ${diffDays} \u0623\u064A\u0627\u0645`,
    };
  } catch {
    return null;
  }
}

export function DataSourceBadge({ source, lastUpdated, className }: DataSourceBadgeProps) {
  const descId = useId();

  const timeAgo = useMemo(
    () => (lastUpdated ? formatTimeAgo(lastUpdated) : null),
    [lastUpdated],
  );

  if (!source) return null;

  const config = BADGE_CONFIG[source];
  if (!config) return null;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none tracking-wide select-none"
        style={{ backgroundColor: config.bg, color: config.text }}
        aria-label={`Data source: ${config.label}`}
        aria-describedby={config.description ? descId : undefined}
      >
        {config.label}
        {config.description && (
          <span
            id={descId}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              borderWidth: 0,
            }}
          >
            {config.description}
          </span>
        )}
      </span>
      {timeAgo && (
        <span
          className="text-[10px] leading-none select-none"
          style={{ color: '#606060' }}
          title={timeAgo.ar}
        >
          {timeAgo.en}
        </span>
      )}
    </span>
  );
}
