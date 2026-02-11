'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { type ReportItem } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type TypeFilter = 'all' | 'technical' | 'fundamental' | 'sector' | 'macro';

const reportTypes: { label: string; value: TypeFilter }[] = [
  { label: 'جميع التقارير', value: 'all' },
  { label: 'فني', value: 'technical' },
  { label: 'أساسي', value: 'fundamental' },
  { label: 'قطاعي', value: 'sector' },
  { label: 'اقتصاد كلي', value: 'macro' },
];

const typeLabels: Record<string, string> = {
  technical: 'فني',
  fundamental: 'أساسي',
  sector: 'قطاعي',
  macro: 'اقتصاد كلي',
};

const recommendationLabels: Record<string, string> = {
  buy: 'شراء',
  sell: 'بيع',
  hold: 'إبقاء',
  strong_buy: 'شراء قوي',
  strong_sell: 'بيع قوي',
};

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
const API_BASE = '';

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
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<PaginatedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (filter !== 'all') {
        params.set('report_type', filter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const res = await fetch(`${API_BASE}/api/reports?${params}`);
      if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
      const json: PaginatedReportResponse = await res.json();
      if (mountedRef.current) setData(json);
    } catch (err) {
      if (mountedRef.current) setError((err as Error).message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => {
    mountedRef.current = true;
    fetchReports();
    return () => { mountedRef.current = false; };
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
        <div dir="rtl">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">تقارير البحث</h1>
          <p className="text-sm text-[var(--text-muted)]">تحليلات فنية وأساسية لأسهم تاسي</p>
        </div>

        {/* Search */}
        <div className="relative" dir="rtl">
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="ابحث في التقارير..."
            className={cn(
              'w-full bg-[var(--bg-input)] text-[var(--text-primary)]',
              'border gold-border rounded-md px-3 py-2 pr-10 text-sm',
              'placeholder:text-[var(--text-muted)]',
              'focus:outline-none focus:border-gold transition-colors',
            )}
          />
        </div>

        {/* Type Filters */}
        <div className="flex gap-2 flex-wrap" dir="rtl">
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
          <LoadingSpinner message="جاري تحميل التقارير..." />
        ) : error ? (
          <ErrorDisplay message={error} onRetry={fetchReports} />
        ) : reports.length === 0 ? (
          <div className="text-center py-12" dir="rtl">
            <p className="text-sm text-[var(--text-muted)] mb-4">لم يتم العثور على تقارير لهذه الفئة.</p>
            <Link
              href="/chat"
              className={cn(
                'inline-block px-5 py-2 rounded-md text-sm font-medium',
                'bg-gold/20 text-gold border border-gold/30',
                'hover:bg-gold/30 transition-colors'
              )}
            >
              اسأل رائد عن هذا القطاع
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reports.map((report) => (
                <article
                  key={report.id}
                  dir="rtl"
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
                        {new Date(report.published_at).toLocaleDateString('ar-SA')}
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
                      <span className="text-[var(--text-muted)]">السعر المستهدف:</span>
                      <span className="text-gold font-medium">{report.target_price.toFixed(2)}</span>
                      {report.current_price_at_report !== null && (
                        <>
                          <span className="text-[var(--text-muted)]">السعر الحالي:</span>
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
              <div className="flex items-center justify-center gap-4 pt-2 pb-4" dir="rtl">
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
                  السابق
                </button>
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  صفحة {page} من {totalPages}
                  <span className="text-[var(--text-muted)] mr-1">({total} تقرير)</span>
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
                  التالي
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
