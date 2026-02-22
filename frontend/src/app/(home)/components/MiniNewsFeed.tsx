'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useNewsFeed } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { LoadingSpinner } from '@/components/common/loading-spinner';

function timeAgo(dateStr: string, language: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return language === 'ar' ? 'الآن' : 'Just now';
    if (diffMin < 60) return language === 'ar' ? `منذ ${diffMin} دقيقة` : `${diffMin}m ago`;
    if (diffHr < 24) return language === 'ar' ? `منذ ${diffHr} ساعة` : `${diffHr}h ago`;
    return language === 'ar' ? `منذ ${diffDay} يوم` : `${diffDay}d ago`;
  } catch {
    return '';
  }
}

function ImpactBadge({ score }: { score?: string }) {
  if (!score || score === 'low') return null;
  return (
    <span className={cn(
      'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase',
      score === 'high' ? 'bg-accent-red/20 text-accent-red' : 'bg-accent-warning/20 text-accent-warning'
    )}>
      {score}
    </span>
  );
}

export function MiniNewsFeed() {
  const { data, loading, error, refetch } = useNewsFeed({ limit: 5 });
  const { t, language } = useLanguage();

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 hover:border-gold/30 rounded-xl p-5 transition-colors h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider">
          {t('آخر الأخبار', 'Latest News')}
        </h3>
        <Link href="/news" className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors">
          {t('المزيد', 'More')}
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <button onClick={refetch} className="text-sm text-accent-red hover:text-gold transition-colors">
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3 flex-1">
          {data.items.map((article) => (
            <Link
              key={article.id}
              href={`/news/${article.id}`}
              className="block group"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] group-hover:text-gold transition-colors line-clamp-2 leading-snug">
                    {article.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {article.source_name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {article.published_at ? timeAgo(article.published_at, language) : ''}
                    </span>
                    <ImpactBadge score={article.impact_score ?? undefined} />
                  </div>
                </div>
                {article.sentiment_label && (
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2',
                    article.sentiment_label === 'إيجابي' ? 'bg-accent-green' :
                    article.sentiment_label === 'سلبي' ? 'bg-accent-red' : 'bg-[var(--text-muted)]'
                  )} />
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)] flex-1 flex items-center justify-center">
          {t('لا توجد أخبار', 'No news available')}
        </p>
      )}
    </section>
  );
}
