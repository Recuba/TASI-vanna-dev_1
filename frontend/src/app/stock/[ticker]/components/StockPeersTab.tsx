'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useStockPeers } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  return `${(val * 100).toFixed(1)}%`;
}

function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  return val.toFixed(2);
}

interface StockPeersTabProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

export function StockPeersTab({ ticker, language, t }: StockPeersTabProps) {
  const { data, loading, error, refetch } = useStockPeers(ticker, 10);
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (loading) return <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />;
  if (error) return <div className="text-center py-8"><button onClick={refetch} className="text-sm text-accent-red hover:text-gold">{t('إعادة المحاولة', 'Retry')}</button></div>;
  if (!data || data.peers.length === 0) return <p className="text-sm text-[var(--text-muted)] py-8 text-center">{t('لا توجد شركات مماثلة', 'No peer companies found')}</p>;

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
      <h2 className="text-sm font-bold text-gold mb-4 uppercase tracking-wider" dir={dir}>
        {t('مقارنة القطاع', 'Peer Comparison')} — {data.sector}
      </h2>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2A2A2A]">
              <th className="text-start py-2 px-2 text-xs text-[var(--text-muted)] font-medium">{t('الشركة', 'Company')}</th>
              <th className="text-end py-2 px-2 text-xs text-[var(--text-muted)] font-medium">{t('السعر', 'Price')}</th>
              <th className="text-end py-2 px-2 text-xs text-[var(--text-muted)] font-medium">{t('التغير', 'Change')}</th>
              <th className="text-end py-2 px-2 text-xs text-[var(--text-muted)] font-medium">P/E</th>
              <th className="text-end py-2 px-2 text-xs text-[var(--text-muted)] font-medium">P/B</th>
              <th className="text-end py-2 px-2 text-xs text-[var(--text-muted)] font-medium">ROE</th>
              <th className="text-end py-2 px-2 text-xs text-[var(--text-muted)] font-medium">{t('العائد', 'Yield')}</th>
              <th className="text-end py-2 px-2 text-xs text-[var(--text-muted)] font-medium">{t('القيمة السوقية', 'Mkt Cap')}</th>
            </tr>
          </thead>
          <tbody>
            {data.peers.map((peer) => (
              <tr key={peer.ticker} className="border-b border-[#2A2A2A]/50 hover:bg-[var(--bg-card-hover)] transition-colors">
                <td className="py-2 px-2">
                  <Link href={`/stock/${encodeURIComponent(peer.ticker)}`} className="text-[var(--text-primary)] hover:text-gold transition-colors font-medium">
                    {peer.short_name || peer.ticker}
                  </Link>
                  <span className="text-xs text-[var(--text-muted)] ms-1">{peer.ticker.replace('.SR', '')}</span>
                </td>
                <td className="text-end py-2 px-2 text-[var(--text-primary)]">{peer.current_price?.toFixed(2) ?? '-'}</td>
                <td className={cn('text-end py-2 px-2 font-medium', (peer.change_pct ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                  {peer.change_pct != null ? `${peer.change_pct >= 0 ? '+' : ''}${peer.change_pct.toFixed(2)}%` : '-'}
                </td>
                <td className="text-end py-2 px-2 text-[var(--text-secondary)]">{peer.trailing_pe?.toFixed(1) ?? '-'}</td>
                <td className="text-end py-2 px-2 text-[var(--text-secondary)]">{peer.price_to_book?.toFixed(2) ?? '-'}</td>
                <td className="text-end py-2 px-2 text-[var(--text-secondary)]">{formatPct(peer.roe)}</td>
                <td className="text-end py-2 px-2 text-[var(--text-secondary)]">{formatPct(peer.dividend_yield)}</td>
                <td className="text-end py-2 px-2 text-[var(--text-secondary)]">{formatNumber(peer.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {data.peers.map((peer) => (
          <Link key={peer.ticker} href={`/stock/${encodeURIComponent(peer.ticker)}`} className="block bg-[var(--bg-input)] rounded-lg p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">{peer.short_name || peer.ticker}</span>
              <span className={cn('text-xs font-bold', (peer.change_pct ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                {peer.change_pct != null ? `${peer.change_pct >= 0 ? '+' : ''}${peer.change_pct.toFixed(2)}%` : '-'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-[var(--text-muted)]">P/E</span> <span className="text-[var(--text-secondary)]">{peer.trailing_pe?.toFixed(1) ?? '-'}</span></div>
              <div><span className="text-[var(--text-muted)]">ROE</span> <span className="text-[var(--text-secondary)]">{formatPct(peer.roe)}</span></div>
              <div><span className="text-[var(--text-muted)]">{t('العائد', 'Yield')}</span> <span className="text-[var(--text-secondary)]">{formatPct(peer.dividend_yield)}</span></div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
