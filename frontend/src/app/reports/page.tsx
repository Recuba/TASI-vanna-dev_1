'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useReports } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type TypeFilter = 'all' | 'technical' | 'fundamental' | 'sector' | 'macro';

const reportTypes: { label: string; value: TypeFilter }[] = [
  { label: 'All Reports', value: 'all' },
  { label: 'Technical', value: 'technical' },
  { label: 'Fundamental', value: 'fundamental' },
  { label: 'Sector', value: 'sector' },
  { label: 'Macro', value: 'macro' },
];

const typeColors: Record<string, string> = {
  technical: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  fundamental: 'bg-gold/10 text-gold border-gold/20',
  sector: 'bg-accent-green/10 text-accent-green border-accent-green/20',
  macro: 'bg-accent-warning/10 text-accent-warning border-accent-warning/20',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const [filter, setFilter] = useState<TypeFilter>('all');

  const { data, loading, error, refetch } = useReports({
    limit: 50,
    report_type: filter === 'all' ? undefined : filter,
  });

  const reports = data?.items ?? [];

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Research Reports</h1>
          <p className="text-sm text-[var(--text-muted)]">Technical and fundamental analysis for TASI stocks</p>
        </div>

        {/* Type Filters */}
        <div className="flex gap-2 flex-wrap">
          {reportTypes.map((rt) => (
            <button
              key={rt.value}
              onClick={() => setFilter(rt.value)}
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
          <LoadingSpinner message="Loading reports..." />
        ) : error ? (
          <ErrorDisplay message={error} onRetry={refetch} />
        ) : reports.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--text-muted)]">No reports found for this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {reports.map((report) => (
              <article
                key={report.id}
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
                      'text-[10px] px-2 py-0.5 rounded-pill border uppercase tracking-wider font-medium',
                      typeColors[report.report_type] || 'bg-[var(--bg-input)] text-[var(--text-muted)]'
                    )}>
                      {report.report_type}
                    </span>
                  )}
                  {report.recommendation && (
                    <span className="text-[10px] px-2 py-0.5 rounded-pill bg-gold/10 text-gold border border-gold/20 uppercase tracking-wider font-medium">
                      {report.recommendation}
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
                    <span className="text-[var(--text-muted)]">Target:</span>
                    <span className="text-gold font-medium">{report.target_price.toFixed(2)}</span>
                    {report.current_price_at_report !== null && (
                      <>
                        <span className="text-[var(--text-muted)]">Current:</span>
                        <span className="text-[var(--text-secondary)]">{report.current_price_at_report.toFixed(2)}</span>
                      </>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
