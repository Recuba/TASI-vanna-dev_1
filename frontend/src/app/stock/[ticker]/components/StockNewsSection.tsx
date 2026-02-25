'use client';

import React, { memo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useNewsByTicker } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';

interface StockNewsSectionProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

export const StockNewsSection = memo(function StockNewsSection({ ticker, language, t }: StockNewsSectionProps) {
  const { data: newsData, loading } = useNewsByTicker(ticker, { page: 1, page_size: 5 });
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (!loading && (!newsData || newsData.items.length === 0)) return null;

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
      <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
        {t('أخبار ذات صلة', 'Related News')}
      </h2>
      {loading ? (
        <div className="flex justify-center py-6"><LoadingSpinner message={t('جاري التحميل...', 'Loading...')} /></div>
      ) : (
        <div className="space-y-3">
          {newsData?.items.map((article) => (
            <Link
              key={article.id}
              href={`/news/${article.id}`}
              className={cn('block p-3 rounded-lg', 'bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)]', 'border border-transparent hover:border-gold/20', 'transition-all duration-200 group')}
            >
              <h3 className="text-sm font-medium text-[var(--text-primary)] group-hover:text-gold transition-colors line-clamp-2" dir={dir}>
                {article.title}
              </h3>
              <div className="flex items-center gap-2 mt-2">
                {article.source_name && (
                  <span className="text-[13.5px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold font-medium">{article.source_name}</span>
                )}
                {article.published_at && (
                  <time className="text-[13.5px] text-[var(--text-muted)]" dateTime={article.published_at}>
                    {new Date(article.published_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </time>
                )}
                {article.sentiment_label && (
                  <span className={cn('text-[13.5px] px-1.5 py-0.5 rounded-full font-medium',
                    article.sentiment_label.toLowerCase().includes('positive') || article.sentiment_label === 'إيجابي'
                      ? 'bg-accent-green/15 text-accent-green'
                      : article.sentiment_label.toLowerCase().includes('negative') || article.sentiment_label === 'سلبي'
                        ? 'bg-accent-red/15 text-accent-red'
                        : 'bg-gray-500/15 text-gray-400',
                  )}>
                    {article.sentiment_label}
                  </span>
                )}
              </div>
            </Link>
          ))}
          {newsData && newsData.total > 5 && (
            <Link href={`/news?ticker=${encodeURIComponent(ticker)}`} className="block text-center text-xs text-gold hover:text-gold-light transition-colors py-2 font-medium" dir={dir}>
              {t('عرض كل الأخبار', 'View all news')} ({newsData.total})
            </Link>
          )}
        </div>
      )}
    </section>
  );
});
