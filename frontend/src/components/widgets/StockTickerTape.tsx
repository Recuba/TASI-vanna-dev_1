'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchMarketMovers, MoverStock } from '@/lib/api/market-movers';
import { useMarketSummary } from '@/lib/hooks/use-api';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const P = {
  bg: '#06070A',
  bgPill: '#0E0F14',
  gold: '#C5B38A',
  goldDim: 'rgba(197,179,138,0.55)',
  text: '#DDD9D0',
  textMuted: '#4A4740',
  border: 'rgba(197,179,138,0.10)',
  green: '#5DBF7A',
  greenDim: 'rgba(93,191,122,0.12)',
  red: '#D96B6B',
  redDim: 'rgba(217,107,107,0.12)',
};

const F = {
  mono: "'JetBrains Mono','Courier New',monospace",
  sans: "'DM Sans','IBM Plex Sans Arabic',system-ui,sans-serif",
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
  combined.sort((a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0));
  return combined.slice(0, 28);
}

function formatPrice(price: number | null): string {
  if (price == null) return '--';
  return price.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChangePct(pct: number | null): string {
  if (pct == null) return '--';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function formatLargeNumber(val: number | null | undefined): string {
  if (val == null) return '--';
  if (Math.abs(val) >= 1e12) return `${(val / 1e12).toFixed(2)}T`;
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  return val.toLocaleString();
}

// Strip ".SR" suffix for display
function displayTicker(ticker: string): string {
  return ticker.replace(/\.SR$/i, '');
}

// ---------------------------------------------------------------------------
// Left-side TASI summary pill
// ---------------------------------------------------------------------------

function TASIPill() {
  const { data: summary } = useMarketSummary();

  const totalVol = summary ? formatLargeNumber(summary.total_volume) : '--';
  const gainers = summary?.gainers_count ?? '--';
  const losers = summary?.losers_count ?? '--';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 14,
        paddingRight: 14,
        height: '100%',
        background: P.bgPill,
        borderRight: `1px solid ${P.border}`,
        flexShrink: 0,
        zIndex: 3,
        position: 'relative',
      }}
    >
      {/* TASI label */}
      <span
        style={{
          fontFamily: F.sans,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: P.gold,
          textTransform: 'uppercase',
        }}
      >
        TASI
      </span>

      <div
        style={{
          width: 1,
          height: 16,
          background: P.border,
          flexShrink: 0,
        }}
      />

      {/* Up/Down counts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 10,
            color: P.green,
            fontWeight: 600,
          }}
        >
          ▲ {gainers}
        </span>
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 10,
            color: P.red,
            fontWeight: 600,
          }}
        >
          ▼ {losers}
        </span>
      </div>

      <div
        style={{
          width: 1,
          height: 16,
          background: P.border,
          flexShrink: 0,
        }}
      />

      {/* Volume */}
      <span
        style={{
          fontFamily: F.mono,
          fontSize: 10,
          color: P.goldDim,
        }}
      >
        VOL {totalVol}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shimmer skeleton
// ---------------------------------------------------------------------------

function TickerSkeleton() {
  return (
    <div
      style={{
        height: 38,
        background: P.bg,
        borderBottom: `1px solid ${P.border}`,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingLeft: 16,
      }}
    >
      {[120, 90, 110, 80, 100, 70, 95, 85].map((w, i) => (
        <div
          key={i}
          style={{
            height: 10,
            width: w,
            borderRadius: 3,
            background: `linear-gradient(90deg,${P.textMuted}18 25%,${P.textMuted}30 50%,${P.textMuted}18 75%)`,
            backgroundSize: '200% 100%',
            animation: `shimmer 1.6s ${i * 0.1}s infinite linear`,
            flexShrink: 0,
          }}
        />
      ))}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single ticker item
// ---------------------------------------------------------------------------

interface TickerItemProps {
  stock: MoverStock;
  idx: number;
}

function TickerItem({ stock, idx }: TickerItemProps) {
  const pct = stock.change_pct ?? 0;
  const isUp = pct > 0;
  const isDown = pct < 0;
  const changeColor = isUp ? P.green : isDown ? P.red : P.textMuted;
  const changeBg = isUp ? P.greenDim : isDown ? P.redDim : 'transparent';
  const arrow = isUp ? '▲' : isDown ? '▼' : '●';

  return (
    <span
      key={`${stock.ticker}-${idx}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        marginRight: 24,
        flexShrink: 0,
      }}
    >
      {/* Ticker symbol */}
      <span
        style={{
          fontFamily: F.mono,
          fontSize: 11,
          fontWeight: 700,
          color: P.gold,
          letterSpacing: '0.06em',
        }}
      >
        {displayTicker(stock.ticker)}
      </span>

      {/* Short name (truncated) */}
      {stock.short_name && (
        <span
          style={{
            fontFamily: F.sans,
            fontSize: 10,
            color: P.textMuted,
            maxWidth: 90,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            display: 'inline-block',
          }}
        >
          {stock.short_name}
        </span>
      )}

      {/* Price */}
      <span
        style={{
          fontFamily: F.mono,
          fontSize: 11,
          color: P.text,
          letterSpacing: '0.02em',
        }}
      >
        {formatPrice(stock.current_price)}
      </span>

      {/* Change badge */}
      <span
        style={{
          fontFamily: F.mono,
          fontSize: 10,
          fontWeight: 700,
          color: changeColor,
          background: changeBg,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 1,
          paddingBottom: 1,
          borderRadius: 3,
          letterSpacing: '0.01em',
        }}
      >
        {arrow} {formatChangePct(stock.change_pct)}
      </span>

      {/* Dot separator */}
      <span
        aria-hidden="true"
        style={{ color: P.border, fontSize: 14, lineHeight: 1, marginLeft: 4 }}
      >
        |
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StockTickerTape() {
  const [stocks, setStocks] = useState<MoverStock[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStocks(signal: AbortSignal) {
    try {
      const data = await fetchMarketMovers(signal);
      if (!signal.aborted) {
        setStocks(dedupeAndSort(data));
        setLoading(false);
      }
    } catch {
      if (!signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    abortRef.current = new AbortController();
    fetchStocks(abortRef.current.signal);

    intervalRef.current = setInterval(() => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      fetchStocks(abortRef.current.signal);
    }, 60_000);

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (loading) return <TickerSkeleton />;
  if (stocks.length === 0) return null;

  // Speed: ~80px/s feels natural for a financial ticker
  const totalItems = stocks.length;
  const duration = `${Math.max(totalItems * 3, 40)}s`;

  return (
    <div
      style={{
        height: 38,
        background: P.bg,
        borderBottom: `1px solid ${P.border}`,
        overflow: 'hidden',
        position: 'relative',
        direction: 'ltr',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-wrap:hover .ticker-track {
          animation-play-state: paused;
        }
      `}} />

      {/* Fixed left summary pill */}
      <TASIPill />

      {/* Right fade overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 64,
          background: `linear-gradient(to left, ${P.bg} 30%, transparent)`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Scrolling strip */}
      <div
        className="ticker-wrap"
        style={{
          flex: 1,
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          cursor: 'default',
        }}
      >
        <div
          className="ticker-track"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            animation: `ticker-scroll ${duration} linear infinite`,
            willChange: 'transform',
            paddingLeft: 20,
          }}
        >
          {/* Render twice for seamless infinite loop */}
          {[...stocks, ...stocks].map((stock, idx) => (
            <TickerItem key={`${stock.ticker}-${idx}`} stock={stock} idx={idx} />
          ))}
        </div>
      </div>
    </div>
  );
}
