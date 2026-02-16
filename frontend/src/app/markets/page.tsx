'use client';

import { useMemo } from 'react';
import { useMarketDataLive } from '@/lib/hooks/use-market-data';
import {
  buildMarketGraphModel,
  buildMarketGraphModelFromLiveData,
} from '@/lib/market-graph';
import MarketOverviewClient from './MarketOverviewClient';
import MarketsLoading from './loading';

export default function MarketsPage() {
  const { instruments, historicalData, isLoading, isLive, lastUpdated, refetch } =
    useMarketDataLive();

  const model = useMemo(() => {
    if (isLive) {
      return buildMarketGraphModelFromLiveData(instruments, historicalData, 0.25);
    }
    return buildMarketGraphModel(0.25);
  }, [instruments, historicalData, isLive]);

  if (isLoading && !isLive) {
    return <MarketsLoading />;
  }

  return (
    <MarketOverviewClient
      initialModel={model}
      isLive={isLive}
      lastUpdated={lastUpdated}
      onRefresh={refetch}
    />
  );
}
