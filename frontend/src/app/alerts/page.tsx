'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { useAlerts } from '@/lib/hooks/use-alerts';
import { AlertModal } from '@/components/alerts/AlertModal';

export default function AlertsPage() {
  const { t, language } = useLanguage();
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const { alerts, triggeredAlerts, addAlert, removeAlert, toggleAlert, clearAll } = useAlerts();
  const [modalOpen, setModalOpen] = useState(false);

  const triggeredIds = new Set(triggeredAlerts.map((a) => a.id));

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]" dir={dir}>
              {t('تنبيهات الأسعار', 'Price Alerts')}
            </h1>
            <p className="text-xs text-[var(--text-muted)]" dir={dir}>
              {t('إدارة تنبيهات أسعار الأسهم', 'Manage your stock price alerts')}
              {alerts.length > 0 && ` — ${alerts.length} ${t('تنبيه', 'alerts')}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                onClick={clearAll}
                className="px-3 py-2 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
              >
                {t('مسح الكل', 'Clear All')}
              </button>
            )}
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition-colors"
            >
              + {t('تنبيه جديد', 'New Alert')}
            </button>
          </div>
        </div>

        {alerts.length === 0 ? (
          /* Empty state */
          <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-12 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-[var(--text-muted)] mb-3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0" />
            </svg>
            <p className="text-sm text-[var(--text-muted)] mb-4" dir={dir}>
              {t('أنشئ تنبيهات لتلقي إشعارات عند وصول السهم لسعر معين', 'Create alerts to get notified when a stock reaches a target price')}
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-6 py-2.5 rounded-lg text-sm font-medium bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition-colors"
            >
              {t('إنشاء أول تنبيه', 'Create First Alert')}
            </button>
          </div>
        ) : (
          <>
            {/* Triggered alerts section */}
            {triggeredAlerts.length > 0 && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                <h2 className="text-sm font-bold text-red-400 mb-3" dir={dir}>
                  {t('تنبيهات مفعّلة', 'Triggered Alerts')}
                  <span className="text-[10px] font-normal ms-2">({triggeredAlerts.length})</span>
                </h2>
                <div className="space-y-2">
                  {triggeredAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between bg-[var(--bg-card)] border border-[#2A2A2A] rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'text-[9px] font-bold px-2 py-1 rounded-full',
                          alert.alert_type === 'price_above' ? 'bg-accent-green/20 text-accent-green' : 'bg-red-500/20 text-red-400'
                        )}>
                          {alert.alert_type === 'price_above' ? '▲ ' + t('أعلى من', 'ABOVE') : '▼ ' + t('أقل من', 'BELOW')}
                        </span>
                        <div>
                          <Link href={`/stock/${encodeURIComponent(alert.ticker)}`} className="text-sm font-medium text-gold hover:text-gold-light">
                            {alert.ticker.replace('.SR', '')}
                          </Link>
                          <p className="text-[10px] text-[var(--text-muted)]">
                            {t('السعر المستهدف:', 'Target:')} {alert.threshold_value.toFixed(2)} SAR
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-red-400 px-2 py-1 bg-red-500/10 rounded-full">
                        {t('مفعّل', 'TRIGGERED')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All alerts */}
            <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
              <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3" dir={dir}>
                {t('جميع التنبيهات', 'All Alerts')}
              </h2>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--text-muted)] border-b border-[#2A2A2A]">
                      <th className="text-start py-2 font-medium">{t('الرمز', 'Ticker')}</th>
                      <th className="text-start py-2 font-medium">{t('النوع', 'Condition')}</th>
                      <th className="text-end py-2 font-medium">{t('السعر المستهدف', 'Target')}</th>
                      <th className="text-center py-2 font-medium">{t('الحالة', 'Status')}</th>
                      <th className="text-end py-2 font-medium">{t('التاريخ', 'Created')}</th>
                      <th className="text-end py-2 font-medium">{t('إجراءات', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => {
                      const isTriggered = triggeredIds.has(alert.id);
                      return (
                        <tr key={alert.id} className="border-b border-[#2A2A2A]/50 hover:bg-[var(--bg-card-hover)] transition-colors">
                          <td className="py-2.5">
                            <Link href={`/stock/${encodeURIComponent(alert.ticker)}`} className="text-gold hover:text-gold-light font-medium">
                              {alert.ticker.replace('.SR', '')}
                            </Link>
                          </td>
                          <td className="py-2.5">
                            <span className={cn(
                              'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                              alert.alert_type === 'price_above' ? 'bg-accent-green/20 text-accent-green' : 'bg-red-500/20 text-red-400'
                            )}>
                              {alert.alert_type === 'price_above' ? t('أعلى من', 'ABOVE') : t('أقل من', 'BELOW')}
                            </span>
                          </td>
                          <td className="text-end py-2.5 text-[var(--text-primary)] font-medium">{alert.threshold_value.toFixed(2)}</td>
                          <td className="text-center py-2.5">
                            {isTriggered ? (
                              <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">{t('مفعّل', 'TRIGGERED')}</span>
                            ) : alert.is_active ? (
                              <span className="text-[9px] font-bold text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-full">{t('نشط', 'ACTIVE')}</span>
                            ) : (
                              <span className="text-[9px] font-bold text-[var(--text-muted)] bg-[var(--bg-input)] px-2 py-0.5 rounded-full">{t('متوقف', 'PAUSED')}</span>
                            )}
                          </td>
                          <td className="text-end py-2.5 text-[var(--text-muted)]">
                            {new Date(alert.created_at).toLocaleDateString()}
                          </td>
                          <td className="text-end py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => toggleAlert(alert.id)}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-gold transition-colors"
                                title={alert.is_active ? t('إيقاف', 'Pause') : t('تفعيل', 'Activate')}
                              >
                                {alert.is_active ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                                  </svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                  </svg>
                                )}
                              </button>
                              <button
                                onClick={() => removeAlert(alert.id)}
                                className="p-1 rounded text-red-400/60 hover:text-red-400 transition-colors"
                                title={t('حذف', 'Delete')}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {alerts.map((alert) => {
                  const isTriggered = triggeredIds.has(alert.id);
                  return (
                    <div key={alert.id} className="bg-[var(--bg-input)] border border-[#2A2A2A]/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Link href={`/stock/${encodeURIComponent(alert.ticker)}`} className="text-sm font-medium text-gold">
                          {alert.ticker.replace('.SR', '')}
                        </Link>
                        <div className="flex items-center gap-2">
                          {isTriggered ? (
                            <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">{t('مفعّل', 'TRIGGERED')}</span>
                          ) : alert.is_active ? (
                            <span className="text-[9px] font-bold text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-full">{t('نشط', 'ACTIVE')}</span>
                          ) : (
                            <span className="text-[9px] font-bold text-[var(--text-muted)] bg-[var(--bg-input)] px-2 py-0.5 rounded-full">{t('متوقف', 'PAUSED')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn(
                            'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                            alert.alert_type === 'price_above' ? 'bg-accent-green/20 text-accent-green' : 'bg-red-500/20 text-red-400'
                          )}>
                            {alert.alert_type === 'price_above' ? '▲' : '▼'}
                          </span>
                          <span className="text-[var(--text-primary)] font-medium">{alert.threshold_value.toFixed(2)} SAR</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleAlert(alert.id)} className="p-1 text-[var(--text-muted)] hover:text-gold">
                            {alert.is_active ? '⏸' : '▶'}
                          </button>
                          <button onClick={() => removeAlert(alert.id)} className="p-1 text-red-400/60 hover:text-red-400">✕</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Info notice */}
        <p className="text-[10px] text-[var(--text-muted)] text-center" dir={dir}>
          {t(
            'التنبيهات محفوظة في المتصفح فقط. يتم التحقق من الأسعار كل 30 ثانية.',
            'Alerts stored in browser localStorage. Prices checked every 30 seconds via batch quotes.'
          )}
        </p>
      </div>

      <AlertModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addAlert}
      />
    </div>
  );
}
