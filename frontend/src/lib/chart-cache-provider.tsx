'use client';

import { SWRConfig } from 'swr';
import { chartCacheConfig } from './chart-cache';

export function ChartCacheProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={chartCacheConfig}>{children}</SWRConfig>;
}
