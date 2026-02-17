'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ConnectionStatusBadge } from '@/components/common/ConnectionStatusBadge';
import { API_BASE } from '@/lib/config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuoteItem = {
  symbol: string;
  name: string;
  asset_class: 'crypto' | 'metal' | 'oil' | 'index' | 'fx' | 'other';
  price: number;
  currency: string;
  change?: number | null;
  change_pct?: number | null;
  ts_iso: string;
  source: string;
  is_delayed?: boolean;
  delay_minutes?: number;
};

type ConnectionStatus = 'live' | 'reconnecting' | 'offline';

// ---------------------------------------------------------------------------
// Asset-class icons (inline SVG, small)
// ---------------------------------------------------------------------------

const ASSET_ICONS: Record<QuoteItem['asset_class'], string> = {
  crypto: '\u20BF',   // Bitcoin symbol
  metal: '\u2B50',    // Star (gold)
  oil: '\u26FD',      // Fuel pump
  index: '\u2191',    // Up arrow
  fx: '\u0024',       // Dollar
  other: '\u2022',    // Bullet
};

// ---------------------------------------------------------------------------
// Memoized quote card to prevent re-renders when other quotes update
// ---------------------------------------------------------------------------

const QuoteCard = React.memo(function QuoteCard({
  q,
  priceFmt,
  pctFmt,
}: {
  q: QuoteItem;
  priceFmt: Intl.NumberFormat;
  pctFmt: Intl.NumberFormat;
}) {
  const isPositive = (q.change_pct ?? 0) > 0;
  const isNegative = (q.change_pct ?? 0) < 0;
  const isNeutral = !isPositive && !isNegative;

  return (
    <div
      className={cn(
        'flex-shrink-0 rounded-xl px-3 py-2',
        'bg-white/5 hover:bg-white/10',
        'transition-colors duration-200',
        'min-w-[120px]',
      )}
    >
      {/* Name + asset icon */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px] opacity-60" aria-hidden="true">
          {ASSET_ICONS[q.asset_class] ?? ASSET_ICONS.other}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[90px]">
          {q.name}
        </span>
        {q.is_delayed && (
          <span
            className="text-[9px] text-amber-400/70 flex-shrink-0"
            title={`Delayed ${q.delay_minutes ?? 15}min`}
          >
            D
          </span>
        )}
      </div>

      {/* Price */}
      <div className="text-sm font-semibold text-[var(--text-primary)]">
        {priceFmt.format(q.price)}
      </div>

      {/* Change % */}
      <div
        className={cn(
          'text-[11px] font-medium',
          isPositive && 'text-accent-green',
          isNegative && 'text-accent-red',
          isNeutral && 'text-[var(--text-muted)]',
        )}
      >
        {q.change_pct != null ? `${pctFmt.format(q.change_pct)}%` : '--'}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LiveMarketWidgetsProps {
  lang?: 'ar' | 'en';
  className?: string;
}

export function LiveMarketWidgets({ lang = 'ar', className }: LiveMarketWidgetsProps) {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const retryRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Number formatters, memoized per lang
  const priceFmt = useMemo(
    () =>
      new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [lang],
  );

  const pctFmt = useMemo(
    () =>
      new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        signDisplay: 'always',
      }),
    [lang],
  );

  const connect = useCallback(() => {
    // Clean up any previous connection
    esRef.current?.close();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setStatus('reconnecting');

    const url = `${API_BASE}/api/v1/widgets/quotes/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retryRef.current = 0;
      setStatus('live');
    };

    // Handle 'snapshot' event (full list of quotes)
    es.addEventListener('snapshot', (e) => {
      try {
        const data = JSON.parse(e.data) as QuoteItem[];
        setQuotes(data);
      } catch {
        // ignore malformed data
      }
    });

    // Handle 'update' event (single quote update)
    es.addEventListener('update', (e) => {
      try {
        const updated = JSON.parse(e.data) as QuoteItem;
        setQuotes((prev) => {
          const idx = prev.findIndex((q) => q.symbol === updated.symbol);
          if (idx === -1) return [...prev, updated];
          const next = [...prev];
          next[idx] = updated;
          return next;
        });
      } catch {
        // ignore malformed data
      }
    });

    es.onerror = () => {
      es.close();
      setStatus('reconnecting');

      // Exponential backoff: 1.5s, 3s, 6s, 12s, 24s, max 30s
      const delay = Math.min(1500 * Math.pow(2, retryRef.current), 30000);
      retryRef.current += 1;

      timerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [connect]);

  // If no quotes yet and still connecting, show a minimal skeleton
  if (quotes.length === 0 && status !== 'live') {
    return (
      <div
        className={cn(
          'w-full overflow-hidden bg-white/5 backdrop-blur-sm',
          'border-b border-[#D4A84B]/10',
          className,
        )}
      >
        <div className="max-w-content-lg mx-auto px-4 sm:px-6 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">
              {lang === 'ar' ? 'الأسواق العالمية' : 'Global Markets'}
            </span>
            <ConnectionStatusBadge status={status} lang={lang} />
          </div>
          <div className="flex gap-3 mt-1.5 overflow-x-auto scrollbar-hide">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-28 h-12 rounded-lg bg-white/5 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If offline with no data, show nothing
  if (quotes.length === 0 && status === 'live') {
    return null;
  }

  return (
    <div
      className={cn(
        'w-full overflow-hidden bg-white/5 backdrop-blur-sm',
        'border-b border-[#D4A84B]/10',
        className,
      )}
    >
      <div className="max-w-content-lg mx-auto px-4 sm:px-6 py-2">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-[var(--text-muted)]">
            {lang === 'ar' ? 'الأسواق العالمية' : 'Global Markets'}
          </span>
          <ConnectionStatusBadge status={status} lang={lang} />
        </div>

        {/* Scrollable quote cards */}
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-0.5" aria-live="polite" aria-atomic="false">
          {quotes.map((q) => (
            <QuoteCard key={q.symbol} q={q} priceFmt={priceFmt} pctFmt={pctFmt} />
          ))}
        </div>
      </div>
    </div>
  );
}
