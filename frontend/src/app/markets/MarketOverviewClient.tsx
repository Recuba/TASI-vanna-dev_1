'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLanguage } from '@/providers/LanguageProvider';
import { useFormatters } from '@/lib/hooks/useFormatters';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import type { MarketGraphModel, EdgeLabel } from '@/lib/market-graph';

import {
  MarketHeader,
  ConstellationCanvas,
  MobileSummary,
  CategoryLegend,
  MARKET_KEYFRAMES,
} from './components';

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export default function MarketOverviewClient({
  initialModel,
  isLive,
  lastUpdated,
  onRefresh,
}: {
  initialModel: MarketGraphModel;
  isLive?: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
}) {
  const { language, t, isRTL } = useLanguage();
  const { formatTime, formatDate } = useFormatters();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeLabel | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [time, setTime] = useState(new Date());
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  const prevValuesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const { instruments, edges, stats, layout, labels } = initialModel;

  // Detect price changes and trigger flash animation
  useEffect(() => {
    const changed = new Set<string>();
    for (const inst of instruments) {
      const prev = prevValuesRef.current[inst.key];
      if (prev !== undefined && prev !== inst.value) {
        changed.add(inst.key);
      }
      prevValuesRef.current[inst.key] = inst.value;
    }
    if (changed.size > 0) {
      setFlashKeys(changed);
      const timer = setTimeout(() => setFlashKeys(new Set()), 1200);
      return () => clearTimeout(timer);
    }
  }, [instruments]);

  // Compute connection status: 'live' | 'stale' | 'offline'
  const connectionStatus = useMemo(() => {
    if (!isLive) return 'offline' as const;
    if (lastUpdated) {
      const ageMs = Date.now() - lastUpdated.getTime();
      if (ageMs > 120_000) return 'stale' as const;
    }
    return 'live' as const;
  }, [isLive, lastUpdated, time]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* CSS keyframes */}
      <style>{MARKET_KEYFRAMES}</style>

      <div className="py-4">
        <div className="max-w-content-lg mx-auto px-4 sm:px-6">
          {/* Breadcrumb */}
          <div className="mb-3">
            <Breadcrumb items={[{ label: t('\u0627\u0644\u0639\u0627\u0644\u0645 360', 'World 360') }]} />
          </div>

          {/* Header */}
          <MarketHeader
            stats={stats}
            edges={edges}
            loaded={loaded}
            connectionStatus={connectionStatus}
            lastUpdated={lastUpdated ?? null}
            time={time}
            formatTime={formatTime}
            formatDate={formatDate}
            onRefresh={onRefresh}
            t={t}
          />
        </div>

        {/* Desktop constellation */}
        <ConstellationCanvas
          instruments={instruments}
          labels={labels}
          layout={layout}
          stats={stats}
          hoveredKey={hoveredKey}
          hoveredEdge={hoveredEdge}
          flashKeys={flashKeys}
          loaded={loaded}
          isRTL={isRTL}
          language={language}
          t={t}
          onHoverKey={setHoveredKey}
          onHoverEdge={setHoveredEdge}
        />

        <div className="max-w-content-lg mx-auto px-4 sm:px-6">
          {/* Mobile view */}
          <MobileSummary
            instruments={instruments}
            edges={edges}
            stats={stats}
            language={language}
            t={t}
          />

          {/* Legend + explainer */}
          <CategoryLegend language={language} t={t} />
        </div>
      </div>
    </div>
  );
}
