'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import type { LineDataPoint } from './chart-types';
import { cn } from '@/lib/utils';

interface MiniSparklineProps {
  data: LineDataPoint[];
  width?: number;
  height?: number;
  className?: string;
}

const SPARKLINE_GREEN = '#4CAF50';
const SPARKLINE_RED = '#FF6B6B';

export default function MiniSparkline({
  data,
  width = 80,
  height = 40,
  className,
}: MiniSparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    const container = containerRef.current;
    const isPositive = data.length >= 2 && data[data.length - 1].value >= data[0].value;
    const lineColor = isPositive ? SPARKLINE_GREEN : SPARKLINE_RED;

    const chart = createChart(container, {
      width: container.clientWidth || width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: 'transparent' },
      },
      crosshair: {
        mode: CrosshairMode.Hidden,
      },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addLineSeries({
      color: lineColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const lineData: LineData[] = data.map((d) => ({
      time: d.time as Time,
      value: d.value,
    }));
    series.setData(lineData);
    chart.timeScale().fitContent();

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
  }, [data, width, height]);

  if (!data || data.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={cn('inline-block', className)}
      style={{ width, height }}
      title="Chart powered by TradingView Lightweight Charts - tradingview.com"
    />
  );
}
