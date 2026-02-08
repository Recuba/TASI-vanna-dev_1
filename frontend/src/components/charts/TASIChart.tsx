'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OHLCVData {
  time: string; // ISO date e.g. '2024-01-15'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TASIChartProps {
  ticker: string;
  data?: OHLCVData[];
  height?: number;
  showMA20?: boolean;
  showMA50?: boolean;
  className?: string;
}

type Interval = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const intervals: { label: string; value: Interval }[] = [
  { label: '1D', value: '1D' },
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

function filterByInterval(data: OHLCVData[], interval: Interval): OHLCVData[] {
  if (interval === 'ALL' || data.length === 0) return data;

  const now = new Date();
  let cutoff: Date;

  switch (interval) {
    case '1D':
      cutoff = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      break;
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

function formatArabicDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TASIChart({
  ticker,
  data: externalData,
  height = 450,
  showMA20: initialMA20 = true,
  showMA50: initialMA50 = true,
  className,
}: TASIChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma50Ref = useRef<ISeriesApi<'Line'> | null>(null);

  const [interval, setInterval] = useState<Interval>('ALL');
  const [showMA20, setShowMA20] = useState(initialMA20);
  const [showMA50, setShowMA50] = useState(initialMA50);
  const [chartData, setChartData] = useState<OHLCVData[]>(externalData || []);
  const [loading, setLoading] = useState(!externalData);
  const [tooltipData, setTooltipData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // Fetch data if not provided externally
  useEffect(() => {
    if (externalData) {
      setChartData(externalData);
      setLoading(false);
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
    const url = `${apiBase}/api/v1/charts/${encodeURIComponent(ticker)}/ohlcv`;

    setLoading(true);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: OHLCVData[]) => {
        setChartData(json);
      })
      .catch(() => {
        setChartData([]);
      })
      .finally(() => setLoading(false));
  }, [ticker, externalData]);

  // Create and update chart
  useEffect(() => {
    if (!containerRef.current || loading) return;

    const filtered = filterByInterval(chartData, interval);

    // Create chart
    if (!chartRef.current) {
      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#B0B0B0',
          fontFamily: 'IBM Plex Sans Arabic, sans-serif',
          fontSize: 12,
        },
        grid: {
          vertLines: { color: 'rgba(212, 168, 75, 0.06)' },
          horzLines: { color: 'rgba(212, 168, 75, 0.06)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(212, 168, 75, 0.4)', labelBackgroundColor: '#D4A84B' },
          horzLine: { color: 'rgba(212, 168, 75, 0.4)', labelBackgroundColor: '#D4A84B' },
        },
        rightPriceScale: {
          borderColor: 'rgba(212, 168, 75, 0.15)',
        },
        timeScale: {
          borderColor: 'rgba(212, 168, 75, 0.15)',
          timeVisible: false,
        },
      });

      // Candlestick series
      const candle = chart.addCandlestickSeries({
        upColor: '#4CAF50',
        downColor: '#FF6B6B',
        borderUpColor: '#4CAF50',
        borderDownColor: '#FF6B6B',
        wickUpColor: '#4CAF50',
        wickDownColor: '#FF6B6B',
      });
      candleRef.current = candle;

      // Volume series
      const volume = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeRef.current = volume;

      // MA20 series
      const ma20 = chart.addLineSeries({
        color: '#D4A84B',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma20Ref.current = ma20;

      // MA50 series
      const ma50 = chart.addLineSeries({
        color: '#4A9FFF',
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
        const candleData = param.seriesData.get(candle) as CandlestickData | undefined;
        if (candleData) {
          const matchedRow = filtered.find((d) => d.time === String(param.time));
          setTooltipData({
            time: String(param.time),
            open: candleData.open,
            high: candleData.high,
            low: candleData.low,
            close: candleData.close,
            volume: matchedRow?.volume || 0,
          });
        }
      });

      chartRef.current = chart;

      // Resize observer
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
        chart.remove();
        chartRef.current = null;
        candleRef.current = null;
        volumeRef.current = null;
        ma20Ref.current = null;
        ma50Ref.current = null;
      };
    }
  }, [chartData, loading, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update data when interval or MA toggles change
  useEffect(() => {
    if (!candleRef.current || loading) return;

    const filtered = filterByInterval(chartData, interval);

    // Update candlestick
    const candleData: CandlestickData[] = filtered.map((d) => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleRef.current.setData(candleData);

    // Update volume
    if (volumeRef.current) {
      const volData: HistogramData[] = filtered.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 107, 107, 0.3)',
      }));
      volumeRef.current.setData(volData);
    }

    // Update MAs
    if (ma20Ref.current) {
      ma20Ref.current.setData(showMA20 ? calculateMA(filtered, 20) : []);
    }
    if (ma50Ref.current) {
      ma50Ref.current.setData(showMA50 ? calculateMA(filtered, 50) : []);
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [chartData, interval, showMA20, showMA50, loading]);

  return (
    <div className={cn('rounded-md border gold-border overflow-hidden bg-[var(--bg-card)]', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b gold-border bg-[var(--bg-input)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gold">{ticker}</span>
          {tooltipData && (
            <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">
              {formatArabicDate(tooltipData.time)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* MA toggles */}
          <button
            onClick={() => setShowMA20(!showMA20)}
            className={cn(
              'text-xs px-2 py-0.5 rounded transition-colors',
              showMA20 ? 'bg-gold/20 text-gold' : 'text-[var(--text-muted)] hover:text-gold'
            )}
          >
            MA20
          </button>
          <button
            onClick={() => setShowMA50(!showMA50)}
            className={cn(
              'text-xs px-2 py-0.5 rounded transition-colors',
              showMA50 ? 'bg-accent-blue/20 text-accent-blue' : 'text-[var(--text-muted)] hover:text-accent-blue'
            )}
          >
            MA50
          </button>

          <span className="w-px h-4 bg-[var(--bg-card-hover)]" />

          {/* Interval selector */}
          {intervals.map((iv) => (
            <button
              key={iv.value}
              onClick={() => setInterval(iv.value)}
              className={cn(
                'text-xs px-1.5 py-0.5 rounded transition-colors',
                interval === iv.value
                  ? 'bg-gold/20 text-gold font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>

      {/* Crosshair tooltip */}
      {tooltipData && (
        <div className="flex items-center gap-4 px-3 py-1 text-xs bg-[var(--bg-card)] border-b gold-border">
          <span>
            O <span className="text-[var(--text-primary)]">{tooltipData.open.toFixed(2)}</span>
          </span>
          <span>
            H <span className="text-accent-green">{tooltipData.high.toFixed(2)}</span>
          </span>
          <span>
            L <span className="text-accent-red">{tooltipData.low.toFixed(2)}</span>
          </span>
          <span>
            C <span className={tooltipData.close >= tooltipData.open ? 'text-accent-green' : 'text-accent-red'}>
              {tooltipData.close.toFixed(2)}
            </span>
          </span>
          <span>
            Vol <span className="text-[var(--text-secondary)]">
              {tooltipData.volume.toLocaleString('ar-SA')}
            </span>
          </span>
        </div>
      )}

      {/* Chart container */}
      <div className="relative" style={{ height }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <span className="w-2 h-2 bg-gold rounded-full animate-gold-pulse" />
              Loading chart data...
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-[var(--text-muted)]">No data available for {ticker}</p>
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
