'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type Time,
  ColorType,
} from 'lightweight-charts';
import { RAID_CHART_OPTIONS, LINE_COLOR, AREA_TOP_COLOR, AREA_BOTTOM_COLOR } from './chart-config';
import type { LineDataPoint, ChartTimeRange } from './chart-types';
import { ChartSkeleton } from './ChartSkeleton';
import { ChartError } from './ChartError';
import { ChartEmpty } from './ChartEmpty';
import { cn } from '@/lib/utils';

interface AreaChartProps {
  data: LineDataPoint[];
  height?: number;
  lineColor?: string;
  topColor?: string;
  bottomColor?: string;
  showTimeRange?: boolean;
  title?: string;
  className?: string;
  loading?: boolean;
  error?: string | null;
  refetch?: () => void;
}

const TIME_RANGES: { label: string; value: ChartTimeRange }[] = [
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: 'All', value: 'ALL' },
];

function filterByRange(data: LineDataPoint[], range: ChartTimeRange): LineDataPoint[] {
  if (range === 'ALL' || data.length === 0) return data;

  const now = new Date();
  let cutoff: Date;

  switch (range) {
    case '1W':
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '1M':
      cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case '3M':
      cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case '6M':
      cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      break;
    case '1Y':
      cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    default:
      return data;
  }

  const cutoffStr = cutoff.toISOString().split('T')[0];
  return data.filter((d) => d.time >= cutoffStr);
}

export default function AreaChart({
  data,
  height = 300,
  lineColor = LINE_COLOR,
  topColor = AREA_TOP_COLOR,
  bottomColor = AREA_BOTTOM_COLOR,
  showTimeRange = true,
  title,
  className,
  loading = false,
  error = null,
  refetch,
}: AreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [range, setRange] = useState<ChartTimeRange>('ALL');

  // Create chart once
  useEffect(() => {
    if (!containerRef.current || loading || data.length === 0) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      ...RAID_CHART_OPTIONS,
      width: container.clientWidth,
      height,
      layout: {
        ...RAID_CHART_OPTIONS.layout,
        background: { type: ColorType.Solid, color: 'transparent' },
        attributionLogo: true,
      },
    });

    const series = chart.addAreaSeries({
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: lineColor,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [loading, data.length === 0, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update data when range or data changes
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const filtered = filterByRange(data, range);
    const areaData: AreaData[] = filtered.map((d) => ({
      time: d.time as Time,
      value: d.value,
    }));
    seriesRef.current.setData(areaData);
    seriesRef.current.applyOptions({ lineColor, topColor, bottomColor });
    chartRef.current.timeScale().fitContent();
  }, [data, range, lineColor, topColor, bottomColor]);

  if (loading && (!data || data.length === 0)) return <ChartSkeleton height={height} />;
  if (error) return <ChartError height={height} message={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  return (
    <div
      className={cn('rounded-xl overflow-hidden', className)}
      style={{
        border: '1px solid rgba(212, 168, 75, 0.1)',
        background: '#1A1A1A',
      }}
    >
      {/* Toolbar */}
      {(title || showTimeRange) && (
        <div className="flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: 'rgba(212, 168, 75, 0.1)', background: 'rgba(26, 26, 26, 0.8)' }}
        >
          {title && (
            <span className="text-sm font-medium" style={{ color: '#D4A84B' }}>{title}</span>
          )}
          {!title && <span />}
          {showTimeRange && (
            <div className="flex items-center gap-1">
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.value}
                  onClick={() => setRange(tr.value)}
                  className="text-xs px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    background: range === tr.value ? 'rgba(212, 168, 75, 0.2)' : 'transparent',
                    color: range === tr.value ? '#D4A84B' : '#707070',
                    fontWeight: range === tr.value ? 500 : 400,
                  }}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
