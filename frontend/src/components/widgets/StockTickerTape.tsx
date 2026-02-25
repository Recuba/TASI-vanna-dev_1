'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchMarketMovers, MoverStock } from '@/lib/api/market-movers';
import { useMarketSummary } from '@/lib/hooks/use-api';

/* ============================================================================
   Design Tokens — Luxury Financial Terminal
   ============================================================================ */

const C = {
  bg:        '#050608',
  bgPill:    '#0B0C10',
  gold:      '#C5B38A',
  goldHover: '#D4BA96',
  goldDim:   'rgba(197,179,138,0.45)',
  border:    'rgba(197,179,138,0.10)',
  text:      '#E8E5DE',
  textMuted: '#4A4640',
  green:     '#5DBF7A',
  greenBg:   'rgba(93,191,122,0.12)',
  red:       '#D96B6B',
  redBg:     'rgba(217,107,107,0.12)',
};

const FONT = {
  mono: "'JetBrains Mono','SF Mono','Fira Code','Courier New',monospace",
  sans: "'DM Sans','IBM Plex Sans Arabic',system-ui,sans-serif",
};

/** Ticker bar height in pixels */
const BAR_H = 48;

/* ============================================================================
   Helpers
   ============================================================================ */

function dedupeAndSort(data: {
  top_gainers: MoverStock[];
  top_losers: MoverStock[];
  most_active: MoverStock[];
}): MoverStock[] {
  const seen = new Set<string>();
  const combined: MoverStock[] = [];
  for (const s of [...data.top_gainers, ...data.top_losers, ...data.most_active]) {
    if (!seen.has(s.ticker)) {
      seen.add(s.ticker);
      combined.push(s);
    }
  }
  combined.sort(
    (a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0),
  );
  return combined.slice(0, 30);
}

