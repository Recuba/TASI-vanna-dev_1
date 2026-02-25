'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { usePortfolio, type PortfolioTransaction } from '@/lib/hooks/use-portfolio';
import { useBatchQuotes } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = ['#D4A84B', '#22C55E', '#3B82F6', '#EF4444', '#A855F7', '#EC4899', '#F97316', '#06B6D4', '#6366F1', '#84CC16'];

function formatNum(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Add Transaction Modal
// ---------------------------------------------------------------------------

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (tx: Omit<PortfolioTransaction, 'id'>) => void;
  language: string;
  t: (ar: string, en: string) => string;
}

function AddTransactionModal({ open, onClose, onAdd, language, t }: AddModalProps) {
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('0');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tickerVal = ticker.trim().toUpperCase();
    if (!tickerVal || !quantity || !price) return;
    const finalTicker = tickerVal.endsWith('.SR') ? tickerVal : tickerVal + '.SR';
    onAdd({
      ticker: finalTicker,
      type,
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      fees: parseFloat(fees) || 0,
      date,
      notes: notes.trim(),
    });
    // Reset
    setTicker(''); setQuantity(''); setPrice(''); setFees('0'); setNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
          {t('إضافة صفقة', 'Add Transaction')}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('buy')}
              className={cn('flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                type === 'buy' ? 'bg-accent-green/15 text-accent-green border-accent-green/30' : 'text-[var(--text-muted)] border-[#2A2A2A]')}
            >
              {t('شراء', 'Buy')}
            </button>
            <button
              type="button"
              onClick={() => setType('sell')}
              className={cn('flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                type === 'sell' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'text-[var(--text-muted)] border-[#2A2A2A]')}
            >
              {t('بيع', 'Sell')}
            </button>
          </div>

          {/* Ticker */}
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('الرمز', 'Ticker')}</label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="e.g. 2222"
              required
              className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            />
          </div>

          {/* Quantity + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('الكمية', 'Quantity')}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('السعر', 'Price (SAR)')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg text-sm text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Fees + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('الرسوم', 'Fees (SAR)')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('التاريخ', 'Date')}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg text-sm text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('ملاحظات', 'Notes')}</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg text-sm text-[var(--text-primary)]"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-[var(--text-muted)] border border-[#2A2A2A] hover:text-[var(--text-secondary)] transition-colors"
            >
              {t('إلغاء', 'Cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition-colors"
            >
              {t('إضافة', 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PortfolioPage() {
  const { t, language } = useLanguage();
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const { holdings, tickers, addTransaction, removeTransaction, transactions } = usePortfolio();
  const { data: quotes, loading: quotesLoading } = useBatchQuotes(tickers);
  const [modalOpen, setModalOpen] = useState(false);
  const [showTxns, setShowTxns] = useState(false);

  // Build price map from quotes
  const priceMap = useMemo(() => {
    const map = new Map<string, { price: number; changePct: number; name: string }>();
    if (!quotes) return map;
    for (const q of quotes) {
      map.set(q.ticker, { price: q.current_price, changePct: q.change_pct, name: q.name || q.short_name || q.ticker });
    }
    return map;
  }, [quotes]);

  // Portfolio summary
  const summary = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let dayChange = 0;
    for (const h of holdings) {
      const quote = priceMap.get(h.ticker);
      const currentPrice = quote?.price ?? h.avgCostBasis;
      const changePct = quote?.changePct ?? 0;
      const holdingValue = h.totalShares * currentPrice;
      totalValue += holdingValue;
      totalCost += h.totalCost;
      dayChange += holdingValue * (changePct / 100);
    }
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const dayChangePct = totalValue > 0 ? (dayChange / totalValue) * 100 : 0;
    return { totalValue, totalCost, totalPnl, totalPnlPct, dayChange, dayChangePct };
  }, [holdings, priceMap]);

  // Allocation data for pie chart
  const allocationData = useMemo(() => {
    return holdings.map((h) => {
      const quote = priceMap.get(h.ticker);
      const currentPrice = quote?.price ?? h.avgCostBasis;
      const value = h.totalShares * currentPrice;
      return {
        ticker: h.ticker.replace('.SR', ''),
        value,
        name: quote?.name ?? h.ticker.replace('.SR', ''),
      };
    }).sort((a, b) => b.value - a.value);
  }, [holdings, priceMap]);

  const isEmpty = holdings.length === 0;

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]" dir={dir}>
              {t('المحفظة', 'Portfolio')}
            </h1>
            <p className="text-xs text-[var(--text-muted)]" dir={dir}>
              {t('تتبع استثماراتك في تداول', 'Track your TASI investments')}
              {holdings.length > 0 && ` — ${holdings.length} ${t('سهم', 'holdings')}`}
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition-colors"
          >
            + {t('إضافة صفقة', 'Add Transaction')}
          </button>
        </div>

        {isEmpty ? (
          /* Empty state */
          <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-[var(--text-muted)]">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4" dir={dir}>
              {t('ابدأ بإضافة صفقات لتتبع أداء محفظتك', 'Start by adding transactions to track your portfolio performance')}
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-6 py-2.5 rounded-lg text-sm font-medium bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition-colors"
            >
              {t('إضافة أول صفقة', 'Add First Transaction')}
            </button>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t('القيمة الإجمالية', 'Total Value'), value: formatNum(summary.totalValue), suffix: ' SAR' },
                { label: t('التكلفة الإجمالية', 'Total Cost'), value: formatNum(summary.totalCost), suffix: ' SAR' },
                {
                  label: t('الربح/الخسارة', 'Total P&L'),
                  value: `${summary.totalPnl >= 0 ? '+' : ''}${formatNum(summary.totalPnl)}`,
                  suffix: ` (${summary.totalPnlPct >= 0 ? '+' : ''}${summary.totalPnlPct.toFixed(1)}%)`,
                  color: summary.totalPnl >= 0 ? 'text-accent-green' : 'text-red-400',
                },
                {
                  label: t('تغيير اليوم', 'Day Change'),
                  value: `${summary.dayChange >= 0 ? '+' : ''}${formatNum(summary.dayChange)}`,
                  suffix: ` (${summary.dayChangePct >= 0 ? '+' : ''}${summary.dayChangePct.toFixed(1)}%)`,
                  color: summary.dayChange >= 0 ? 'text-accent-green' : 'text-red-400',
                },
              ].map((card) => (
                <div key={card.label} className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-3">
                  <p className="text-[13.5px] text-[var(--text-muted)] mb-1">{card.label}</p>
                  <p className={cn('text-sm font-bold', card.color || 'text-[var(--text-primary)]')}>
                    {quotesLoading ? '...' : card.value}
                    <span className="text-[13.5px] font-normal">{card.suffix}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* Holdings Table + Allocation Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Holdings Table */}
              <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3" dir={dir}>
                  {t('الحيازات', 'Holdings')}
                </h2>
                {quotesLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--text-muted)] border-b border-[#2A2A2A]">
                            <th className="text-start py-2 font-medium">{t('الرمز', 'Ticker')}</th>
                            <th className="text-end py-2 font-medium">{t('الأسهم', 'Shares')}</th>
                            <th className="text-end py-2 font-medium">{t('المتوسط', 'Avg Cost')}</th>
                            <th className="text-end py-2 font-medium">{t('السعر', 'Price')}</th>
                            <th className="text-end py-2 font-medium">{t('القيمة', 'Value')}</th>
                            <th className="text-end py-2 font-medium">{t('الربح/الخسارة', 'P&L')}</th>
                            <th className="text-end py-2 font-medium">{t('الوزن', 'Weight')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holdings.map((h) => {
                            const quote = priceMap.get(h.ticker);
                            const currentPrice = quote?.price ?? h.avgCostBasis;
                            const value = h.totalShares * currentPrice;
                            const pnl = value - h.totalCost;
                            const pnlPct = h.totalCost > 0 ? (pnl / h.totalCost) * 100 : 0;
                            const weight = summary.totalValue > 0 ? (value / summary.totalValue) * 100 : 0;
                            return (
                              <tr key={h.ticker} className="border-b border-[#2A2A2A]/50 hover:bg-[var(--bg-card-hover)] transition-colors">
                                <td className="py-2.5">
                                  <Link href={`/stock/${encodeURIComponent(h.ticker)}`} className="text-gold hover:text-gold-light font-medium">
                                    {h.ticker.replace('.SR', '')}
                                  </Link>
                                  {quote && <p className="text-[13.5px] text-[var(--text-muted)] truncate max-w-[120px]">{quote.name}</p>}
                                </td>
                                <td className="text-end py-2.5 text-[var(--text-secondary)]">{h.totalShares.toLocaleString()}</td>
                                <td className="text-end py-2.5 text-[var(--text-secondary)]">{h.avgCostBasis.toFixed(2)}</td>
                                <td className="text-end py-2.5 text-[var(--text-primary)] font-medium">{currentPrice.toFixed(2)}</td>
                                <td className="text-end py-2.5 text-[var(--text-primary)]">{formatNum(value)}</td>
                                <td className={cn('text-end py-2.5 font-medium', pnl >= 0 ? 'text-accent-green' : 'text-red-400')}>
                                  {pnl >= 0 ? '+' : ''}{formatNum(pnl)}
                                  <span className="text-[13.5px] block">{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</span>
                                </td>
                                <td className="text-end py-2.5 text-[var(--text-muted)]">{weight.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-2">
                      {holdings.map((h) => {
                        const quote = priceMap.get(h.ticker);
                        const currentPrice = quote?.price ?? h.avgCostBasis;
                        const value = h.totalShares * currentPrice;
                        const pnl = value - h.totalCost;
                        const pnlPct = h.totalCost > 0 ? (pnl / h.totalCost) * 100 : 0;
                        return (
                          <Link
                            key={h.ticker}
                            href={`/stock/${encodeURIComponent(h.ticker)}`}
                            className="block bg-[var(--bg-input)] border border-[#2A2A2A]/50 rounded-lg p-3"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gold">{h.ticker.replace('.SR', '')}</span>
                              <span className={cn('text-xs font-medium', pnl >= 0 ? 'text-accent-green' : 'text-red-400')}>
                                {pnl >= 0 ? '+' : ''}{formatNum(pnl)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[13.5px]">
                              <div>
                                <p className="text-[var(--text-muted)]">{t('الأسهم', 'Shares')}</p>
                                <p className="text-[var(--text-secondary)] font-medium">{h.totalShares}</p>
                              </div>
                              <div>
                                <p className="text-[var(--text-muted)]">{t('السعر', 'Price')}</p>
                                <p className="text-[var(--text-primary)] font-medium">{currentPrice.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-[var(--text-muted)]">{t('القيمة', 'Value')}</p>
                                <p className="text-[var(--text-primary)] font-medium">{formatNum(value)}</p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Allocation Pie Chart */}
              <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3" dir={dir}>
                  {t('التوزيع', 'Allocation')}
                </h2>
                {allocationData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={allocationData}
                        dataKey="value"
                        nameKey="ticker"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {allocationData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <ReTooltip
                        contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '11px' }}
                        formatter={(value: number | undefined) => [`${formatNum(value ?? 0)} SAR`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : null}
                {/* Legend */}
                <div className="space-y-1 mt-2">
                  {allocationData.map((item, i) => {
                    const pct = summary.totalValue > 0 ? (item.value / summary.totalValue) * 100 : 0;
                    return (
                      <div key={item.ticker} className="flex items-center justify-between text-[13.5px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-[var(--text-secondary)]">{item.ticker}</span>
                        </div>
                        <span className="text-[var(--text-muted)]">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Transaction History */}
            <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]" dir={dir}>
                  {t('سجل الصفقات', 'Transaction History')}
                  <span className="text-[13.5px] text-[var(--text-muted)] font-normal ms-2">({transactions.length})</span>
                </h2>
                <button
                  onClick={() => setShowTxns(!showTxns)}
                  className="text-xs text-gold hover:text-gold-light transition-colors"
                >
                  {showTxns ? t('إخفاء', 'Hide') : t('عرض', 'Show')}
                </button>
              </div>
              {showTxns && (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {transactions.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] text-center py-4" dir={dir}>
                      {t('لا توجد صفقات', 'No transactions')}
                    </p>
                  ) : (
                    [...transactions].reverse().map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-[var(--bg-input)] transition-colors text-xs">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'text-[12.5px] font-bold px-1.5 py-0.5 rounded-full uppercase',
                            tx.type === 'buy' ? 'bg-accent-green/20 text-accent-green' : 'bg-red-500/20 text-red-400'
                          )}>
                            {tx.type === 'buy' ? t('شراء', 'BUY') : t('بيع', 'SELL')}
                          </span>
                          <span className="text-[var(--text-primary)] font-medium">{tx.ticker.replace('.SR', '')}</span>
                          <span className="text-[var(--text-muted)]">
                            {tx.quantity} x {tx.price.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[var(--text-muted)]">{tx.date}</span>
                          <button
                            onClick={() => removeTransaction(tx.id)}
                            className="text-red-400/60 hover:text-red-400 transition-colors"
                            title={t('حذف', 'Remove')}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Data notice */}
        <p className="text-[13.5px] text-[var(--text-muted)] text-center" dir={dir}>
          {t('البيانات محفوظة في المتصفح فقط', 'Data stored in browser localStorage only')}
        </p>

      </div>

      <AddTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addTransaction}
        language={language}
        t={t}
      />
    </div>
  );
}
