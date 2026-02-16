// ---------------------------------------------------------------------------
// Market Graph types
// ---------------------------------------------------------------------------

export type AssetCategory = 'Crypto' | 'Commodity' | 'Energy' | 'US Index' | 'Saudi';

export interface RawInstrument {
  key: string;
  nameAr: string;
  nameEn: string;
  value: number;
  change: number;
  category: AssetCategory;
  sparkline: number[];
}

export interface Instrument extends RawInstrument {
  returns: number[];
  vol: number;
  sharpe: number;
  beta: number;
}

export interface CorrelationEdge {
  from: string;
  to: string;
  rho: number;
  r2: number;
  type: 'positive' | 'inverse';
  pct: number;
  confidence: 'low' | 'medium' | 'high';
  sampleSize?: number;
}

export interface PortfolioStats {
  avgReturn: number;
  avgVol: number;
  advancing: number;
  declining: number;
  breadth: number;
  avgAbsCorr: number;
  diversification: number;
}

export interface NodePosition {
  key: string;
  x: number;
  y: number;
}

export interface EdgeLabel extends CorrelationEdge {
  lx: number;
  ly: number;
}

export interface MarketGraphModel {
  instruments: Instrument[];
  edges: CorrelationEdge[];
  stats: PortfolioStats;
  layout: NodePosition[];
  labels: EdgeLabel[];
  generatedAt: number;
}
