'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { useAlerts } from '@/lib/hooks/use-alerts';

/**
 * Header bell icon with unread triggered-alert count badge.
 * Clicking opens a dropdown showing triggered alerts + link to full alerts page.
 */
export function AlertBell() {
  const { t, language } = useLanguage();
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const { activeAlerts, triggeredAlerts, newTriggeredCount, markAllSeen } = useAlerts();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && newTriggeredCount > 0) {
      markAllSeen();
    }
    setOpen(!open);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          'text-[var(--text-secondary)] hover:text-gold hover:bg-[var(--bg-card-hover)]',
          open && 'text-gold bg-[var(--bg-card-hover)]',
        )}
        aria-label={t('التنبيهات', 'Alerts')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0" />
        </svg>
        {/* Badge */}
        {newTriggeredCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 w-4 h-4 bg-red-500 text-white text-[12.5px] font-bold rounded-full flex items-center justify-center">
            {newTriggeredCount > 9 ? '9+' : newTriggeredCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={cn(
            'absolute top-full mt-2 w-72 bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl shadow-lg z-50',
            language === 'ar' ? 'start-0' : 'end-0',
          )}
          dir={dir}
        >
          <div className="p-3 border-b border-[#2A2A2A]">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {t('التنبيهات', 'Price Alerts')}
              <span className="text-[13.5px] text-[var(--text-muted)] font-normal ms-2">
                ({activeAlerts.length} {t('نشط', 'active')})
              </span>
            </h3>
          </div>

          <div className="max-h-[240px] overflow-y-auto">
            {triggeredAlerts.length > 0 ? (
              <div className="p-2 space-y-1">
                <p className="text-[13.5px] text-red-400 font-medium px-1 mb-1">
                  {t('تنبيهات مفعّلة', 'Triggered Alerts')}
                </p>
                {triggeredAlerts.map((alert) => (
                  <div key={alert.id} className="px-2 py-1.5 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-primary)] font-medium">{alert.ticker.replace('.SR', '')}</span>
                      <span className={cn(
                        'text-[12.5px] px-1.5 py-0.5 rounded-full font-bold',
                        alert.alert_type === 'price_above' ? 'bg-accent-green/20 text-accent-green' : 'bg-red-500/20 text-red-400'
                      )}>
                        {alert.alert_type === 'price_above' ? '▲' : '▼'} {alert.threshold_value.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeAlerts.length > 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">
                  {t('لا توجد تنبيهات مفعّلة حالياً', 'No alerts triggered currently')}
                </p>
              </div>
            ) : (
              <div className="p-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">
                  {t('لم يتم إنشاء تنبيهات بعد', 'No alerts created yet')}
                </p>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-[#2A2A2A]">
            <Link
              href="/alerts"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-gold hover:text-gold-light transition-colors py-1.5"
            >
              {t('إدارة جميع التنبيهات', 'Manage All Alerts')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
