'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { DataSource } from './chart-types';

interface DataSourceBadgeProps {
  source: DataSource | null;
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

export function DataSourceBadge({ source, className }: DataSourceBadgeProps) {
  const descId = useId();

  if (!source) return null;

  const config = BADGE_CONFIG[source];
  if (!config) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none tracking-wide select-none',
        className,
      )}
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
  );
}
