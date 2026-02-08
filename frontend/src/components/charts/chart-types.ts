export interface OHLCVData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LineDataPoint {
  time: string;
  value: number;
}

export interface AreaDataPoint {
  time: string;
  value: number;
}

export type ChartTimeRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

export interface ChartContainerProps {
  height?: number;
  className?: string;
  title?: string;
}
