import type { RawInstrument, Instrument, CorrelationEdge, PortfolioStats } from './types';

// ---------------------------------------------------------------------------
// Core statistical functions
// ---------------------------------------------------------------------------

export function logReturns(prices: number[] | undefined | null): number[] {
  if (!prices || prices.length < 2) return [];
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      r.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return r;
}

export function mean(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function stdDev(arr: number[]): number {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

export function pearsonCorr(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const d = Math.sqrt(da * db);
  return d === 0 ? 0 : num / d;
}

export function betaCalc(assetReturns: number[], marketReturns: number[]): number {
  if (!assetReturns || !marketReturns || assetReturns.length !== marketReturns.length || assetReturns.length < 2) return 0;
  const ma = mean(assetReturns);
  const mm = mean(marketReturns);
  let cov = 0;
  let v = 0;
  for (let i = 0; i < assetReturns.length; i++) {
    const da = assetReturns[i] - ma;
    const dm = marketReturns[i] - mm;
    cov += da * dm;
    v += dm * dm;
  }
  return v === 0 ? 0 : cov / v;
}

export function annualizedVol(r: number[]): number {
  return stdDev(r) * Math.sqrt(252);
}

export function sharpeRatio(r: number[]): number {
  const ar = mean(r) * 252;
  const av = annualizedVol(r);
  return av === 0 ? 0 : ar / av;
}

// ---------------------------------------------------------------------------
// Rank-based (Spearman) correlation
// ---------------------------------------------------------------------------

export function spearmanCorr(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length < 2) return 0;

  function toRanks(arr: number[]): number[] {
    const sorted = arr
      .map((v, i) => ({ v, i }))
      .sort((x, y) => x.v - y.v);
    const ranks = new Array<number>(arr.length);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
      const avgRank = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank;
      i = j;
    }
    return ranks;
  }

  return pearsonCorr(toRanks(a), toRanks(b));
}

// ---------------------------------------------------------------------------
// Confidence based on sample size
// ---------------------------------------------------------------------------

export function correlationConfidence(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize < 10) return 'low';
  if (sampleSize <= 50) return 'medium';
  return 'high';
}

// ---------------------------------------------------------------------------
// Compute derived metrics for all instruments
// ---------------------------------------------------------------------------

export function computeMetrics(raw: RawInstrument[]): Instrument[] {
  if (!raw || raw.length === 0) return [];
  const allR: Record<string, number[]> = {};
  raw.forEach((i) => {
    allR[i.key] = logReturns(i.sparkline);
  });
  const spx = allR['SPX'] ?? [];

  return raw.map((i) => {
    const r = allR[i.key] ?? [];
    return {
      ...i,
      returns: r,
      vol: annualizedVol(r),
      sharpe: sharpeRatio(r),
      beta: i.key === 'SPX' ? 1.0 : betaCalc(r, spx),
    };
  });
}

// ---------------------------------------------------------------------------
// Compute correlation edges between instruments
// ---------------------------------------------------------------------------

export function computeEdges(instruments: Instrument[], threshold = 0.25): CorrelationEdge[] {
  const edges: CorrelationEdge[] = [];
  for (let i = 0; i < instruments.length; i++) {
    for (let j = i + 1; j < instruments.length; j++) {
      const a = instruments[i];
      const b = instruments[j];
      const rho = pearsonCorr(a.returns, b.returns);
      if (Math.abs(rho) >= threshold) {
        const sampleSize = Math.min(a.returns?.length ?? 0, b.returns?.length ?? 0);
        edges.push({
          from: a.key,
          to: b.key,
          rho,
          r2: rho * rho,
          type: rho > 0 ? 'positive' : 'inverse',
          pct: Math.round(Math.abs(rho) * 100),
          confidence: 'low',
          sampleSize,
        });
      }
    }
  }
  return edges.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
}

// ---------------------------------------------------------------------------
// Compute metrics using longer historical series
// ---------------------------------------------------------------------------

export function computeMetricsFromHistorical(
  raw: RawInstrument[],
  historicalData: Record<string, number[]>,
): Instrument[] {
  if (!raw || raw.length === 0) return [];
  const allR: Record<string, number[]> = {};
  raw.forEach((i) => {
    const prices = historicalData[i.key];
    allR[i.key] = logReturns(prices && prices.length >= 2 ? prices : i.sparkline);
  });
  const spx = allR['SPX'] ?? [];

  return raw.map((i) => {
    const r = allR[i.key] ?? [];
    return {
      ...i,
      returns: r,
      vol: annualizedVol(r),
      sharpe: sharpeRatio(r),
      beta: i.key === 'SPX' ? 1.0 : betaCalc(r, spx),
    };
  });
}

// ---------------------------------------------------------------------------
// Enhanced edge computation using historical data
// ---------------------------------------------------------------------------

export function computeEdgesEnhanced(
  instruments: Instrument[],
  historicalData: Record<string, number[]>,
  threshold = 0.25,
): CorrelationEdge[] {
  const edges: CorrelationEdge[] = [];
  for (let i = 0; i < instruments.length; i++) {
    for (let j = i + 1; j < instruments.length; j++) {
      const a = instruments[i];
      const b = instruments[j];

      const histA = historicalData[a.key];
      const histB = historicalData[b.key];
      const useHistorical = histA && histA.length >= 2 && histB && histB.length >= 2;

      let retA: number[];
      let retB: number[];
      if (useHistorical) {
        retA = logReturns(histA);
        retB = logReturns(histB);
        // Align to same length
        const len = Math.min(retA.length, retB.length);
        retA = retA.slice(retA.length - len);
        retB = retB.slice(retB.length - len);
      } else {
        retA = a.returns;
        retB = b.returns;
      }

      const rho = pearsonCorr(retA, retB);
      if (Math.abs(rho) >= threshold) {
        const sampleSize = Math.min(retA.length, retB.length);
        edges.push({
          from: a.key,
          to: b.key,
          rho,
          r2: rho * rho,
          type: rho > 0 ? 'positive' : 'inverse',
          pct: Math.round(Math.abs(rho) * 100),
          confidence: correlationConfidence(sampleSize),
          sampleSize,
        });
      }
    }
  }
  return edges.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
}

// ---------------------------------------------------------------------------
// Aggregate portfolio statistics
// ---------------------------------------------------------------------------

export function portfolioStats(instruments: Instrument[]): PortfolioStats {
  const n = instruments.length;
  if (n === 0) {
    return { avgReturn: 0, avgVol: 0, advancing: 0, declining: 0, breadth: 0, avgAbsCorr: 0, diversification: 1 };
  }
  const avgReturn = mean(instruments.map((i) => i.change ?? 0));
  const avgVol = mean(instruments.map((i) => i.vol ?? 0));
  const advancing = instruments.filter((i) => (i.change ?? 0) > 0).length;
  const breadth = (advancing / n) * 2 - 1;

  const allR = instruments.map((i) => i.returns ?? []);
  let tc = 0;
  let pc = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      tc += Math.abs(pearsonCorr(allR[i], allR[j]));
      pc++;
    }
  }
  const avgAbsCorr = pc > 0 ? tc / pc : 0;

  return {
    avgReturn,
    avgVol,
    advancing,
    declining: n - advancing,
    breadth,
    avgAbsCorr,
    diversification: 1 - avgAbsCorr,
  };
}
