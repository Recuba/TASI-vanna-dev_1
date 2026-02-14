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
import { useLanguage } from '@/providers/LanguageProvider';
import { getOHLCVData } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERIES_COLORS = ['#D4A84B', '#2196F3', '#4CAF50', '#F44336', '#9C27B0'];

const PERIODS = [
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
] as const;

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

async function fetchOHLCV(ticker: string, period: string, signal?: AbortSignal): Promise<OHLCVItem[]> {
  try {
    const json = await getOHLCVData(ticker, { period }, signal);
    return json.data ?? [];
  } catch {
    return [];
  }
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
  const { t } = useLanguage();
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
  const fetchControllerRef = useRef<AbortController | null>(null);

  const buildChart = useCallback(async () => {
    const container = containerRef.current;
    if (!container || tickers.length === 0) return;

    // Abort previous fetch
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchControllerRef.current = controller;

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
        tickers.map((ticker) => fetchOHLCV(ticker, period, controller.signal)),
      );

      if (controller.signal.aborted) return;

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
        setError(t('لا توجد بيانات للأسهم المختارة.', 'No data available for the selected stocks.'));
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
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (controller.signal.aborted) return;
      setError(t('فشل تحميل بيانات المقارنة.', 'Failed to load comparison data.'));
      setLoading(false);
    }
  }, [tickers, period, height, t]);

  useEffect(() => {
    buildChart();
    return () => {
      fetchControllerRef.current?.abort();
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
        className="flex items-center justify-center rounded-xl dark:bg-[#1A1A1A] bg-gray-50"
        style={{ height, border: '1px solid rgba(212,168,75,0.1)' }}
      >
        <p className="text-sm text-[var(--text-muted)]">
          {t('اختر أسهم للمقارنة (حتى 5)', 'Select stocks to compare (up to 5)')}
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
        className="flex flex-col items-center justify-center gap-3 rounded-xl dark:bg-[#1A1A1A] bg-gray-50"
        style={{ height, border: '1px solid rgba(212,168,75,0.1)' }}
      >
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={buildChart}
          className="px-4 py-1.5 text-xs font-medium rounded-md border transition-all duration-200 hover:bg-[rgba(212,168,75,0.1)]"
          style={{
            border: '1px solid #D4A84B',
            background: 'transparent',
            color: '#D4A84B',
          }}
        >
          {t('إعادة المحاولة', 'Retry')}
        </button>
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
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-wrap gap-2 dark:bg-[#2A2A2A] bg-gray-100"
        style={{
          borderBottom: '1px solid rgba(212, 168, 75, 0.1)',
        }}
      >
        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {loadedTickers.map((ticker, i) => (
            <div key={ticker} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-[3px] rounded-full"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="text-xs font-medium" style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
                {ticker}
              </span>
            </div>
          ))}
          <span className="text-[10px] dark:text-[#606060] text-gray-400">{t('أساس 100', 'Base 100')}</span>
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
      <div ref={containerRef} className="dark:bg-[#1A1A1A] bg-white" style={{ height }} />
    </div>
  );
}

export default StockComparisonChartInner;
