'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DataSourceBadge } from './DataSourceBadge';
import type { DataSource } from './chart-types';

interface ChartWrapperProps {
  title?: string;
  source: DataSource | null;
  children: ReactNode;
  className?: string;
}

export function ChartWrapper({ title, source, children, className }: ChartWrapperProps) {
  return (
    <div className={cn('relative', className)}>
      {(title || source) && (
        <div className="flex items-center justify-between mb-2">
          {title && (
            <h2 className="text-sm font-bold text-gold uppercase tracking-wider">{title}</h2>
          )}
          {!title && <span />}
          <DataSourceBadge source={source} />
        </div>
      )}
      {children}
    </div>
  );
}
