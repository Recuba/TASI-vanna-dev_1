import dynamic from 'next/dynamic';

/**
 * Centralized lazy-loading wrappers for heavy components.
 *
 * Chart components (CandlestickChart, LineChart, AreaChart, etc.) are already
 * lazy-loaded via `@/components/charts/index.tsx` -- do NOT duplicate them here.
 * This module covers additional heavy components that benefit from code-splitting.
 */

// ---------------------------------------------------------------------------
// Chart-adjacent heavy components (use browser APIs, need ssr: false)
// ---------------------------------------------------------------------------

/**
 * PreBuiltCharts - Fetches data from API and renders multiple chart cards.
 * Heavy due to data fetching + SVG rendering.
 */
export const LazyPreBuiltCharts = dynamic(
  () => import('@/components/charts/PreBuiltCharts'),
  {
    ssr: false,
    loading: () => null,
  },
);

/**
 * StockComparisonChart - lightweight-charts multi-series comparison.
 * Uses browser canvas APIs.
 */
export const LazyStockComparisonChart = dynamic(
  () => import('@/components/charts/StockComparisonChart'),
  {
    ssr: false,
    loading: () => null,
  },
);
