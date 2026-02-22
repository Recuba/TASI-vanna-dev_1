'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import type { AlertCreate } from '@/lib/api/alerts';

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (alert: AlertCreate) => void;
  /** Pre-fill ticker when opened from stock detail page */
  defaultTicker?: string;
  /** Current price to show as reference */
  currentPrice?: number;
}

export function AlertModal({ open, onClose, onAdd, defaultTicker, currentPrice }: AlertModalProps) {
  const { t, language } = useLanguage();
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const [ticker, setTicker] = useState(defaultTicker?.replace('.SR', '') ?? '');
  const [alertType, setAlertType] = useState<'price_above' | 'price_below'>('price_above');
  const [threshold, setThreshold] = useState(currentPrice?.toString() ?? '');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tickerVal = ticker.trim().toUpperCase();
    if (!tickerVal || !threshold) return;
    const finalTicker = tickerVal.endsWith('.SR') ? tickerVal : tickerVal + '.SR';
    onAdd({
      ticker: finalTicker,
      alert_type: alertType,
      threshold_value: parseFloat(threshold),
    });
    setTicker('');
    setThreshold('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
        dir={dir}
      >
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
          {t('إنشاء تنبيه سعر', 'Create Price Alert')}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
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

          {/* Alert type */}
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('النوع', 'Condition')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAlertType('price_above')}
                className={cn('flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                  alertType === 'price_above'
                    ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                    : 'text-[var(--text-muted)] border-[#2A2A2A]')}
              >
                {t('أعلى من', 'Price Above')}
              </button>
              <button
                type="button"
                onClick={() => setAlertType('price_below')}
                className={cn('flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                  alertType === 'price_below'
                    ? 'bg-red-500/15 text-red-400 border-red-500/30'
                    : 'text-[var(--text-muted)] border-[#2A2A2A]')}
              >
                {t('أقل من', 'Price Below')}
              </button>
            </div>
          </div>

          {/* Threshold */}
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">
              {t('السعر المستهدف', 'Target Price (SAR)')}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              required
              className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg text-sm text-[var(--text-primary)]"
            />
            {currentPrice !== undefined && (
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                {t('السعر الحالي:', 'Current price:')} {currentPrice.toFixed(2)} SAR
              </p>
            )}
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
              {t('إنشاء التنبيه', 'Create Alert')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
