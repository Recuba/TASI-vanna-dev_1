'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts';
import {
  RAID_CHART_OPTIONS,
  VOLUME_UP_COLOR,
  VOLUME_DOWN_COLOR,
  MA20_COLOR,
  MA50_COLOR,
  AREA_TOP_COLOR,
  AREA_BOTTOM_COLOR,
  LINE_COLOR,
} from './chart-config';
import { ChartSkeleton } from './ChartSkeleton';
import { ChartError } from './ChartError';
import { ChartEmpty } from './ChartEmpty';
import { DataSourceBadge } from './DataSourceBadge';
import { useTasiOHLCV } from '@/lib/hooks/use-chart-data';
import type { OHLCVData } from './chart-types';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/providers/LanguageProvider';

// ---------------------------------------------------------------------------
// Period options
// ---------------------------------------------------------------------------

const PERIODS = [
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
  { label: '5Y', value: '5y' },
] as const;

type ChartType = 'candlestick' | 'line' | 'area';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return (vol / 1_000_000_000).toFixed(1) + 'B';
  if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + 'M';
  if (vol >= 1_000) return (vol / 1_000).toFixed(1) + 'K';
  return vol.toFixed(0);
}

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

function exportCSV(data: OHLCVData[], period: string) {
  const header = 'Date,Open,High,Low,Close,Volume\n';
  const rows = data
    .map((d) => `${d.time},${d.open},${d.high},${d.low},${d.close},${d.volume ?? 0}`)
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TASI_${period}_ohlcv.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TASIIndexChartProps {
  height?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TASIIndexChartInner({ height = 550, className }: TASIIndexChartProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const [period, setPeriod] = useState('1y');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showMA20, setShowMA20] = useState(false);
  const [showMA50, setShowMA50] = useState(false);
  const [chartVisible, setChartVisible] = useState(false);
  const [tooltipData, setTooltipData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  const { data, loading, error, source, refetch } = useTasiOHLCV(period);

  // Derive last price + day-over-day change
  const lastCandle = data && data.length > 0 ? data[data.length - 1] : null;
  const prevCandle = data && data.length > 1 ? data[data.length - 2] : null;
  const lastPrice = lastCandle?.close ?? null;
  const priceChange = lastPrice !== null && prevCandle ? lastPrice - prevCandle.close : null;
  const priceChangePct =
    priceChange !== null && prevCandle && prevCandle.close > 0
      ? (priceChange / prevCandle.close) * 100
      : null;
  const isUp = priceChange !== null && priceChange >= 0;

  // Period % change (first to last)
  const periodChange = useMemo(() => {
    if (!data || data.length < 2) return null;
    const first = data[0].close;
    const last = data[data.length - 1].close;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
  }, [data]);

  // Responsive chart height
  const [chartHeight, setChartHeight] = useState(height);
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      if (w < 640) setChartHeight(280);
      else if (w < 1024) setChartHeight(350);
      else setChartHeight(height);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  // Build chart
  const buildChart = useCallback(() => {
    const container = containerRef.current;
    if (!container || chartRef.current) return;

    const chart = createChart(container, {
      ...RAID_CHART_OPTIONS,
      width: container.clientWidth,
      height: chartHeight,
      layout: {
        ...RAID_CHART_OPTIONS.layout,
        background: { type: ColorType.Solid, color: 'transparent' },
      },
    });

    // Candlestick series
    const candle = chart.addCandlestickSeries({
      upColor: '#D4A84B',
      downColor: '#FF6B6B',
      borderUpColor: '#D4A84B',
      borderDownColor: '#FF6B6B',
      wickUpColor: '#D4A84B',
      wickDownColor: '#FF6B6B',
    });
    candleRef.current = candle;

    // Line series (hidden initially)
    const line = chart.addLineSeries({
      color: LINE_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    lineRef.current = line;

    // Area series (hidden initially)
    const area = chart.addAreaSeries({
      topColor: AREA_TOP_COLOR,
      bottomColor: AREA_BOTTOM_COLOR,
      lineColor: LINE_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    areaRef.current = area;

    // Volume histogram
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

    requestAnimationFrame(() => setChartVisible(true));
  }, [chartHeight]);

  // Create / destroy
  useEffect(() => {
    if (!loading && data && data.length > 0) {
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
        lineRef.current = null;
        areaRef.current = null;
        volumeRef.current = null;
        ma20Ref.current = null;
        ma50Ref.current = null;
      }
      setChartVisible(false);
    };
  }, [loading, data && data.length > 0, buildChart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update height on resize
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height: chartHeight });
    }
  }, [chartHeight]);

  // Update data + chart type visibility
  useEffect(() => {
    if (!candleRef.current || !data || loading) return;

    const candleData: CandlestickData[] = data.map((d) => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    const closeData: LineData[] = data.map((d) => ({
      time: d.time as Time,
      value: d.close,
    }));

    // Set data on all series
    candleRef.current.setData(candleData);
    lineRef.current?.setData(closeData);
    areaRef.current?.setData(closeData);

    // Toggle visibility based on chart type
    candleRef.current.applyOptions({ visible: chartType === 'candlestick' });
    lineRef.current?.applyOptions({ visible: chartType === 'line' });
    areaRef.current?.applyOptions({ visible: chartType === 'area' });

    if (volumeRef.current) {
      const volData: HistogramData[] = data.map((d) => ({
        time: d.time as Time,
        value: d.volume ?? 0,
        color: d.close >= d.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
      }));
      volumeRef.current.setData(volData);
    }

    // MA lines
    if (ma20Ref.current) {
      ma20Ref.current.setData(showMA20 ? calculateMA(data, 20) : []);
    }
    if (ma50Ref.current) {
      ma50Ref.current.setData(showMA50 ? calculateMA(data, 50) : []);
    }

    chartRef.current?.timeScale().fitContent();
  }, [data, loading, chartType, showMA20, showMA50]);

  // PNG download
  const handleScreenshot = useCallback(() => {
    if (!chartRef.current) return;
    const canvas = chartRef.current.takeScreenshot();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `TASI_${period}_${dateStr}.png`;
    a.click();
  }, [period]);

  // CSV export
  const handleCSVExport = useCallback(() => {
    if (!data) return;
    exportCSV(data, period);
  }, [data, period]);

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
    return <ChartEmpty height={chartHeight} message="No TASI index data available" />;
  }

  return (
    <div
      dir="ltr"
      className={cn(
        'rounded-xl overflow-hidden transition-opacity duration-500 dark:bg-[#1A1A1A] bg-white',
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
        {/* Left: Title + last price + source badge + period change */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#D4A84B' }}>
              TASI
            </span>
            <span className="text-xs hidden sm:inline" style={{ color: '#707070' }}>
              {t('مؤشر السوق الرئيسي', 'Tadawul All Share Index')}
            </span>
            <DataSourceBadge source={source} />
          </div>

          {/* Last price display */}
          {lastPrice !== null && (
            <div className="flex items-center gap-2">
              <span className="text-base font-bold" style={{ color: '#E0E0E0' }}>
                {lastPrice.toFixed(2)}
              </span>
              {priceChange !== null && (
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{
                    color: isUp ? '#4CAF50' : '#FF6B6B',
                    background: isUp ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 107, 107, 0.1)',
                  }}
                >
                  {isUp ? '+' : ''}{priceChange.toFixed(2)}
                  {priceChangePct !== null && ` (${priceChangePct.toFixed(2)}%)`}
                </span>
              )}
            </div>
          )}

          {/* Period % change */}
          {periodChange !== null && (
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded hidden sm:inline-block"
              style={{
                color: periodChange >= 0 ? '#4CAF50' : '#FF6B6B',
                background: periodChange >= 0
                  ? 'rgba(76, 175, 80, 0.1)'
                  : 'rgba(255, 107, 107, 0.1)',
              }}
              title={t('تغير الفترة خلال النطاق المحدد', 'Period change over selected range')}
            >
              {t('الفترة', 'Period')}: {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* MA toggles */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-md"
            style={{ background: 'rgba(212, 168, 75, 0.05)' }}
          >
            <button
              onClick={() => setShowMA20((v) => !v)}
              title="Moving Average 20"
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium"
              style={{
                background: showMA20 ? 'rgba(212, 168, 75, 0.2)' : 'transparent',
                color: showMA20 ? MA20_COLOR : '#707070',
                border: showMA20 ? `1px solid ${MA20_COLOR}` : '1px solid transparent',
              }}
            >
              MA20
            </button>
            <button
              onClick={() => setShowMA50((v) => !v)}
              title="Moving Average 50"
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium"
              style={{
                background: showMA50 ? 'rgba(74, 159, 255, 0.2)' : 'transparent',
                color: showMA50 ? MA50_COLOR : '#707070',
                border: showMA50 ? `1px solid ${MA50_COLOR}` : '1px solid transparent',
              }}
            >
              MA50
            </button>
          </div>

          {/* Chart type toggle */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-md"
            style={{ background: 'rgba(212, 168, 75, 0.05)' }}
          >
            <button
              onClick={() => setChartType('candlestick')}
              title="Candlestick"
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: chartType === 'candlestick' ? 'rgba(212, 168, 75, 0.2)' : 'transparent',
                color: chartType === 'candlestick' ? '#D4A84B' : '#707070',
                border: chartType === 'candlestick' ? '1px solid #D4A84B' : '1px solid transparent',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="9" y1="2" x2="9" y2="22" />
                <rect x="5" y="7" width="8" height="10" fill="currentColor" opacity="0.3" />
                <line x1="17" y1="4" x2="17" y2="20" />
                <rect x="13" y="9" width="8" height="6" fill="currentColor" opacity="0.3" />
              </svg>
            </button>
            <button
              onClick={() => setChartType('line')}
              title="Line Chart"
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: chartType === 'line' ? 'rgba(212, 168, 75, 0.2)' : 'transparent',
                color: chartType === 'line' ? '#D4A84B' : '#707070',
                border: chartType === 'line' ? '1px solid #D4A84B' : '1px solid transparent',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3,17 8,11 13,15 21,5" />
              </svg>
            </button>
            <button
              onClick={() => setChartType('area')}
              title="Area Chart"
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: chartType === 'area' ? 'rgba(212, 168, 75, 0.2)' : 'transparent',
                color: chartType === 'area' ? '#D4A84B' : '#707070',
                border: chartType === 'area' ? '1px solid #D4A84B' : '1px solid transparent',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3,17 L8,11 L13,15 L21,5 L21,21 L3,21 Z" fill="currentColor" opacity="0.2" />
                <polyline points="3,17 8,11 13,15 21,5" />
              </svg>
            </button>
          </div>

          {/* Export buttons */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-md"
            style={{ background: 'rgba(212, 168, 75, 0.05)' }}
          >
            <button
              onClick={handleScreenshot}
              title="Download PNG"
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors hidden sm:block"
              style={{ color: '#707070' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#D4A84B'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#707070'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21,15 16,10 5,21" />
              </svg>
            </button>
            <button
              onClick={handleCSVExport}
              title="Export CSV"
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors hidden sm:block"
              style={{ color: '#707070' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#D4A84B'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#707070'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14,2 L6,2 C4.9,2 4,2.9 4,4 L4,20 C4,21.1 4.9,22 6,22 L18,22 C19.1,22 20,21.1 20,20 L20,8 Z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="12" y1="12" x2="12" y2="18" />
                <polyline points="9,15 12,18 15,15" />
              </svg>
            </button>
          </div>

          {/* Separator */}
          <span
            className="w-px h-4 mx-0.5 hidden sm:block"
            style={{ background: 'rgba(212, 168, 75, 0.15)' }}
          />

          {/* Period pill selector */}
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
                  period === p.value
                    ? 'shadow-sm'
                    : 'hover:text-[#D4A84B]',
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
      </div>

      {/* Crosshair tooltip bar */}
      <div
        className="flex items-center gap-4 px-3 py-1 text-xs min-h-[24px] dark:bg-[#1A1A1A] bg-gray-50"
        style={{
          borderBottom: '1px solid rgba(212, 168, 75, 0.1)',
          color: '#808080',
        }}
      >
        {tooltipData ? (
          <>
            <span className="font-medium" style={{ color: '#D4A84B' }}>
              {tooltipData.time}
            </span>
            <span>
              O <span style={{ color: '#E0E0E0' }}>{tooltipData.open.toFixed(2)}</span>
            </span>
            <span>
              H <span style={{ color: '#4CAF50' }}>{tooltipData.high.toFixed(2)}</span>
            </span>
            <span>
              L <span style={{ color: '#FF6B6B' }}>{tooltipData.low.toFixed(2)}</span>
            </span>
            <span>
              C{' '}
              <span
                style={{
                  color: tooltipData.close >= tooltipData.open ? '#4CAF50' : '#FF6B6B',
                }}
              >
                {tooltipData.close.toFixed(2)}
              </span>
            </span>
            <span>
              Vol <span style={{ color: '#B0B0B0' }}>{formatVolume(tooltipData.volume)}</span>
            </span>
          </>
        ) : (
          <span style={{ color: '#505050' }}>{t('مرر المؤشر فوق الرسم البياني لعرض التفاصيل', 'Hover over chart for details')}</span>
        )}
      </div>

      {/* Chart container */}
      <div ref={containerRef} className="dark:bg-[#1A1A1A] bg-white" style={{ height: chartHeight }} />
    </div>
  );
}

// SSR-safe dynamic wrapper
export default dynamic(() => Promise.resolve(TASIIndexChartInner), {
  ssr: false,
  loading: () => <ChartSkeleton height={550} />,
});
