import { ColorType, CrosshairMode, type DeepPartial, type ChartOptions } from 'lightweight-charts';

export const RAID_CHART_OPTIONS: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: '#1A1A1A' },
    textColor: '#B0B0B0',
    fontFamily: 'Inter, sans-serif',
    attributionLogo: true,
  },
  grid: {
    vertLines: { color: 'rgba(212, 168, 75, 0.08)' },
    horzLines: { color: 'rgba(212, 168, 75, 0.08)' },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: 'rgba(212, 168, 75, 0.3)', labelBackgroundColor: '#D4A84B' },
    horzLine: { color: 'rgba(212, 168, 75, 0.3)', labelBackgroundColor: '#D4A84B' },
  },
  timeScale: { borderColor: 'rgba(212, 168, 75, 0.15)', timeVisible: true },
  rightPriceScale: { borderColor: 'rgba(212, 168, 75, 0.15)' },
};

export const CANDLE_COLORS = {
  upColor: '#4CAF50',
  downColor: '#FF6B6B',
  borderUpColor: '#4CAF50',
  borderDownColor: '#FF6B6B',
  wickUpColor: '#4CAF50',
  wickDownColor: '#FF6B6B',
};

export const VOLUME_UP_COLOR = 'rgba(76, 175, 80, 0.3)';
export const VOLUME_DOWN_COLOR = 'rgba(255, 107, 107, 0.3)';
export const MA20_COLOR = '#D4A84B';
export const MA50_COLOR = '#4A9FFF';
export const AREA_TOP_COLOR = 'rgba(212, 168, 75, 0.4)';
export const AREA_BOTTOM_COLOR = 'rgba(212, 168, 75, 0.0)';
export const LINE_COLOR = '#D4A84B';
