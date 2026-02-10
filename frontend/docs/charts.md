# Ra'd AI -- Frontend Charts Documentation

> Architecture, components, hooks, caching, and extension guide for the TradingView Lightweight Charts integration.
> Generated from source code on 2026-02-10.

---

## Table of Contents

1. [Overview](#overview)
2. [Component Hierarchy](#component-hierarchy)
3. [Component Reference](#component-reference)
4. [Data Types](#data-types)
5. [Hooks Contract](#hooks-contract)
6. [Caching Architecture](#caching-architecture)
7. [Data Flow](#data-flow)
8. [SSR Safety](#ssr-safety)
9. [Color Theme Reference](#color-theme-reference)
10. [How to Add a New Chart Type](#how-to-add-a-new-chart-type)
11. [TradingView Attribution](#tradingview-attribution)

---

## Overview

The charts system uses **TradingView Lightweight Charts v4.2.3** (Apache 2.0 license) for client-side financial charting. All chart components are client-only (no SSR) and loaded via `next/dynamic` with skeleton fallbacks. Data flows from the Python backend through SWR-cached hooks with automatic mock data fallback when the API is unavailable.

**Key files:**

| Path | Purpose |
|---|---|
| `src/components/charts/` | All chart components (15 files) |
| `src/components/charts/index.tsx` | Barrel with dynamic imports |
| `src/components/charts/chart-config.ts` | Color constants and chart options |
| `src/components/charts/chart-types.ts` | TypeScript interfaces |
| `src/lib/hooks/use-chart-data.ts` | Data fetching hooks |
| `src/lib/chart-cache.ts` | SWR cache configuration |
| `src/lib/chart-cache-provider.tsx` | SWR cache provider |
| `src/lib/chart-utils.ts` | Mock data generators and formatters |
| `src/lib/api-client.ts` | Backend API client |

---

## Component Hierarchy

```
ChartErrorBoundary                  (catches render errors, shows ChartError fallback)
  |
  +-- ChartWrapper                  (title bar + DataSourceBadge)
        |
        +-- CandlestickChart        (full OHLCV chart with volume, MA20/MA50, toolbar)
        |     |-- ChartSkeleton     (loading state)
        |     |-- ChartError        (error state with retry button)
        |     +-- ChartEmpty        (no data state)
        |
        +-- AreaChart               (filled area chart for index/trends)
        |     |-- ChartSkeleton
        |     |-- ChartError
        |     +-- ChartEmpty
        |
        +-- LineChart               (simple line chart)
        |     |-- ChartSkeleton
        |     |-- ChartError
        |     +-- ChartEmpty
        |
        +-- MiniSparkline           (tiny inline sparkline, no axes)

TradingViewAttribution              (required Apache 2.0 attribution link)
DataSourceBadge                     (LIVE/SAMPLE/CACHED pill)
```

**State flow for each chart:**

```
loading=true, data=null  -->  ChartSkeleton (animated placeholder)
error="message"          -->  ChartError    (error message + "Retry" button)
data=[], loading=false   -->  ChartEmpty    (friendly empty state)
data=[...], loading=false-->  Actual chart render
```

---

## Component Reference

### CandlestickChart

Full-featured OHLCV chart with:
- Candlestick series (green up / red down)
- Volume histogram (on secondary price scale)
- MA20 line (gold) and MA50 line (blue) -- toggleable
- Time range selector: 1W, 1M, 3M, 6M, 1Y, All
- Crosshair tooltip bar (OHLC + Volume)
- Responsive height: 250px (mobile), 300px (tablet), 400px (desktop), 500px (XL)
- RTL support (left price scale when `dir="rtl"`)
- ResizeObserver for container width tracking

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `OHLCVData[]` | required | OHLCV data points |
| `height` | number | `400` | Base chart height (responsive override) |
| `showVolume` | boolean | `true` | Initial volume visibility |
| `showMA20` | boolean | `true` | Initial MA20 visibility |
| `showMA50` | boolean | `true` | Initial MA50 visibility |
| `title` | string | - | Chart title text |
| `ticker` | string | - | Ticker symbol (shown in toolbar) |
| `className` | string | - | Additional CSS classes |
| `loading` | boolean | `false` | Show skeleton when true |
| `error` | string or null | `null` | Show error state when set |
| `refetch` | function | - | Retry callback for error state |

**Used on:** `/stock/[ticker]` page.

---

### AreaChart

Filled area chart for index data and price trends.

**Props:** `data: LineDataPoint[]`, `height`, `title`, `className`, `loading`, `error`, `refetch`

**Used on:** `/market` page (TASI Index chart).

---

### LineChart

Simple line chart.

**Props:** Similar to AreaChart. Adds `lineWidth: 1 | 2 | 3 | 4`.

---

### MiniSparkline

Tiny inline chart (no axes, no tooltips, no grid). Fixed dimensions.

**Props:** `data: LineDataPoint[]`, `width: number` (default 120), `height: number` (default 40)

**Used on:** Home page (Top by Market Cap), Market page (company cards).

---

### ChartWrapper

Container that adds a title bar with `DataSourceBadge`.

**Props:** `title?: string`, `source: DataSource | null`, `children: ReactNode`, `className?: string`

---

### ChartErrorBoundary

React class component error boundary. Catches rendering errors in child charts and shows `ChartError` fallback with "Something went wrong" message and retry button.

**Props:** `children: ReactNode`, `fallbackHeight?: number`, `onError?: (error, errorInfo) => void`

---

### DataSourceBadge

Small pill showing data origin:

| Source | Label | Color | Description |
|---|---|---|---|
| `real` | LIVE | Green (#4CAF50) | Data from yfinance/API |
| `mock` | SAMPLE | Orange (#FFA726) | Fallback mock data (hidden a11y description) |
| `cached` | CACHED | Blue (#4A9FFF) | Stale cache data (hidden a11y description) |

Returns `null` when `source` is null (loading state).

---

### TradingViewAttribution

Required Apache 2.0 attribution link. Renders "Charts by TradingView" with hover gold effect and focus outline for keyboard navigation.

---

### ChartSkeleton

Animated loading placeholder. Accepts optional `height` prop.

### ChartError

Error display with message and optional retry button. Props: `message`, `onRetry`, `height`.

### ChartEmpty

Empty state with friendly message. Props: `message`, `height`.

---

## Data Types

Defined in `src/components/charts/chart-types.ts`:

```typescript
interface OHLCVData {
  time: string;        // "YYYY-MM-DD" format
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface LineDataPoint {
  time: string;        // "YYYY-MM-DD" format
  value: number;
}

interface AreaDataPoint {
  time: string;
  value: number;
}

type ChartTimeRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

type DataSource = 'real' | 'mock' | 'cached';

// The universal return type for all chart hooks
interface ChartDataResult<T> {
  data: T | null;       // null while loading
  loading: boolean;     // true during initial fetch
  error: string | null; // error message or null
  source: DataSource | null;  // data origin
  refetch: () => void;  // trigger re-fetch
}
```

---

## Hooks Contract

All hooks are in `src/lib/hooks/use-chart-data.ts`. Each returns `ChartDataResult<T>`.

### useOHLCVData(ticker: string)

Returns `ChartDataResult<OHLCVData[]>`.

- Fetches from `GET /api/v1/charts/{ticker}/ohlcv`
- Falls back to `generateMockOHLCV(ticker, 365)` on error/404
- Cache key: `['ohlcv', ticker]`

### usePriceTrend(ticker: string, days?: number)

Returns `ChartDataResult<LineDataPoint[]>`.

- Derives from OHLCV data (close prices only)
- Filters to last N days
- Falls back to mock data
- Cache key: `['priceTrend', ticker, days]`

### useMarketIndex(period?: string)

Returns `ChartDataResult<LineDataPoint[]>`.

- Fetches from `GET /api/v1/charts/tasi/index?period=1y`
- Maps OHLCV close prices to `LineDataPoint[]`
- Preserves `source` from API response (`real`, `mock`, `cached`)
- Falls back to `generateMockPriceTrend(365)` on error
- Cache key: `['marketIndex', period]`

### useMiniChartData(ticker: string)

Returns `ChartDataResult<LineDataPoint[]>`.

- Last 30 days of close prices (optimized for sparklines)
- Falls back to mock data
- Cache key: `['miniChart', ticker]`

### Common behavior (all hooks)

1. Try API first
2. On success: return `{data, source: 'real'}`
3. On failure: log warning in development, return `{data: mockData, source: 'mock'}`
4. The `source` field tracks whether displayed data is real or fallback
5. `refetch()` triggers SWR revalidation

---

## Caching Architecture

### SWR Configuration

Defined in `src/lib/chart-cache.ts`:

```typescript
const chartCacheConfig = {
  revalidateOnFocus: false,       // No refetch on tab focus
  dedupingInterval: 60_000,       // 60s dedup window (no duplicate fetches)
  refreshInterval: 360_000,       // 6min auto-refresh
  errorRetryCount: 3,             // Retry 3 times on failure
  revalidateOnReconnect: true,    // Refetch when network reconnects
  keepPreviousData: true,         // Show stale data during revalidation
};
```

### Cache Key Factories

```typescript
const chartKeys = {
  ohlcv:       (ticker) => ['ohlcv', ticker],
  priceTrend:  (ticker, days) => ['priceTrend', ticker, days],
  marketIndex: (period) => ['marketIndex', period],
  miniChart:   (ticker) => ['miniChart', ticker],
};
```

### TTL Alignment

| Layer | TTL | Purpose |
|---|---|---|
| Backend (Python) | 300s (5min) | yfinance in-memory cache in `services/tasi_index.py` |
| Frontend (SWR) | 360s (6min) | `refreshInterval` in chart-cache.ts |

The frontend refresh interval (360s) is intentionally 60s longer than the backend cache TTL (300s). This avoids a thundering-herd pattern where the frontend always hits the backend right as its cache expires. In practice, most frontend refreshes will hit the backend's fresh cache.

### `useChartCache<T>` wrapper

Generic SWR hook that merges the chart-specific defaults:

```typescript
function useChartCache<T>(
  key: readonly unknown[] | null,   // chartKeys.* result
  fetcher: () => Promise<T>,        // async data fetcher
  config?: SWRConfiguration,        // optional overrides
): ChartCacheResult<T>
```

Returns `{ data, error, isLoading, isValidating, mutate }`.

---

## Data Flow

```
Page Component
  |
  +-- useOHLCVData(ticker) / useMarketIndex(period) / ...
        |
        +-- useChartCache(key, fetcher)
              |
              +-- SWR(key, fetcher, chartCacheConfig)
                    |
                    +-- fetcher()
                          |
                          +-- api-client.ts: getOHLCVData(ticker) / getTasiIndex(period)
                                |
                                +-- fetch(`/api/v1/charts/...`)
                                      |
                                      +-- Backend (Python FastAPI)
                                            |
                                            +-- yfinance / cache / mock fallback
```

**On success:** `{ data: apiData, source: 'real' }` -> cached in SWR
**On API failure:** `{ data: mockData, source: 'mock' }` -> cached in SWR with console.warn (dev only)
**On SWR revalidation:** old data shown (`keepPreviousData: true`) while refetching

---

## SSR Safety

TradingView Lightweight Charts requires browser APIs (`window`, `document`, `ResizeObserver`). All chart components are dynamically imported with SSR disabled in the barrel file (`index.tsx`):

```typescript
// src/components/charts/index.tsx
import dynamic from 'next/dynamic';
import { ChartSkeleton } from './ChartSkeleton';

export const CandlestickChart = dynamic(() => import('./CandlestickChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export const AreaChart = dynamic(() => import('./AreaChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

// ... same pattern for LineChart, MiniSparkline
```

**Why:** `createChart()` from lightweight-charts accesses `document.createElement` internally. Without `ssr: false`, Next.js SSR would crash with `ReferenceError: document is not defined`.

**How it works:**
1. During SSR, `CandlestickChart` renders `<ChartSkeleton />` (a pure HTML placeholder)
2. After hydration on the client, the actual chart component loads and replaces the skeleton
3. The skeleton provides the same height to prevent layout shift

**Important:** Always import chart components from the barrel (`@/components/charts`) and not directly from their files. The barrel handles the `dynamic()` wrapping.

---

## Color Theme Reference

All chart colors are defined in `src/components/charts/chart-config.ts`:

### Base Theme

| Constant | Value | Usage |
|---|---|---|
| `RAID_CHART_OPTIONS.layout.background` | `#1A1A1A` | Chart background |
| `RAID_CHART_OPTIONS.layout.textColor` | `#B0B0B0` | Axis labels, text |
| `RAID_CHART_OPTIONS.grid.vertLines.color` | `rgba(212, 168, 75, 0.08)` | Vertical grid |
| `RAID_CHART_OPTIONS.grid.horzLines.color` | `rgba(212, 168, 75, 0.08)` | Horizontal grid |
| `RAID_CHART_OPTIONS.crosshair` | `rgba(212, 168, 75, 0.3)` | Crosshair lines |
| `RAID_CHART_OPTIONS.crosshair.labelBackgroundColor` | `#D4A84B` | Crosshair label bg |
| `RAID_CHART_OPTIONS.timeScale.borderColor` | `rgba(212, 168, 75, 0.15)` | Time axis border |

### Candlestick Colors

| Constant | Value | Usage |
|---|---|---|
| `CANDLE_COLORS.upColor` | `#4CAF50` | Green candle body |
| `CANDLE_COLORS.downColor` | `#FF6B6B` | Red candle body |
| `VOLUME_UP_COLOR` | `rgba(76, 175, 80, 0.3)` | Green volume bar |
| `VOLUME_DOWN_COLOR` | `rgba(255, 107, 107, 0.3)` | Red volume bar |

### Overlay Colors

| Constant | Value | Usage |
|---|---|---|
| `MA20_COLOR` | `#D4A84B` | 20-day moving average (gold) |
| `MA50_COLOR` | `#4A9FFF` | 50-day moving average (blue) |
| `AREA_TOP_COLOR` | `rgba(212, 168, 75, 0.4)` | Area chart gradient top |
| `AREA_BOTTOM_COLOR` | `rgba(212, 168, 75, 0.0)` | Area chart gradient bottom |
| `LINE_COLOR` | `#D4A84B` | Line chart default color |

### Brand Color

The primary gold color used throughout: **`#D4A84B`**

---

## How to Add a New Chart Type

Follow these steps to add a new chart component (e.g., a histogram chart):

### Step 1: Create the component

Create `src/components/charts/HistogramChart.tsx`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { createChart, type IChartApi } from 'lightweight-charts';
import { RAID_CHART_OPTIONS } from './chart-config';
import type { ChartContainerProps } from './chart-types';
import { ChartSkeleton } from './ChartSkeleton';
import { ChartError } from './ChartError';
import { ChartEmpty } from './ChartEmpty';

interface HistogramChartProps extends ChartContainerProps {
  data: { time: string; value: number }[];
  loading?: boolean;
  error?: string | null;
  refetch?: () => void;
}

export function HistogramChart({ data, height = 300, loading, error, refetch }: HistogramChartProps) {
  // Handle loading/error/empty states FIRST
  if (loading) return <ChartSkeleton height={height} />;
  if (error) return <ChartError height={height} message={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  // Chart creation logic with useRef + useEffect...
}

export default HistogramChart; // Required for dynamic() import
```

### Step 2: Add to the barrel with SSR-safe dynamic import

In `src/components/charts/index.tsx`:

```typescript
export const HistogramChart = dynamic(() => import('./HistogramChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
```

### Step 3: Add data types (if needed)

In `src/components/charts/chart-types.ts`:

```typescript
export interface HistogramDataPoint {
  time: string;
  value: number;
  color?: string;
}
```

### Step 4: Add a data hook

In `src/lib/hooks/use-chart-data.ts`:

```typescript
export function useHistogramData(ticker: string): ChartDataResult<HistogramDataPoint[]> {
  const fetcher = useCallback(async (): Promise<SourcedData<HistogramDataPoint[]>> => {
    try {
      const data = await getHistogramData(ticker);
      if (data && data.length > 0) return { data, source: 'real' };
    } catch (err) {
      warnMockFallback('useHistogramData', { ticker, reason: (err as Error).message });
    }
    return { data: generateMockHistogram(ticker), source: 'mock' };
  }, [ticker]);

  const { data, error, isLoading, mutate } = useChartCache(
    chartKeys.histogram(ticker),
    fetcher,
  );

  return toChartResult(data, isLoading, error, () => mutate());
}
```

### Step 5: Add cache key

In `src/lib/chart-cache.ts`:

```typescript
export const chartKeys = {
  // ...existing keys
  histogram: (ticker: string) => ['histogram', ticker] as const,
};
```

### Step 6: Add API client function (if new endpoint)

In `src/lib/api-client.ts`:

```typescript
export function getHistogramData(ticker: string): Promise<HistogramDataPoint[]> {
  return request(`/api/v1/charts/${encodeURIComponent(ticker)}/histogram`);
}
```

### Step 7: Use on a page

```tsx
import { HistogramChart, ChartWrapper, ChartErrorBoundary } from '@/components/charts';
import { useHistogramData } from '@/lib/hooks/use-chart-data';

function MyPage() {
  const { data, loading, error, source, refetch } = useHistogramData('2222.SR');
  return (
    <ChartErrorBoundary>
      <ChartWrapper title="Volume Distribution" source={source}>
        <HistogramChart data={data || []} loading={loading} error={error} refetch={refetch} />
      </ChartWrapper>
    </ChartErrorBoundary>
  );
}
```

### Checklist for new chart types:

- [ ] Component file with loading/error/empty states handled
- [ ] `export default` at bottom for `dynamic()` import
- [ ] Added to `index.tsx` barrel with `ssr: false`
- [ ] Data types defined in `chart-types.ts`
- [ ] Hook in `use-chart-data.ts` with mock fallback
- [ ] Cache key in `chart-cache.ts`
- [ ] API client function in `api-client.ts` (if new endpoint)
- [ ] Wrapped in `ChartErrorBoundary` + `ChartWrapper` on page
- [ ] `TradingViewAttribution` visible on the page

---

## TradingView Attribution

TradingView Lightweight Charts is licensed under **Apache License 2.0**. The license requires visible attribution when used in production. The `TradingViewAttribution` component renders:

> Charts by TradingView

This component MUST appear on every page that displays a chart. It is currently included on:

- `/` (home page) -- below the sparklines
- `/market` -- below the TASI index chart
- `/stock/[ticker]` -- below the candlestick chart

If you add charts to a new page, include `<TradingViewAttribution />` somewhere visible on that page.
