'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts';
import {
  RAID_CHART_OPTIONS,
  CANDLE_COLORS,
  VOLUME_UP_COLOR,
  VOLUME_DOWN_COLOR,
  MA20_COLOR,
  MA50_COLOR,
} from './chart-config';
import type { OHLCVData, ChartTimeRange } from './chart-types';
import { formatVolume } from '@/lib/formatters';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from './ChartSkeleton';
import { ChartError } from './ChartError';
import { ChartEmpty } from './ChartEmpty';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CandlestickChartProps {
  data: OHLCVData[];
  height?: number;
  showVolume?: boolean;
  showMA20?: boolean;
  showMA50?: boolean;
  title?: string;
  ticker?: string;
  className?: string;
  loading?: boolean;
  error?: string | null;
  refetch?: () => void;
}

// ---------------------------------------------------------------------------
// Time range definitions
// ---------------------------------------------------------------------------

const TIME_RANGES: { label: string; value: ChartTimeRange }[] = [
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: 'All', value: 'ALL' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateMA(data: OHLCVData[], period: number): LineData[] {
  const result: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
    }
    result.push({ time: data[i].time as Time, value: sum / period });
  }
  return result;
}

function filterByTimeRange(data: OHLCVData[], range: ChartTimeRange): OHLCVData[] {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CandlestickChart({
  data,
  height = 400,
  showVolume: initialShowVolume = true,
  showMA20: initialMA20 = true,
  showMA50: initialMA50 = true,
  title,
  ticker,
  className,
  loading = false,
  error = null,
  refetch,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const [range, setRange] = useState<ChartTimeRange>('ALL');
  const [showMA20, setShowMA20] = useState(initialMA20);
  const [showMA50, setShowMA50] = useState(initialMA50);
  const [showVolume, setShowVolume] = useState(initialShowVolume);
  const [tooltipData, setTooltipData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // Responsive height: 500 XL, 400 desktop, 300 tablet, 250 mobile
  const [chartHeight, setChartHeight] = useState(height);
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      if (w < 640) {
        setChartHeight(250);
      } else if (w < 1024) {
        setChartHeight(300);
      } else if (w < 1280) {
        setChartHeight(400);
      } else {
        setChartHeight(500);
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  // Build chart once
  const buildChart = useCallback(() => {
    const container = containerRef.current;
    if (!container || chartRef.current) return;

    const isRTL = document.documentElement.dir === 'rtl';
    const chart = createChart(container, {
      ...RAID_CHART_OPTIONS,
      width: container.clientWidth,
      height: chartHeight,
      rightPriceScale: {
        ...RAID_CHART_OPTIONS.rightPriceScale,
        visible: !isRTL,
      },
      leftPriceScale: {
        visible: isRTL,
        borderColor: 'rgba(212, 168, 75, 0.15)',
      },
    });

    // Candlestick series
    const candle = chart.addCandlestickSeries({
      ...CANDLE_COLORS,
    });
    candleRef.current = candle;

    // Volume histogram on a separate price scale
    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeRef.current = volume;

    // MA20 line
    const ma20 = chart.addLineSeries({
      color: MA20_COLOR,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ma20Ref.current = ma20;

    // MA50 line
    const ma50 = chart.addLineSeries({
      color: MA50_COLOR,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ma50Ref.current = ma50;

    // Crosshair tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setTooltipData(null);
        return;
      }
      const cd = param.seriesData.get(candle) as CandlestickData | undefined;
      if (cd) {
        const volEntry = param.seriesData.get(volume) as HistogramData | undefined;
        setTooltipData({
          time: String(param.time),
          open: cd.open,
          high: cd.high,
          low: cd.low,
          close: cd.close,
          volume: volEntry?.value ?? 0,
        });
      }
    });

    chartRef.current = chart;

    // ResizeObserver
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);
    observerRef.current = observer;
  }, [chartHeight]);

  // Create chart on mount, destroy on unmount
  useEffect(() => {
    if (!loading && data.length > 0) {
      buildChart();
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleRef.current = null;
        volumeRef.current = null;
        ma20Ref.current = null;
        ma50Ref.current = null;
      }
    };
  }, [loading, data.length > 0, buildChart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update chart height when responsive size changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height: chartHeight });
    }
  }, [chartHeight]);

  // Update series data when data, range, or toggles change
  useEffect(() => {
    if (!candleRef.current || loading) return;

    const filtered = filterByTimeRange(data, range);

    // Candlestick data
    const candleData: CandlestickData[] = filtered.map((d) => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleRef.current.setData(candleData);

    // Volume data
    if (volumeRef.current) {
      if (showVolume) {
        const volData: HistogramData[] = filtered.map((d) => ({
          time: d.time as Time,
          value: d.volume ?? 0,
          color: d.close >= d.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
        }));
        volumeRef.current.setData(volData);
      } else {
        volumeRef.current.setData([]);
      }
    }

    // MA lines
    if (ma20Ref.current) {
      ma20Ref.current.setData(showMA20 ? calculateMA(filtered, 20) : []);
    }
    if (ma50Ref.current) {
      ma50Ref.current.setData(showMA50 ? calculateMA(filtered, 50) : []);
    }

    // Fit content to visible range
    chartRef.current?.timeScale().fitContent();
  }, [data, range, showMA20, showMA50, showVolume, loading]);

  // Loading state
  if (loading && (!data || data.length === 0)) {
    return <ChartSkeleton height={chartHeight} />;
  }

  // Error state
  if (error) {
    return <ChartError height={chartHeight} message={error} onRetry={refetch} />;
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <ChartEmpty
        height={chartHeight}
        message={ticker ? `No data available for ${ticker}` : 'No chart data available'}
      />
    );
  }

  return (
    <div
      dir="ltr"
      className={cn('rounded-xl overflow-hidden border border-gold/10 dark:bg-dark-card bg-white', className)}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 dark:bg-dark-input bg-gray-100 border-b border-gold/10"
      >
        {/* Left: Title / ticker */}
        <div className="flex items-center gap-2">
          {ticker && (
            <span className="text-sm font-bold text-gold">
              {ticker}
            </span>
          )}
          {title && !ticker && (
            <span className="text-sm font-medium text-text-secondary">
              {title}
            </span>
          )}
          {title && ticker && (
            <span className="text-xs text-[#707070]">
              {title}
            </span>
          )}
        </div>

        {/* Right: Toggles + Time range */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* MA toggles */}
          <button
            onClick={() => setShowMA20((v) => !v)}
            className={cn(
              'text-xs px-2 py-0.5 rounded transition-colors hover:text-gold',
              showMA20 ? 'bg-gold/20 text-gold' : 'bg-transparent text-[#707070]',
            )}
          >
            MA20
          </button>
          <button
            onClick={() => setShowMA50((v) => !v)}
            className={cn(
              'text-xs px-2 py-0.5 rounded transition-colors hover:text-accent-blue',
              showMA50 ? 'bg-accent-blue/20 text-accent-blue' : 'bg-transparent text-[#707070]',
            )}
          >
            MA50
          </button>
          <button
            onClick={() => setShowVolume((v) => !v)}
            className={cn(
              'text-xs px-2 py-0.5 rounded transition-colors hover:text-gold',
              showVolume ? 'bg-gold/20 text-gold' : 'bg-transparent text-[#707070]',
            )}
          >
            Vol
          </button>

          {/* Separator */}
          <span
            className="w-px h-4 mx-0.5 bg-gold/[0.15]"
          />

          {/* Time range buttons */}
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setRange(tr.value)}
              className={cn(
                'text-xs px-1.5 py-0.5 rounded transition-colors hover:text-gold',
                range === tr.value
                  ? 'bg-gold/20 text-gold font-medium'
                  : 'bg-transparent text-[#707070] font-normal',
              )}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Crosshair tooltip bar */}
      {tooltipData && (
        <div
          className="flex items-center gap-4 px-3 py-1 text-xs dark:bg-dark-card bg-gray-50 border-b border-gold/10 text-text-secondary"
        >
          <span>
            O{' '}
            <span className="text-[#E0E0E0]">
              {tooltipData.open.toFixed(2)}
            </span>
          </span>
          <span>
            H{' '}
            <span className="text-accent-green">
              {tooltipData.high.toFixed(2)}
            </span>
          </span>
          <span>
            L{' '}
            <span className="text-accent-red">
              {tooltipData.low.toFixed(2)}
            </span>
          </span>
          <span>
            C{' '}
            <span
              className={tooltipData.close >= tooltipData.open ? 'text-accent-green' : 'text-accent-red'}
            >
              {tooltipData.close.toFixed(2)}
            </span>
          </span>
          <span>
            Vol{' '}
            <span className="text-text-secondary">
              {formatVolume(tooltipData.volume)}
            </span>
          </span>
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} style={{ height: chartHeight }} />
    </div>
  );
}

// SSR-safe dynamic wrapper -- pages should import this default export
export default dynamic(() => Promise.resolve(CandlestickChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={400} />,
});
