'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts';
import { RAID_CHART_OPTIONS } from './chart-config';
import { ChartSkeleton } from './ChartSkeleton';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERIES_COLORS = ['#D4A84B', '#2196F3', '#4CAF50', '#F44336', '#9C27B0'];

const PERIODS = [
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
] as const;

const API_BASE = '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OHLCVItem {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface StockComparisonChartProps {
  tickers: string[];
  height?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchOHLCV(ticker: string, period: string): Promise<OHLCVItem[]> {
  const url = `${API_BASE}/api/v1/charts/${encodeURIComponent(ticker)}/ohlcv?period=${encodeURIComponent(period)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

/** Normalize close prices to base 100 (first close = 100). */
function normalizeToBase100(data: OHLCVItem[]): LineData[] {
  if (data.length === 0) return [];
  const base = data[0].close;
  if (base === 0) return [];
  return data.map((d) => ({
    time: d.time as Time,
    value: (d.close / base) * 100,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function StockComparisonChartInner({
  tickers,
  height = 500,
  className,
}: StockComparisonChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const observerRef = useRef<ResizeObserver | null>(null);

  const [period, setPeriod] = useState<string>('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartVisible, setChartVisible] = useState(false);

  // Track which tickers actually have data
  const [loadedTickers, setLoadedTickers] = useState<string[]>([]);

  const buildChart = useCallback(async () => {
    const container = containerRef.current;
    if (!container || tickers.length === 0) return;

    // Clean up previous chart
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    seriesRefs.current = [];
    setChartVisible(false);
    setLoading(true);
    setError(null);

    try {
      // Fetch all tickers in parallel
      const results = await Promise.all(
        tickers.map((t) => fetchOHLCV(t, period)),
      );

      const validTickers: string[] = [];
      const normalizedSets: LineData[][] = [];
      for (let i = 0; i < tickers.length; i++) {
        const normalized = normalizeToBase100(results[i]);
        if (normalized.length > 0) {
          validTickers.push(tickers[i]);
          normalizedSets.push(normalized);
        }
      }

      if (validTickers.length === 0) {
        setError('No data available for the selected stocks.');
        setLoading(false);
        return;
      }

      setLoadedTickers(validTickers);

      // Create chart
      const chart = createChart(container, {
        ...RAID_CHART_OPTIONS,
        width: container.clientWidth,
        height,
        layout: {
          ...RAID_CHART_OPTIONS.layout,
          background: { type: ColorType.Solid, color: 'transparent' },
        },
      });
      chartRef.current = chart;

      // Add line series for each ticker
      for (let i = 0; i < validTickers.length; i++) {
        const color = SERIES_COLORS[i % SERIES_COLORS.length];
        const series = chart.addLineSeries({
          color,
          lineWidth: 2,
          priceFormat: { type: 'custom', formatter: (v: number) => v.toFixed(1) },
        });
        series.setData(normalizedSets[i]);
        seriesRefs.current.push(series);
      }

      chart.timeScale().fitContent();

      // Resize observer
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      observer.observe(container);
      observerRef.current = observer;

      setLoading(false);
      requestAnimationFrame(() => setChartVisible(true));
    } catch {
      setError('Failed to load comparison data.');
      setLoading(false);
    }
  }, [tickers, period, height]);

  useEffect(() => {
    buildChart();
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      seriesRefs.current = [];
    };
  }, [buildChart]);

  if (tickers.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl"
        style={{ height, background: '#1A1A1A', border: '1px solid rgba(212,168,75,0.1)' }}
      >
        <p className="text-sm text-[var(--text-muted)]">
          Select stocks to compare (up to 5)
        </p>
      </div>
    );
  }

  if (loading) {
    return <ChartSkeleton height={height} />;
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl"
        style={{ height, background: '#1A1A1A', border: '1px solid rgba(212,168,75,0.1)' }}
      >
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div
      dir="ltr"
      className={cn(
        'rounded-xl overflow-hidden transition-opacity duration-500',
        chartVisible ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={{
        border: '1px solid rgba(212, 168, 75, 0.1)',
        background: '#1A1A1A',
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-wrap gap-2"
        style={{
          background: '#2A2A2A',
          borderBottom: '1px solid rgba(212, 168, 75, 0.1)',
        }}
      >
        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {loadedTickers.map((t, i) => (
            <div key={t} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-[3px] rounded-full"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="text-xs font-medium" style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
                {t}
              </span>
            </div>
          ))}
          <span className="text-[10px] text-[#606060]">Base 100</span>
        </div>

        {/* Period selector */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ background: 'rgba(212, 168, 75, 0.05)' }}
        >
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-200',
                period === p.value ? 'shadow-sm' : 'hover:text-[#D4A84B]',
              )}
              style={{
                background: period === p.value ? 'rgba(212, 168, 75, 0.2)' : 'transparent',
                color: period === p.value ? '#D4A84B' : '#707070',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}

export default StockComparisonChartInner;
