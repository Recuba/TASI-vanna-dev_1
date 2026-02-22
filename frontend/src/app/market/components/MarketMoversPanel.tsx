'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { fetchMarketMovers, type MoverStock, type MarketMoversData } from '@/lib/api/market-movers';

type TabKey = 'gainers' | 'losers' | 'active';

const TABS: { key: TabKey; labelAr: string; labelEn: string }[] = [
  { key: 'gainers', labelAr: '\u0623\u0643\u0628\u0631 \u0627\u0644\u0631\u0627\u0628\u062D\u064A\u0646', labelEn: 'Top Gainers' },
  { key: 'losers',  labelAr: '\u0623\u0643\u0628\u0631 \u0627\u0644\u062E\u0627\u0633\u0631\u064A\u0646', labelEn: 'Top Losers' },
  { key: 'active',  labelAr: '\u0627\u0644\u0623\u0643\u062B\u0631 \u062A\u062F\u0627\u0648\u0644\u0627\u064B', labelEn: 'Most Active' },
];

function fmtVol(v: number | null): string {
  if (!v) return '\u2014';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(v);
}

function MoverRow({ stock, showVolume }: { stock: MoverStock; showVolume?: boolean }) {
  const isUp = (stock.change_pct ?? 0) >= 0;
  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-gold transition-colors truncate">
          {stock.short_name || stock.ticker}
        </p>
        <p className="text-[10px] text-[var(--text-muted)]">
          {stock.ticker}
          {showVolume && stock.volume != null && (
            <span className="ms-1">&middot; {fmtVol(stock.volume)}</span>
          )}
        </p>
      </div>
      <div className="text-end ms-2 shrink-0">
        <p className="text-xs font-bold text-[var(--text-primary)]">
          {stock.current_price !== null ? stock.current_price.toFixed(2) : '\u2014'}
        </p>
        {stock.change_pct !== null ? (
          <span className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            isUp ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10'
          )}>
            {isUp ? '+' : ''}{stock.change_pct.toFixed(2)}%
          </span>
        ) : <span className="text-[10px] text-[var(--text-muted)]">{'\u2014'}</span>}
      </div>
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-3 py-2 gap-3">
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-[var(--bg-input)] rounded animate-pulse w-3/4" />
        <div className="h-2.5 bg-[var(--bg-input)] rounded animate-pulse w-1/2" />
      </div>
      <div className="space-y-1.5 text-end">
        <div className="h-3 bg-[var(--bg-input)] rounded animate-pulse w-12" />
        <div className="h-2.5 bg-[var(--bg-input)] rounded animate-pulse w-10" />
      </div>
    </div>
  );
}

export default function MarketMoversPanel() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>('gainers');
  const [data, setData] = useState<MarketMoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const result = await fetchMarketMovers(controller.signal);
      setData(result);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const cleanup = loadData();
    return () => { cleanup?.then((fn) => fn?.()); };
  }, [loadData]);

  const stocks: MoverStock[] = data
    ? activeTab === 'gainers' ? data.top_gainers
    : activeTab === 'losers'  ? data.top_losers
    : data.most_active
    : [];

  return (
    <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl overflow-hidden" dir={dir}>
      {/* Tabs */}
      <div className="flex border-b border-[#2A2A2A]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 py-2.5 text-xs font-semibold transition-colors',
              activeTab === tab.key
                ? 'text-gold border-b-2 border-gold bg-gold/5'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
          >
            {language === 'ar' ? tab.labelAr : tab.labelEn}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="divide-y divide-[#2A2A2A]/40 max-h-[320px] overflow-y-auto">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
        ) : error ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
            {language === 'ar' ? '\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A' : 'Failed to load data'}
            <button onClick={loadData} className="block mx-auto mt-2 text-gold underline text-xs">
              {language === 'ar' ? '\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629' : 'Retry'}
            </button>
          </div>
        ) : stocks.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
            {language === 'ar' ? '\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A' : 'No data available'}
          </div>
        ) : stocks.slice(0, 10).map((stock) => (
          <MoverRow key={stock.ticker} stock={stock} showVolume={activeTab === 'active'} />
        ))}
      </div>
    </div>
  );
}
