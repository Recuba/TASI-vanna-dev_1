'use client';

import React, { memo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useReportsByTicker } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';

interface StockReportsSectionProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

export const StockReportsSection = memo(function StockReportsSection({ ticker, language, t }: StockReportsSectionProps) {
  const { data: reportsData, loading } = useReportsByTicker(ticker, { page: 1, page_size: 5 });
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (!loading && (!reportsData || reportsData.items.length === 0)) return null;

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
      <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
        {t('تقارير ذات صلة', 'Related Reports')}
      </h2>
      {loading ? (
        <div className="flex justify-center py-6"><LoadingSpinner message={t('جاري التحميل...', 'Loading...')} /></div>
      ) : (
        <div className="space-y-3">
          {reportsData?.items.map((report) => (
            <div key={report.id} className={cn('p-3 rounded-lg', 'bg-[var(--bg-input)]', 'border border-transparent')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-[var(--text-primary)] line-clamp-2" dir={dir}>{report.title}</h3>
                  {report.summary && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2" dir={dir}>{report.summary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {report.recommendation && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase',
                        report.recommendation.toLowerCase().includes('buy') ? 'bg-accent-green/15 text-accent-green'
                          : report.recommendation.toLowerCase().includes('sell') ? 'bg-accent-red/15 text-accent-red'
                            : 'bg-gold/15 text-gold',
                      )}>
                        {report.recommendation}
                      </span>
                    )}
                    {report.target_price !== null && (
                      <span className="text-[10px] text-[var(--text-muted)]">{t('السعر المستهدف', 'Target')}: {report.target_price.toFixed(2)} SAR</span>
                    )}
                    {report.author && <span className="text-[10px] text-[var(--text-muted)]">{report.author}</span>}
                    {report.published_at && (
                      <time className="text-[10px] text-[var(--text-muted)]" dateTime={report.published_at}>
                        {new Date(report.published_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </time>
                    )}
                  </div>
                </div>
                {report.source_url && (
                  <a href={report.source_url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-gold hover:bg-[var(--bg-card-hover)] transition-colors"
                    title={t('فتح التقرير', 'Open report')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          ))}
          {reportsData && reportsData.total > 5 && (
            <Link href={`/reports?ticker=${encodeURIComponent(ticker)}`} className="block text-center text-xs text-gold hover:text-gold-light transition-colors py-2 font-medium" dir={dir}>
              {t('عرض كل التقارير', 'View all reports')} ({reportsData.total})
            </Link>
          )}
        </div>
      )}
    </section>
  );
});
