export type {
  RawInstrument,
  Instrument,
  CorrelationEdge,
  PortfolioStats,
  NodePosition,
  EdgeLabel,
  MarketGraphModel,
  AssetCategory,
} from './types';

export {
  computeMetrics,
  computeMetricsFromHistorical,
  computeEdges,
  computeEdgesEnhanced,
  portfolioStats,
  spearmanCorr,
  correlationConfidence,
} from './quant';
export { layoutNodes, toPosMap, computeEdgeLabelPositions } from './layout';
export { RAW_INSTRUMENTS, INSTRUMENT_META } from './data';
export type { InstrumentMeta } from './data';

import type { MarketGraphModel, RawInstrument } from './types';
import { RAW_INSTRUMENTS } from './data';
import { computeMetrics, computeEdges, portfolioStats, computeMetricsFromHistorical, computeEdgesEnhanced } from './quant';
import { layoutNodes, toPosMap, computeEdgeLabelPositions } from './layout';

// ---------------------------------------------------------------------------
// Canvas dimensions (virtual coordinate space)
// ---------------------------------------------------------------------------
export const CANVAS_W = 1500;
export const CANVAS_H = 1100;
export const CX = CANVAS_W / 2;
export const CY = CANVAS_H / 2 + 30;
const MAX_R = Math.min(CX, CY) * 0.78;
export const HUB_RADIUS = 100;

// ---------------------------------------------------------------------------
// Build a complete graph model from static data (fallback)
// ---------------------------------------------------------------------------

export function buildMarketGraphModel(threshold = 0.25): MarketGraphModel {
  const instruments = computeMetrics(RAW_INSTRUMENTS);
  const edges = computeEdges(instruments, threshold);
  const stats = portfolioStats(instruments);
  const layout = layoutNodes(instruments, CX, CY, MAX_R);
  const posMap = toPosMap(layout);
  const labels = computeEdgeLabelPositions(edges, posMap, CX, CY, HUB_RADIUS);

  return {
    instruments,
    edges,
    stats,
    layout,
    labels,
    generatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Build a complete graph model from live data with historical series
// ---------------------------------------------------------------------------

export function buildMarketGraphModelFromLiveData(
  rawInstruments: RawInstrument[],
  historicalData: Record<string, number[]>,
  threshold = 0.25,
): MarketGraphModel {
  const hasHistorical = Object.keys(historicalData).length > 0;

  const instruments = hasHistorical
    ? computeMetricsFromHistorical(rawInstruments, historicalData)
    : computeMetrics(rawInstruments);

  const edges = hasHistorical
    ? computeEdgesEnhanced(instruments, historicalData, threshold)
    : computeEdges(instruments, threshold);

  const stats = portfolioStats(instruments);
  const layout = layoutNodes(instruments, CX, CY, MAX_R);
  const posMap = toPosMap(layout);
  const labels = computeEdgeLabelPositions(edges, posMap, CX, CY, HUB_RADIUS);

  return {
    instruments,
    edges,
    stats,
    layout,
    labels,
    generatedAt: Date.now(),
  };
}
