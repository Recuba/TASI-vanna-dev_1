'use client';

import { useRef, useEffect, useCallback } from 'react';
import { createChart, type IChartApi, type DeepPartial, type ChartOptions } from 'lightweight-charts';
import { RAID_CHART_OPTIONS } from './chart-config';

interface UseChartOptions {
  options?: DeepPartial<ChartOptions>;
}

export function useChart(containerRef: React.RefObject<HTMLDivElement | null>, opts?: UseChartOptions) {
  const chartRef = useRef<IChartApi | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const initChart = useCallback(() => {
    if (typeof window === 'undefined') return;
    const container = containerRef.current;
    if (!container || chartRef.current) return;

    const merged: DeepPartial<ChartOptions> = {
      ...RAID_CHART_OPTIONS,
      ...opts?.options,
      width: container.clientWidth,
      height: container.clientHeight || 400,
    };

    const chart = createChart(container, merged);
    chartRef.current = chart;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);
    observerRef.current = observer;
  }, [containerRef, opts?.options]);

  useEffect(() => {
    initChart();

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

  return chartRef;
}
