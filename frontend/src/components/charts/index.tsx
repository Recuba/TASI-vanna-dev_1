import dynamic from 'next/dynamic';
import { ChartSkeleton } from './ChartSkeleton';

export const CandlestickChart = dynamic(() => import('./CandlestickChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export const LineChart = dynamic(() => import('./LineChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export const AreaChart = dynamic(() => import('./AreaChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export const MiniSparkline = dynamic(() => import('./MiniSparkline'), {
  ssr: false,
  loading: () => <ChartSkeleton height={40} />,
});

export { ChartSkeleton } from './ChartSkeleton';
export { ChartError } from './ChartError';
export { ChartEmpty } from './ChartEmpty';
