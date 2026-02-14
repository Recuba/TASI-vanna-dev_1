'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getReports, type ReportItem } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';
import { useLanguage } from '@/providers/LanguageProvider';

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type TypeFilter = 'all' | 'technical' | 'fundamental' | 'sector' | 'macro';

const typeColors: Record<string, string> = {
  technical: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  fundamental: 'bg-gold/10 text-gold border-gold/20',
  sector: 'bg-accent-green/10 text-accent-green border-accent-green/20',
  macro: 'bg-accent-warning/10 text-accent-warning border-accent-warning/20',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Paginated response from backend (matches PaginatedResponse[ReportResponse])
// ---------------------------------------------------------------------------

interface PaginatedReportResponse {
  items: ReportItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { t, language, isRTL } = useLanguage();
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<PaginatedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const reportTypes: { label: string; value: TypeFilter }[] = [
    { label: t('الكل', 'All'), value: 'all' },
    { label: t('فني', 'Technical'), value: 'technical' },
    { label: t('أساسي', 'Fundamental'), value: 'fundamental' },
    { label: t('قطاعي', 'Sector'), value: 'sector' },
    { label: t('اقتصاد كلي', 'Macro'), value: 'macro' },
  ];

  const typeLabels: Record<string, string> = {
    technical: t('فني', 'Technical'),
    fundamental: t('أساسي', 'Fundamental'),
    sector: t('قطاعي', 'Sector'),
    macro: t('اقتصاد كلي', 'Macro'),
  };

  const recommendationLabels: Record<string, string> = {
    buy: t('شراء', 'Buy'),
    sell: t('بيع', 'Sell'),
    hold: t('إبقاء', 'Hold'),
    strong_buy: t('شراء قوي', 'Strong Buy'),
    strong_sell: t('بيع قوي', 'Strong Sell'),
  };

  const fetchReports = useCallback(async () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const json = await getReports(
        {
          page,
          page_size: PAGE_SIZE,
          report_type: filter !== 'all' ? filter : undefined,
          search: search.trim() || undefined,
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setData(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => {
    fetchReports();
    return () => {
      controllerRef.current?.abort();
    };
  }, [fetchReports]);

  const reports = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const total = data?.total ?? 0;

  function handleFilterChange(newFilter: TypeFilter) {
    setFilter(newFilter);
    setPage(1);
  }

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Header */}
        <div dir={isRTL ? 'rtl' : 'ltr'}>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('تقارير البحث', 'Research Reports')}</h1>
          <p className="text-sm text-[var(--text-muted)]">{t('تحليلات فنية وأساسية لأسهم تاسي', 'Technical & fundamental analysis for TASI stocks')}</p>
        </div>

        {/* Search */}
        <div className="relative" dir={isRTL ? 'rtl' : 'ltr'}>
          <svg className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]', isRTL ? 'right-3' : 'left-3')} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('ابحث في التقارير...', 'Search reports...')}
            className={cn(
              'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
              'border gold-border rounded-md px-3 py-2 text-sm',
              'ps-10',
              'placeholder:text-[var(--text-muted)]',
              'focus:outline-none focus:border-gold transition-colors',
            )}
          />
        </div>

        {/* Type Filters */}
        <div className="flex gap-2 flex-wrap" dir={isRTL ? 'rtl' : 'ltr'}>
          {reportTypes.map((rt) => (
            <button
              key={rt.value}
              onClick={() => handleFilterChange(rt.value)}
              className={cn(
                'px-3 py-1.5 rounded-pill text-xs font-medium transition-all duration-200',
                filter === rt.value
                  ? 'bg-gold/20 text-gold border border-gold/40'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border gold-border hover:text-[var(--text-primary)]'
              )}
            >
              {rt.label}
            </button>
          ))}
        </div>

        {/* Reports Grid */}
        {loading ? (
          <LoadingSpinner message={t('جاري تحميل التقارير...', 'Loading reports...')} />
        ) : error ? (
          <ErrorDisplay message={error} onRetry={fetchReports} />
        ) : reports.length === 0 ? (
          <div className="text-center py-12" dir={isRTL ? 'rtl' : 'ltr'}>
            <p className="text-sm text-[var(--text-muted)] mb-4">{t('لم يتم العثور على تقارير لهذه الفئة.', 'No reports found for this category.')}</p>
            <Link
              href="/chat"
              className={cn(
                'inline-block px-5 py-2 rounded-md text-sm font-medium',
                'bg-gold/20 text-gold border border-gold/30',
                'hover:bg-gold/30 transition-colors'
              )}
            >
              {t('اسأل رعد عن هذا القطاع', 'Ask Ra\'d about this sector')}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reports.map((report) => (
                <article
                  key={report.id}
                  dir={isRTL ? 'rtl' : 'ltr'}
                  className={cn(
                    'p-4 rounded-md flex flex-col',
                    'bg-[var(--bg-card)] border gold-border',
                    'hover:border-gold/40 transition-colors'
                  )}
                >
                  {/* Type badge */}
                  <div className="flex items-center gap-2 mb-2">
                    {report.report_type && (
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-pill border tracking-wider font-medium',
                        typeColors[report.report_type] || 'bg-[var(--bg-input)] text-[var(--text-muted)]'
                      )}>
                        {typeLabels[report.report_type] || report.report_type}
                      </span>
                    )}
                    {report.recommendation && (
                      <span className="text-[10px] px-2 py-0.5 rounded-pill bg-gold/10 text-gold border border-gold/20 tracking-wider font-medium">
                        {recommendationLabels[report.recommendation.toLowerCase()] || report.recommendation}
                      </span>
                    )}
                    {report.published_at && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {new Date(report.published_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1 leading-snug">
                    {report.source_url && report.source_url !== '#' ? (
                      <a
                        href={report.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-gold transition-colors"
                      >
                        {report.title}
                      </a>
                    ) : (
                      report.title
                    )}
                  </h3>
                  {report.summary && (
                    <p className="text-xs text-[var(--text-secondary)] mb-3 line-clamp-3 flex-1">
                      {report.summary}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-muted)]">
                      {report.author || report.source_name || '-'}
                    </span>
                    {report.ticker && (
                      <a
                        href={`/stock/${encodeURIComponent(report.ticker)}`}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold font-medium hover:bg-gold/20 transition-colors"
                      >
                        {report.ticker}
                      </a>
                    )}
                  </div>

                  {/* Target price */}
                  {report.target_price !== null && (
                    <div className="mt-2 pt-2 border-t border-[var(--bg-input)] flex items-center gap-2 text-xs">
                      <span className="text-[var(--text-muted)]">{t('السعر المستهدف:', 'Target Price:')}</span>
                      <span className="text-gold font-medium">{report.target_price.toFixed(2)}</span>
                      {report.current_price_at_report !== null && (
                        <>
                          <span className="text-[var(--text-muted)]">{t('السعر الحالي:', 'Current Price:')}</span>
                          <span className="text-[var(--text-secondary)]">{report.current_price_at_report.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-2 pb-4" dir={isRTL ? 'rtl' : 'ltr'}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-md border transition-colors',
                    page === 1
                      ? 'border-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed opacity-50'
                      : 'border-gold/30 text-gold bg-[var(--bg-card)] hover:bg-gold/10 hover:border-gold/50'
                  )}
                >
                  {t('السابق', 'Previous')}
                </button>
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {t(`صفحة ${page} من ${totalPages}`, `Page ${page} of ${totalPages}`)}
                  <span className="text-[var(--text-muted)] ms-1">({total} {t('تقرير', 'reports')})</span>
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-md border transition-colors',
                    page >= totalPages
                      ? 'border-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed opacity-50'
                      : 'border-gold/30 text-gold bg-[var(--bg-card)] hover:bg-gold/10 hover:border-gold/50'
                  )}
                >
                  {t('التالي', 'Next')}
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
