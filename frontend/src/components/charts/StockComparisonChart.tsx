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
  { label: '1D', value: '1d', intraday: true },
  { label: '1W', value: '5d', intraday: true },
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
  const [tooltipData, setTooltipData] = useState<{
    time: string;
    values: { ticker: string; value: number; color: string }[];
  } | null>(null);

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

      // Crosshair tooltip
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          setTooltipData(null);
          return;
        }
        const values: { ticker: string; value: number; color: string }[] = [];
        for (let i = 0; i < seriesRefs.current.length; i++) {
          const lineData = param.seriesData.get(seriesRefs.current[i]) as
            | { value?: number }
            | undefined;
          if (lineData && lineData.value !== undefined) {
            values.push({
              ticker: validTickers[i],
              value: lineData.value,
              color: SERIES_COLORS[i % SERIES_COLORS.length],
            });
          }
        }
        if (values.length > 0) {
          setTooltipData({ time: String(param.time), values });
        } else {
          setTooltipData(null);
        }
      });

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
        className="flex items-center justify-center rounded-xl dark:bg-dark-card bg-gray-50 border border-gold/10"
        style={{ height }}
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
        className="flex flex-col items-center justify-center gap-3 rounded-xl dark:bg-dark-card bg-gray-50 border border-gold/10"
        style={{ height }}
      >
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={buildChart}
          className="px-4 py-1.5 text-xs font-medium rounded-md border border-gold bg-transparent text-gold transition-all duration-200 hover:bg-gold/10"
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
        'rounded-xl overflow-hidden transition-opacity duration-500 border border-gold/10',
        chartVisible ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-wrap gap-2 dark:bg-dark-input bg-gray-100 border-b border-gold/10"
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
          <span className="text-[13.5px] dark:text-[#606060] text-gray-400">{t('أساس 100', 'Base 100')}</span>
        </div>

        {/* Period selector */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gold/5"
        >
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              title={'intraday' in p && p.intraday ? t('قريبا', 'Coming soon') : undefined}
              aria-label={`${t('فترة', 'Period')} ${p.label}`}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-200',
                period === p.value
                  ? 'bg-gold/20 text-gold shadow-sm'
                  : 'bg-transparent text-[#707070] hover:text-gold',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Crosshair tooltip bar */}
      <div
        className="flex items-center gap-4 px-3 py-1 text-xs min-h-[24px] dark:bg-dark-card bg-gray-50 border-b border-gold/10 text-gray-500 dark:text-[#808080]"
      >
        {tooltipData ? (
          <>
            <span className="font-medium text-gold">
              {tooltipData.time}
            </span>
            {tooltipData.values.map((v) => (
              <span key={v.ticker}>
                <span style={{ color: v.color }}>{v.ticker}</span>{' '}
                <span className="text-[#E0E0E0]">{v.value.toFixed(1)}</span>
              </span>
            ))}
          </>
        ) : (
          <span className="text-[#505050]">
            {t('مرر المؤشر فوق الرسم البياني لعرض التفاصيل', 'Hover over chart for details')}
          </span>
        )}
      </div>

      {/* Chart container */}
      <div ref={containerRef} role="img" aria-label={t('رسم بياني مقارنة الأسهم', 'Stock comparison chart')} className="dark:bg-dark-card bg-white" style={{ height }} />
    </div>
  );
}

export default StockComparisonChartInner;
