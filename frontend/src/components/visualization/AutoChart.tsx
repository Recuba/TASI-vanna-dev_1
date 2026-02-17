'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { KPICard } from './chart-types';

// Dynamically import recharts-based chart components to avoid bundling recharts in the main chunk
const VisLineChart = dynamic(() => import('./chart-types/LineChart').then(m => ({ default: m.VisLineChart })), { ssr: false });
const VisBarChart = dynamic(() => import('./chart-types/BarChart').then(m => ({ default: m.VisBarChart })), { ssr: false });
const VisPieChart = dynamic(() => import('./chart-types/PieChart').then(m => ({ default: m.VisPieChart })), { ssr: false });
const VisScatterChart = dynamic(() => import('./chart-types/ScatterChart').then(m => ({ default: m.VisScatterChart })), { ssr: false });

export type ChartType = 'line' | 'bar' | 'pie' | 'scatter' | 'kpi';

interface AutoChartProps {
  data: Record<string, unknown>[];
  title?: string;
  chartType?: ChartType;
}

const DATE_PATTERNS = /date|time|timestamp|year|month|day|period/i;
const PROPORTION_PATTERNS = /percent|pct|ratio|share|weight|proportion/i;

function isDateLike(key: string, values: unknown[]): boolean {
  if (DATE_PATTERNS.test(key)) return true;
  // Check if string values look like dates
  const sample = values.find((v) => typeof v === 'string') as string | undefined;
  if (sample && !isNaN(Date.parse(sample))) return true;
  return false;
}

function detectChartType(data: Record<string, unknown>[]): ChartType {
  if (!data || data.length === 0) return 'bar';

  const keys = Object.keys(data[0]);
  const numericKeys = keys.filter((k) =>
    data.some((row) => typeof row[k] === 'number'),
  );
  const stringKeys = keys.filter((k) =>
    data.some((row) => typeof row[k] === 'string'),
  );

  // Single row, single numeric value -> KPI
  if (data.length === 1 && numericKeys.length === 1 && keys.length <= 2) {
    return 'kpi';
  }

  // Check for time series
  const dateKey = keys.find((k) => isDateLike(k, data.map((row) => row[k])));
  if (dateKey && numericKeys.length >= 1) {
    return 'line';
  }

  // Check for proportional data
  if (numericKeys.some((k) => PROPORTION_PATTERNS.test(k))) {
    return 'pie';
  }

  // Two numeric columns, no categorical -> scatter
  if (numericKeys.length >= 2 && stringKeys.length === 0) {
    return 'scatter';
  }

  // One categorical + one or more numeric -> bar
  if (stringKeys.length >= 1 && numericKeys.length >= 1) {
    return 'bar';
  }

  // Small dataset with a label column -> pie
  if (data.length <= 8 && stringKeys.length === 1 && numericKeys.length === 1) {
    return 'pie';
  }

  return 'bar';
}

export function AutoChart({ data, title, chartType }: AutoChartProps) {
  const resolvedType = useMemo(
    () => chartType ?? detectChartType(data),
    [data, chartType],
  );

  if (!data || data.length === 0) return null;

  switch (resolvedType) {
    case 'line':
      return <VisLineChart data={data} title={title} />;
    case 'bar':
      return <VisBarChart data={data} title={title} />;
    case 'pie':
      return <VisPieChart data={data} title={title} />;
    case 'scatter':
      return <VisScatterChart data={data} title={title} />;
    case 'kpi':
      return <KPICard data={data} title={title} />;
    default:
      return <VisBarChart data={data} title={title} />;
  }
}
