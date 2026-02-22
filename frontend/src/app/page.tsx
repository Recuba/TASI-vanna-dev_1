'use client';

import { TradingViewAttribution, ChartErrorBoundary } from '@/components/charts';
import {
  TASITickerBar,
  SectorHeatmap,
  MiniNewsFeed,
  MarketBreadthBar,
  MarketMoversWidget,
} from './(home)/components';

// ---------------------------------------------------------------------------
// Page — Argaam-style information-dense homepage
// ---------------------------------------------------------------------------

export default function Home() {

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* TASI Ticker Bar — full width */}
        <TASITickerBar />

        {/* Market Breadth Bar — full width */}
        <MarketBreadthBar />

        {/* Main grid: Heatmap (2/3) + News (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ChartErrorBoundary fallbackHeight={400}>
              <SectorHeatmap />
            </ChartErrorBoundary>
          </div>
          <div className="lg:col-span-1">
            <MiniNewsFeed />
          </div>
        </div>

        {/* Market Movers — full width */}
        <MarketMoversWidget />

        {/* TradingView Attribution */}
        <div className="text-center pb-4">
          <TradingViewAttribution />
        </div>

      </div>
    </div>
  );
}