function fmtPrice(v: number | null): string {
  if (v == null) return '\u2014';
  return v.toLocaleString('en-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(v: number | null): string {
  if (v == null) return '\u2014';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function fmtChange(price: number | null, pct: number | null): string {
  if (price == null || pct == null || pct === -100) return '\u2014';
  const prev = price / (1 + pct / 100);
  const delta = price - prev;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
}

function fmtBigNum(v: number | null | undefined): string {
  if (v == null) return '\u2014';
  if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString();
}

function stripSR(t: string): string {
  return t.replace(/\.SR$/i, '');
}

/** Build the stock detail page URL. Keeps the .SR suffix for the route. */
function stockHref(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker)}`;
}

/* ============================================================================
   Injected CSS — animations + hover behaviours
   ============================================================================ */

const TICKER_CSS = `
@keyframes ticker-scroll {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(-50%, 0, 0); }
}
@keyframes gold-flow {
  from { background-position: 0% 50%; }
  to   { background-position: 200% 50%; }
}
@keyframes ticker-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
.ticker-strip:hover .ticker-track {
  animation-play-state: paused;
}
.ticker-item {
  text-decoration: none;
  transition: background 0.15s ease;
  border-radius: 6px;
}
.ticker-item:hover {
  background: rgba(197,179,138,0.08);
}
.ticker-item:hover .ticker-symbol {
  color: #D4BA96;
}
@media (max-width: 640px) {
  .ticker-tasi-pill { display: none !important; }
}
`;

/* ============================================================================
   TASI Summary Pill — fixed left section
   ============================================================================ */

function TASIPill() {
  const { data } = useMarketSummary();
  const vol = data ? fmtBigNum(data.total_volume) : '\u2014';
  const up = data?.gainers_count ?? '\u2014';
  const dn = data?.losers_count ?? '\u2014';

  return (
    <div
      className="ticker-tasi-pill"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingInline: 18,
        height: '100%',
        background: C.bgPill,
        borderInlineEnd: `1px solid ${C.border}`,
        flexShrink: 0,
        zIndex: 3,
        position: 'relative',
      }}
    >
      <span
        style={{
          fontFamily: FONT.sans,
          fontSize: 16.5,
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: C.gold,
          textTransform: 'uppercase',
        }}
      >
        TASI
      </span>

      <span
        aria-hidden="true"
        style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 16.5,
            color: C.green,
            fontWeight: 600,
          }}
        >
          &#9650; {up}
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 16.5,
            color: C.red,
            fontWeight: 600,
          }}
        >
          &#9660; {dn}
        </span>
      </div>

      <span
        aria-hidden="true"
        style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }}
      />

      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 15.5,
          color: C.goldDim,
          fontWeight: 500,
        }}
      >
        VOL {vol}
      </span>
    </div>
  );
}

/* ============================================================================
   Skeleton loader
   ============================================================================ */

function TickerSkeleton() {
  return (
    <div
      style={{
        height: BAR_H,
        background: C.bg,
        borderBottom: `1px solid ${C.border}`,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        paddingInlineStart: 20,
        position: 'relative',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TICKER_CSS }} />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(197,179,138,0.12) 20%, rgba(212,168,75,0.30) 50%, rgba(197,179,138,0.12) 80%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'gold-flow 8s linear infinite',
        }}
      />

      {[150, 110, 140, 100, 130, 90, 120, 105].map((w, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: w,
            borderRadius: 4,
            flexShrink: 0,
            background: `linear-gradient(90deg,${C.textMuted}18 25%,${C.textMuted}30 50%,${C.textMuted}18 75%)`,
            backgroundSize: '200% 100%',
            animation: `ticker-shimmer 1.6s ${i * 0.12}s infinite linear`,
          }}
        />
      ))}
    </div>
  );
}

/* ============================================================================
   Individual Stock Item — clickable link to /stock/[ticker]

   Format:  SYMBOL  189.84  ▲ +1.23 (+0.65%)
   ============================================================================ */

interface TickerItemProps {
  stock: MoverStock;
}

function TickerItem({ stock }: TickerItemProps) {
  const pct = stock.change_pct ?? 0;
  const isUp = pct > 0;
  const isDn = pct < 0;
  const clr = isUp ? C.green : isDn ? C.red : C.textMuted;
  const bg = isUp ? C.greenBg : isDn ? C.redBg : 'transparent';
  const arrow = isUp ? '\u25B2' : isDn ? '\u25BC' : '\u25CF';

  return (
    <Link
      href={stockHref(stock.ticker)}
      className="ticker-item"
      prefetch={false}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        marginInlineEnd: 12,
        flexShrink: 0,
        paddingInline: 10,
        paddingBlock: 6,
        cursor: 'pointer',
      }}
    >
      {/* Ticker symbol */}
      <span
        className="ticker-symbol"
        style={{
          fontFamily: FONT.mono,
          fontSize: 17.5,
          fontWeight: 700,
          color: C.gold,
          letterSpacing: '0.04em',
        }}
      >
        {stripSR(stock.ticker)}
      </span>

      {/* Current price */}
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 17.5,
          fontWeight: 500,
          color: C.text,
          letterSpacing: '0.02em',
        }}
      >
        {fmtPrice(stock.current_price)}
      </span>

      {/* Change badge: ▲ +1.23 (+0.65%) */}
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 16.5,
          fontWeight: 600,
          color: clr,
          background: bg,
          paddingInline: 7,
          paddingBlock: 2,
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ fontSize: 12.5, lineHeight: 1 }}>{arrow}</span>
        {fmtChange(stock.current_price, stock.change_pct)}{' '}
        ({fmtPct(stock.change_pct)})
      </span>

      {/* Separator dot */}
      <span
        aria-hidden="true"
        style={{
          width: 3,
          height: 3,
          borderRadius: '50%',
          background: C.border,
          marginInlineStart: 6,
          flexShrink: 0,
        }}
      />
    </Link>
  );
}

/* ============================================================================
   Main Component — StockTickerTape
   ============================================================================ */

export function StockTickerTape() {
  const [stocks, setStocks] = useState<MoverStock[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const loadStocks = useCallback(async (signal: AbortSignal) => {
    try {
      const data = await fetchMarketMovers(signal);
      if (!signal.aborted) {
        setStocks(dedupeAndSort(data));
        setLoading(false);
      }
    } catch {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    abortRef.current = new AbortController();
    loadStocks(abortRef.current.signal);

    intervalRef.current = setInterval(() => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      loadStocks(abortRef.current.signal);
    }, 60_000);

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadStocks]);

  // Track a generation counter that increments on each data load.
  // Used as a React key on the scrolling track to force a fresh mount,
  // which guarantees the CSS animation starts cleanly.
  const [gen, setGen] = useState(0);
  useEffect(() => {
    if (stocks.length > 0) setGen(g => g + 1);
  }, [stocks]);

  if (loading) return <TickerSkeleton />;
  if (stocks.length === 0) return null;

  // Speed: ~2.5s per stock → readable but clearly moving
  const duration = `${Math.max(stocks.length * 2.5, 35)}s`;

  return (
    <div
      data-print-hide
      role="marquee"
      aria-label="Live stock ticker"
      style={{
        height: BAR_H,
        background: C.bg,
        overflow: 'hidden',
        position: 'relative',
        direction: 'ltr',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TICKER_CSS }} />

      {/* ── Animated gold accent line at top ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(197,179,138,0.12) 20%, rgba(212,168,75,0.35) 50%, rgba(197,179,138,0.12) 80%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'gold-flow 8s linear infinite',
          zIndex: 4,
        }}
      />

      {/* ── Bottom border ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 1,
          background: C.border,
        }}
      />

      {/* ── Fixed TASI summary pill (hidden on mobile) ── */}
      <TASIPill />

      {/* ── Right fade overlay ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 80,
          background: `linear-gradient(to left, ${C.bg} 25%, transparent)`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* ── Scrolling strip ── */}
      <div
        className="ticker-strip"
        style={{
          flex: 1,
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          key={gen}
          ref={trackRef}
          className="ticker-track"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            animation: `ticker-scroll ${duration} linear infinite`,
            willChange: 'transform',
            paddingInlineStart: 16,
          }}
        >
          {/* Render twice for seamless infinite loop */}
          {[...stocks, ...stocks].map((stock, idx) => (
            <TickerItem
              key={`${stock.ticker}-${idx}`}
              stock={stock}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
