import { vi } from 'vitest';
import type { OHLCVData, LineDataPoint } from '@/components/charts/chart-types';

// ---------------------------------------------------------------------------
// lightweight-charts mock
// ---------------------------------------------------------------------------

export function createLightweightChartsMock() {
  const seriesStub = {
    setData: vi.fn(),
    update: vi.fn(),
    applyOptions: vi.fn(),
    priceScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
  };

  const chartStub = {
    addCandlestickSeries: vi.fn().mockReturnValue(seriesStub),
    addAreaSeries: vi.fn().mockReturnValue(seriesStub),
    addLineSeries: vi.fn().mockReturnValue(seriesStub),
    addHistogramSeries: vi.fn().mockReturnValue(seriesStub),
    applyOptions: vi.fn(),
    timeScale: vi.fn().mockReturnValue({
      fitContent: vi.fn(),
      applyOptions: vi.fn(),
    }),
    priceScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
    subscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
    resize: vi.fn(),
  };

  return {
    createChart: vi.fn().mockReturnValue(chartStub),
    chartStub,
    seriesStub,
  };
}

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

export function createMockOHLCVData(count: number = 10): OHLCVData[] {
  const result: OHLCVData[] = [];
  const baseDate = new Date('2025-01-01');

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    const open = 100 + i;
    const close = 100 + i + (i % 2 === 0 ? 1 : -1);
    result.push({
      time: `${y}-${m}-${d}`,
      open,
      high: Math.max(open, close) + 2,
      low: Math.min(open, close) - 2,
      close,
      volume: 1_000_000 + i * 10_000,
    });
  }
  return result;
}

export function createMockLineData(count: number = 10): LineDataPoint[] {
  const result: LineDataPoint[] = [];
  const baseDate = new Date('2025-01-01');

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    result.push({
      time: `${y}-${m}-${d}`,
      value: 100 + Math.sin(i) * 10,
    });
  }
  return result;
}
