'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useNews } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ErrorDisplay } from '@/components/common/error-display';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewsPage() {
  const [limit] = useState(50);
  const { data, loading, error, refetch } = useNews({ limit });

  const articles = data?.items ?? [];

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Market News</h1>
            <p className="text-sm text-[var(--text-muted)]">Latest updates from TASI and Saudi markets</p>
          </div>
        </div>

        {/* News Feed */}
        {loading ? (
          <LoadingSpinner message="Loading news..." />
        ) : error ? (
          <ErrorDisplay message={error} onRetry={refetch} />
        ) : articles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--text-muted)]">No news articles available yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <article
                key={article.id}
                className={cn(
                  'p-4 rounded-md',
                  'bg-[var(--bg-card)] border gold-border',
                  'hover:border-gold/40 transition-colors'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1 leading-snug">
                      {article.source_url && article.source_url !== '#' ? (
                        <a
                          href={article.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-gold transition-colors"
                        >
                          {article.title}
                        </a>
                      ) : (
                        article.title
                      )}
                    </h3>
                    {article.body && (
                      <p className="text-xs text-[var(--text-secondary)] mb-2 line-clamp-2">
                        {article.body}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                      {article.source_name && <span>{article.source_name}</span>}
                      {article.published_at && (
                        <span>{new Date(article.published_at).toLocaleDateString('ar-SA')}</span>
                      )}
                      {article.sentiment_label && (
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider',
                          article.sentiment_label === 'positive'
                            ? 'bg-accent-green/10 text-accent-green'
                            : article.sentiment_label === 'negative'
                              ? 'bg-accent-red/10 text-accent-red'
                              : 'bg-[var(--bg-input)]',
                        )}>
                          {article.sentiment_label}
                        </span>
                      )}
                      {article.language && (
                        <span className="px-1.5 py-0.5 bg-[var(--bg-input)] rounded text-[10px] uppercase tracking-wider">
                          {article.language}
                        </span>
                      )}
                    </div>
                    {article.ticker && (
                      <div className="flex gap-1.5 mt-2">
                        <a
                          href={`/stock/${encodeURIComponent(article.ticker)}`}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold font-medium hover:bg-gold/20 transition-colors"
                        >
                          {article.ticker}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
