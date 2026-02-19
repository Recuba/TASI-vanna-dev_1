import { useState, useCallback } from 'react';

export type ChartType = 'candlestick' | 'line' | 'area';

export interface ChartIndicators {
  showMA20: boolean;
  showMA50: boolean;
  chartType: ChartType;
  toggleMA20: () => void;
  toggleMA50: () => void;
  setChartType: (type: ChartType) => void;
}

export function useChartIndicators(): ChartIndicators {
  const [showMA20, setShowMA20] = useState(false);
  const [showMA50, setShowMA50] = useState(false);
  const [chartType, setChartType] = useState<ChartType>('candlestick');

  const toggleMA20 = useCallback(() => setShowMA20((v) => !v), []);
  const toggleMA50 = useCallback(() => setShowMA50((v) => !v), []);
  const handleSetChartType = useCallback((type: ChartType) => setChartType(type), []);

  return {
    showMA20,
    showMA50,
    chartType,
    toggleMA20,
    toggleMA50,
    setChartType: handleSetChartType,
  };
}
