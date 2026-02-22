'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchMarketMovers, MoverStock } from '@/lib/api/market-movers';

// ---------------------------------------------------------------------------
// Design tokens (matching luxury design system)
// ---------------------------------------------------------------------------

const P = {
  bg: '#07080C',
  gold: '#C5B38A',
  text: '#E8E4DC',
  textMuted: '#5A574F',
  border: 'rgba(197, 179, 138, 0.08)',
  green: '#6BCB8B',
  red: '#E06C6C',
};

const F = {
  mono: "'JetBrains Mono', 'Courier New', monospace",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedupeAndSort(data: {
  top_gainers: MoverStock[];
  top_losers: MoverStock[];
  most_active: MoverStock[];
}): MoverStock[] {
  const seen = new Set<string>();
  const combined: MoverStock[] = [];

  for (const stock of [
    ...data.top_gainers,
    ...data.top_losers,
    ...data.most_active,
  ]) {
    if (!seen.has(stock.ticker)) {
      seen.add(stock.ticker);
      combined.push(stock);
    }
  }

  // Sort by absolute change_pct descending
  combined.sort((a, b) => {
    const absA = Math.abs(a.change_pct ?? 0);
    const absB = Math.abs(b.change_pct ?? 0);
    return absB - absA;
  });

  return combined.slice(0, 25);
}

function formatPrice(price: number | null): string {
  if (price == null) return '--';
  return price.toFixed(2);
}

function formatChangePct(pct: number | null): string {
  if (pct == null) return '--';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Shimmer loading state
// ---------------------------------------------------------------------------

function TickerSkeleton() {
  return (
    <div
      style={{
        height: 36,
        background: P.bg,
        borderBottom: `1px solid ${P.border}`,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        style={{
          height: 10,
          width: '60%',
          borderRadius: 4,
          background: `linear-gradient(90deg, ${P.textMuted}22 25%, ${P.textMuted}44 50%, ${P.textMuted}22 75%)`,
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite linear',
        }}
      />
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StockTickerTape() {
  const [stocks, setStocks] = useState<MoverStock[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchStocks(signal: AbortSignal) {
    try {
      const data = await fetchMarketMovers(signal);
      if (!signal.aborted) {
        setStocks(dedupeAndSort(data));
        setLoading(false);
      }
    } catch {
      // Silently ignore aborted requests or network errors
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    // Initial fetch
    abortRef.current = new AbortController();
    fetchStocks(abortRef.current.signal);

    // Poll every 45 seconds
    intervalRef.current = setInterval(() => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      fetchStocks(abortRef.current.signal);
    }, 45_000);

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (loading) {
    return <TickerSkeleton />;
  }

  if (stocks.length === 0) {
    return null;
  }

  const duration = `${stocks.length * 2.5}s`;

  return (
    <div
      style={{
        height: 36,
        background: P.bg,
        borderBottom: `1px solid ${P.border}`,
        overflow: 'hidden',
        position: 'relative',
        direction: 'ltr',
      }}
    >
      {/* CSS animations */}
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-container:hover .ticker-track {
          animation-play-state: paused;
        }
      `}</style>

      {/* Left fade gradient */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 48,
          background: `linear-gradient(to right, ${P.bg}, transparent)`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Right fade gradient */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 48,
          background: `linear-gradient(to left, ${P.bg}, transparent)`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Scrolling container */}
      <div
        className="ticker-container"
        style={{
          height: '100%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          className="ticker-track"
          style={{
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            animation: `ticker-scroll ${duration} linear infinite`,
            willChange: 'transform',
          }}
        >
          {/* Render items twice for seamless loop */}
          {[...stocks, ...stocks].map((stock, idx) => {
            const changePct = stock.change_pct ?? 0;
            const isPositive = changePct > 0;
            const isNegative = changePct < 0;
            const changeColor = isPositive
              ? P.green
              : isNegative
                ? P.red
                : P.textMuted;

            return (
              <span
                key={`${stock.ticker}-${idx}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginRight: 30,
                  fontFamily: F.mono,
                }}
              >
                {/* Symbol */}
                <span
                  style={{
                    color: P.gold,
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: '0.04em',
                  }}
                >
                  {stock.ticker}
                </span>

                {/* Price */}
                <span
                  style={{
                    color: P.text,
                    fontSize: 11,
                  }}
                >
                  {formatPrice(stock.current_price)}
                </span>

                {/* Change % */}
                <span
                  style={{
                    color: changeColor,
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  {formatChangePct(stock.change_pct)}
                </span>

                {/* Gold dot separator */}
                <span
                  aria-hidden="true"
                  style={{
                    color: P.gold,
                    opacity: 0.4,
                    fontSize: 8,
                  }}
                >
                  ●
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
