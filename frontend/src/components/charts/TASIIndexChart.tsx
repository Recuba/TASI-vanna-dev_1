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
import { formatVolume } from '@/lib/formatters';
import { useTasiOHLCV } from '@/lib/hooks/use-chart-data';
import type { OHLCVData } from './chart-types';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/providers/LanguageProvider';
import { useChartIndicators } from './tasi/useChartIndicators';
import { IndicatorToggleBar } from './tasi/IndicatorToggleBar';
import { PeriodSelector } from './tasi/PeriodSelector';
import { ChartExportButton } from './tasi/ChartExportButton';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateMA(data: OHLCVData[], period: number): LineData[] {
  const result: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push({ time: data[i].time as Time, value: sum / period });
  }
  return result;
}

interface TASIIndexChartProps {
  height?: number;
  className?: string;
}

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
  const [chartVisible, setChartVisible] = useState(false);
  const [tooltipData, setTooltipData] = useState<{
    time: string; open: number; high: number; low: number; close: number; volume: number;
  } | null>(null);

  const { showMA20, showMA50, chartType, toggleMA20, toggleMA50, setChartType } = useChartIndicators();
  const { data, loading, error, source, refetch } = useTasiOHLCV(period);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Auto-refresh every 5 min during Tadawul trading hours (Sun-Thu, 10:00-15:00 AST/UTC+3)
  useEffect(() => {
    function isTradingHours(): boolean {
      const now = new Date();
      const utcHour = now.getUTCHours();
      const utcDay = now.getUTCDay();
      return utcDay >= 0 && utcDay <= 4 && utcHour >= 7 && utcHour < 12;
    }
    const id = setInterval(() => { if (isTradingHours()) { refetch(); setLastUpdated(new Date()); } }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refetch]);

  useEffect(() => {
    if (data && data.length > 0 && !lastUpdated) setLastUpdated(new Date());
  }, [data, lastUpdated]);

  const lastCandle = data && data.length > 0 ? data[data.length - 1] : null;
  const prevCandle = data && data.length > 1 ? data[data.length - 2] : null;
  const lastPrice = lastCandle?.close ?? null;
  const priceChange = lastPrice !== null && prevCandle ? lastPrice - prevCandle.close : null;
  const priceChangePct = priceChange !== null && prevCandle && prevCandle.close > 0 ? (priceChange / prevCandle.close) * 100 : null;
  const isUp = priceChange !== null && priceChange >= 0;

  const periodChange = useMemo(() => {
    if (!data || data.length < 2) return null;
    const first = data[0].close;
    const last = data[data.length - 1].close;
    return first === 0 ? null : ((last - first) / first) * 100;
  }, [data]);

  const [chartHeight, setChartHeight] = useState(height);
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      setChartHeight(w < 640 ? 280 : w < 1024 ? 350 : height);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  const buildChart = useCallback(() => {
    const container = containerRef.current;
    if (!container || chartRef.current) return;
    const chart = createChart(container, {
      ...RAID_CHART_OPTIONS,
      width: container.clientWidth,
      height: chartHeight,
      layout: { ...RAID_CHART_OPTIONS.layout, background: { type: ColorType.Solid, color: 'transparent' } },
    });
    const candle = chart.addCandlestickSeries({ upColor: '#D4A84B', downColor: '#FF6B6B', borderUpColor: '#D4A84B', borderDownColor: '#FF6B6B', wickUpColor: '#D4A84B', wickDownColor: '#FF6B6B' });
    candleRef.current = candle;
    lineRef.current = chart.addLineSeries({ color: LINE_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false });
    areaRef.current = chart.addAreaSeries({ topColor: AREA_TOP_COLOR, bottomColor: AREA_BOTTOM_COLOR, lineColor: LINE_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false });
    const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeRef.current = volume;
    ma20Ref.current = chart.addLineSeries({ color: MA20_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ma50Ref.current = chart.addLineSeries({ color: MA50_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setTooltipData(null); return; }
      const cd = param.seriesData.get(candle) as CandlestickData | undefined;
      if (cd) {
        const volEntry = param.seriesData.get(volume) as HistogramData | undefined;
        setTooltipData({ time: String(param.time), open: cd.open, high: cd.high, low: cd.low, close: cd.close, volume: volEntry?.value ?? 0 });
      }
    });
    chartRef.current = chart;
    const observer = new ResizeObserver((entries) => { for (const e of entries) chart.applyOptions({ width: e.contentRect.width }); });
    observer.observe(container);
    observerRef.current = observer;
    requestAnimationFrame(() => setChartVisible(true));
  }, [chartHeight]);

  useEffect(() => {
    if (!loading && data && data.length > 0) buildChart();
    return () => {
      observerRef.current?.disconnect(); observerRef.current = null;
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; candleRef.current = null; lineRef.current = null; areaRef.current = null; volumeRef.current = null; ma20Ref.current = null; ma50Ref.current = null; }
      setChartVisible(false);
    };
  }, [loading, data && data.length > 0, buildChart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (chartRef.current) chartRef.current.applyOptions({ height: chartHeight }); }, [chartHeight]);

  useEffect(() => {
    if (!candleRef.current || !data || loading) return;
    const candleData: CandlestickData[] = data.map((d) => ({ time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close }));
    const closeData: LineData[] = data.map((d) => ({ time: d.time as Time, value: d.close }));
    candleRef.current.setData(candleData);
    lineRef.current?.setData(closeData);
    areaRef.current?.setData(closeData);
    candleRef.current.applyOptions({ visible: chartType === 'candlestick' });
    lineRef.current?.applyOptions({ visible: chartType === 'line' });
    areaRef.current?.applyOptions({ visible: chartType === 'area' });
    if (volumeRef.current) {
      volumeRef.current.setData(data.map((d) => ({ time: d.time as Time, value: d.volume ?? 0, color: d.close >= d.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR })));
    }
    if (ma20Ref.current) ma20Ref.current.setData(showMA20 ? calculateMA(data, 20) : []);
    if (ma50Ref.current) ma50Ref.current.setData(showMA50 ? calculateMA(data, 50) : []);
    chartRef.current?.timeScale().fitContent();
  }, [data, loading, chartType, showMA20, showMA50]);

  if (loading && (!data || data.length === 0)) return <ChartSkeleton height={chartHeight} />;
  if (error) return <ChartError height={chartHeight} message={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <ChartEmpty height={chartHeight} message="No TASI index data available" />;

  return (
    <div dir="ltr" className={cn('rounded-xl overflow-hidden transition-opacity duration-500 dark:bg-dark-card bg-white border border-gold/10', chartVisible ? 'opacity-100' : 'opacity-0', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 flex-wrap gap-2 dark:bg-dark-input bg-gray-100 border-b border-gold/10">
        {/* Left: Title + last price + source badge + period change */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gold">TASI</span>
            <span className="text-xs hidden sm:inline text-[#707070]">{t('مؤشر السوق الرئيسي', 'Tadawul All Share Index')}</span>
            <DataSourceBadge source={source} lastUpdated={lastUpdated?.toISOString()} />
          </div>
          {lastPrice !== null && (
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[#E0E0E0]">{lastPrice.toFixed(2)}</span>
              {priceChange !== null && (
                <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', isUp ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10')}>
                  {isUp ? '+' : ''}{priceChange.toFixed(2)}{priceChangePct !== null && ` (${priceChangePct.toFixed(2)}%)`}
                </span>
              )}
            </div>
          )}
          {periodChange !== null && (
            <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded hidden sm:inline-block', periodChange >= 0 ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10')} title={t('تغير الفترة خلال النطاق المحدد', 'Period change over selected range')}>
              {t('الفترة', 'Period')}: {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}%
            </span>
          )}
        </div>
        {/* Right: Controls */}
        <div className="flex items-center gap-1 flex-wrap">
          <IndicatorToggleBar showMA20={showMA20} showMA50={showMA50} chartType={chartType} onToggleMA20={toggleMA20} onToggleMA50={toggleMA50} onSetChartType={setChartType} />
          <ChartExportButton chartRef={chartRef} data={data} period={period} />
          <span className="w-px h-4 mx-0.5 hidden sm:block bg-gold/[0.15]" />
          <PeriodSelector period={period} onPeriodChange={setPeriod} />
        </div>
      </div>

      {/* Crosshair tooltip bar */}
      <div className="flex items-center gap-4 px-3 py-1 text-xs min-h-[24px] dark:bg-dark-card bg-gray-50 border-b border-gold/10 text-[#808080]">
        {tooltipData ? (
          <>
            <span className="font-medium text-gold">{tooltipData.time}</span>
            <span>O <span className="text-[#E0E0E0]">{tooltipData.open.toFixed(2)}</span></span>
            <span>H <span className="text-accent-green">{tooltipData.high.toFixed(2)}</span></span>
            <span>L <span className="text-accent-red">{tooltipData.low.toFixed(2)}</span></span>
            <span>C <span className={tooltipData.close >= tooltipData.open ? 'text-accent-green' : 'text-accent-red'}>{tooltipData.close.toFixed(2)}</span></span>
            <span>Vol <span className="text-text-secondary">{formatVolume(tooltipData.volume)}</span></span>
          </>
        ) : (
          <span className="text-[#505050]">{t('مرر المؤشر فوق الرسم البياني لعرض التفاصيل', 'Hover over chart for details')}</span>
        )}
      </div>

      {/* Chart container */}
      <div ref={containerRef} role="img" aria-label={t('رسم بياني لمؤشر تاسي', 'TASI index chart')} className="dark:bg-dark-card bg-white" style={{ height: chartHeight }} />
    </div>
  );
}

// SSR-safe dynamic wrapper
export default dynamic(() => Promise.resolve(TASIIndexChartInner), {
  ssr: false,
  loading: () => <ChartSkeleton height={550} />,
});
