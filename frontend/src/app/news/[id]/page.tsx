'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useNewsArticle, useNewsFeed } from '@/lib/hooks/use-api';
import { searchNewsFeed, type NewsFeedItem } from '@/lib/api-client';
import { useLanguage } from '@/providers/LanguageProvider';
import { getSourceColor, timeAgo } from '../utils';

// Extended type for extra API fields
type ArticleExtras = {
  sentiment_score?: number | null;
  sentiment_label?: string | null;
  ticker?: string | null;
};

// ---------------------------------------------------------------------------
// Arabic date formatter (detail page specific)
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null, language: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Reading time estimate
// ---------------------------------------------------------------------------

function readingTime(body: string | null, t: (ar: string, en: string) => string): string | null {
  if (!body || body.length < 50) return null;
  const words = body.split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  if (mins === 1) return t('قراءة دقيقة واحدة', '1 min read');
  if (mins === 2) return t('قراءة دقيقتين', '2 min read');
  return t(`قراءة ${mins} دقائق`, `${mins} min read`);
}

// ---------------------------------------------------------------------------
// Priority label
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: number }) {
  const { t } = useLanguage();
  if (priority >= 5) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-accent-red/15 text-accent-red">
        {t('عاجل', 'Urgent')}
      </span>
    );
  }
  if (priority >= 4) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gold/15 text-gold">
        {t('مهم', 'Important')}
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Large source badge
// ---------------------------------------------------------------------------

function LargeSourceBadge({ name }: { name: string }) {
  const color = getSourceColor(name);
  const letter = name.charAt(0);
  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-flex items-center justify-center w-12 h-12 rounded-full text-white text-lg font-bold shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {letter}
      </span>
      <div>
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold"
          style={{
            backgroundColor: `${color}20`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {name}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sentiment badge (larger for detail view)
// ---------------------------------------------------------------------------

function SentimentBadge({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  let colorClasses = '';
  if (label === 'إيجابي') {
    colorClasses = 'bg-green-500/20 text-green-400 border-green-500/30';
  } else if (label === 'سلبي') {
    colorClasses = 'bg-red-500/20 text-red-400 border-red-500/30';
  } else {
    colorClasses = 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${colorClasses}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stock ticker badge
// ---------------------------------------------------------------------------

function StockBadge({ ticker }: { ticker: string | null | undefined }) {
  if (!ticker) return null;
  return (
    <Link
      href={`/stock/${ticker}`}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold',
        'border border-[#D4A84B]/30 text-[#D4A84B] hover:bg-[#D4A84B]/10',
        'transition-colors',
      )}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
      {ticker}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Reading progress bar
// ---------------------------------------------------------------------------

function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (docHeight <= 0) {
        setProgress(0);
        return;
      }
      const pct = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
      setProgress(pct);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed top-14 left-0 right-0 z-50 h-1 bg-transparent">
      <div
        className="h-full transition-[width] duration-100 ease-out"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #D4A84B, #E8C56D)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share button with toast
// ---------------------------------------------------------------------------

function ShareButton({ title }: { title?: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    // Use native share on mobile if available
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: title ?? document.title, url: window.location.href });
        return;
      } catch {
        // User cancelled or share failed -- fall through to clipboard copy
      }
    }

    // Clipboard copy fallback
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [title]);

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
          'bg-[var(--bg-input)] border border-[#2A2A2A]',
          'text-[var(--text-secondary)] hover:text-gold hover:border-[#D4A84B]/30',
          'transition-all duration-200',
        )}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {t('مشاركة', 'Share')}
      </button>

      {/* Toast */}
      {copied && (
        <div className="absolute top-full mt-2 right-0 px-3 py-1.5 rounded-md bg-gold text-black text-xs font-medium whitespace-nowrap shadow-lg animate-fade-in z-50">
          {t('تم نسخ الرابط', 'Link copied')}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ArticleSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-[var(--bg-input)] rounded w-24" />
      <div className="h-8 bg-[var(--bg-input)] rounded w-3/4" />
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-[var(--bg-input)] rounded-full" />
        <div className="h-4 bg-[var(--bg-input)] rounded w-28" />
        <div className="h-4 bg-[var(--bg-input)] rounded w-36" />
      </div>
      <div className="h-px bg-[var(--bg-input)]" />
      <div className="space-y-3">
        <div className="h-5 bg-[var(--bg-input)] rounded w-full" />
        <div className="h-5 bg-[var(--bg-input)] rounded w-full" />
        <div className="h-5 bg-[var(--bg-input)] rounded w-5/6" />
        <div className="h-5 bg-[var(--bg-input)] rounded w-4/6" />
        <div className="h-5 bg-[var(--bg-input)] rounded w-full" />
        <div className="h-5 bg-[var(--bg-input)] rounded w-3/4" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Related article card (compact)
// ---------------------------------------------------------------------------

function RelatedArticleCard({
  id,
  title,
  publishedAt,
  sourceName,
}: {
  id: string;
  title: string;
  publishedAt: string | null;
  sourceName: string;
}) {
  const { t, language } = useLanguage();
  const color = getSourceColor(sourceName);
  return (
    <Link
      href={`/news/${id}`}
      className={cn(
        'block p-4 rounded-md',
        'bg-[var(--bg-card)] border border-[#2A2A2A]',
        'hover:border-[#D4A84B]/30 hover:shadow-md hover:shadow-[#D4A84B]/5',
        'transition-all duration-200 group',
      )}
      style={{ borderInlineEndWidth: '3px', borderInlineEndColor: color }}
    >
      <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight mb-2 line-clamp-2 group-hover:text-gold transition-colors">
        {title}
      </h4>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {sourceName}
        </span>
        {publishedAt && (
          <span className="text-[10px] text-[var(--text-muted)]">
            {timeAgo(publishedAt, t, language)}
          </span>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Article detail page
// ---------------------------------------------------------------------------

export default function ArticleDetailPage() {
  const { t, language } = useLanguage();
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { data: article, loading, error, refetch } = useNewsArticle(id);

  // Fetch related articles: by ticker if available, otherwise by source
  const ticker = (article as (typeof article & ArticleExtras) | undefined)?.ticker;
  const [tickerRelated, setTickerRelated] = useState<NewsFeedItem[]>([]);

  // Search by ticker when article has one
  useEffect(() => {
    if (!ticker || !article) {
      setTickerRelated([]);
      return;
    }
    const controller = new AbortController();
    searchNewsFeed({ q: ticker, limit: 6 })
      .then((res) => {
        if (!controller.signal.aborted) {
          setTickerRelated(res.items.filter((a) => a.id !== id).slice(0, 4));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setTickerRelated([]);
      });
    return () => controller.abort();
  }, [ticker, article, id]);

  // Fallback: same-source articles (only fetched when no ticker)
  const { data: relatedData } = useNewsFeed({
    limit: 6,
    offset: 0,
    source: !ticker ? (article?.source_name ?? undefined) : undefined,
  });

  // Use ticker-based results if available, otherwise same-source
  const relatedArticles = ticker && tickerRelated.length > 0
    ? tickerRelated
    : (relatedData?.items ?? []).filter((a) => a.id !== id).slice(0, 4);
  const relatedByTicker = ticker && tickerRelated.length > 0;

  const readTime = article ? readingTime(article.body, t) : null;
  const extras = article as (typeof article & ArticleExtras) | undefined;

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      {/* Reading progress bar */}
      <ReadingProgressBar />

      <div className="max-w-content-lg mx-auto space-y-5">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/news"
            className="text-gold hover:text-gold-light transition-colors"
          >
            {t('الأخبار', 'News')}
          </Link>
          <svg
            className="w-3 h-3 text-[var(--text-muted)] rtl:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[var(--text-muted)] truncate max-w-[300px]">
            {loading ? '...' : article?.title ?? t('المقال', 'Article')}
          </span>
        </nav>

        {/* Content */}
        {loading ? (
          <ArticleSkeleton />
        ) : error ? (
          <div className="text-center py-16 space-y-4">
            <svg className="w-12 h-12 mx-auto text-[var(--text-muted)] opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {error.includes('404') ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              )}
            </svg>
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {error.includes('404')
                ? t('المقال غير موجود', 'Article Not Found')
                : t('حدث خطأ', 'An error occurred')}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {error.includes('404')
                ? t('قد يكون المقال قد حُذف أو أن الرابط غير صحيح.', 'The article may have been removed or the link is incorrect.')
                : t('تعذر تحميل المقال. يرجى المحاولة مرة أخرى.', 'Could not load the article. Please try again.')}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/news"
                className="px-4 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t('العودة للأخبار', 'Back to News')}
              </Link>
              {!error.includes('404') && (
                <button
                  onClick={refetch}
                  className="px-4 py-1.5 rounded-md text-xs font-medium bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-colors"
                >
                  {t('إعادة المحاولة', 'Retry')}
                </button>
              )}
            </div>
          </div>
        ) : !article ? (
          <div className="text-center py-16">
            <p className="text-lg font-bold text-[var(--text-primary)] mb-2">
              {t('المقال غير موجود', 'Article Not Found')}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {t('قد يكون المقال قد حُذف أو أن الرابط غير صحيح.', 'The article may have been removed or the link is incorrect.')}
            </p>
          </div>
        ) : (
          <article className="space-y-6">

            {/* Priority badge + sentiment + stock + share row */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={article.priority} />
                <SentimentBadge label={extras?.sentiment_label} />
                <StockBadge ticker={extras?.ticker} />
                {readTime && (
                  <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-input)] px-2.5 py-1 rounded-full">
                    {readTime}
                  </span>
                )}
              </div>
              <ShareButton title={article.title} />
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] leading-snug">
              {article.title}
            </h1>

            {/* Meta row: large source badge + date */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <LargeSourceBadge name={article.source_name} />
              {(article.published_at || article.created_at) && (
                <div className="text-left">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {formatDate(article.published_at || article.created_at, language)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {timeAgo(article.published_at || article.created_at, t, language)}
                    {!article.published_at && article.created_at && (
                      <span className="opacity-60"> ({t('تقريبي', 'approximate')})</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Divider */}
            <hr className="border-gold/10" />

            {/* Body -- improved typography */}
            {article.body ? (
              <div
                className={cn(
                  'text-lg leading-[1.9] text-[var(--text-secondary)]',
                  'whitespace-pre-wrap',
                  'max-w-prose',
                )}
              >
                {article.body}
              </div>
            ) : (
              <div className="rounded-xl border border-[#2A2A2A] bg-[var(--bg-input)] p-6 space-y-3">
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p className="text-sm font-medium">
                    {t('النص الكامل غير متوفر', 'Full text not available')}
                  </p>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t(
                    'لم يتم استخراج النص الكامل لهذا المقال من المصدر. يمكنك الاطلاع على المقال الأصلي من خلال رابط المصدر أدناه.',
                    'The full text could not be retrieved from the source. You can read the original article via the source link below.'
                  )}
                </p>
                {article.source_url && (
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium',
                      'bg-gold/10 text-gold border border-gold/20',
                      'hover:bg-gold/20 transition-colors',
                    )}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {t('قراءة من المصدر الأصلي', 'Read from original source')}
                  </a>
                )}
              </div>
            )}

            {/* Source link -- only show when body exists (when no body, link is inside the alert box above) */}
            {article.body && article.source_url && (
              <div className="pt-2">
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium',
                    'bg-gold/10 text-gold border border-gold/20',
                    'hover:bg-gold/20 transition-colors',
                  )}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  {t('قراءة من المصدر الأصلي', 'Read from original source')}
                </a>
              </div>
            )}

            {/* Language info */}
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] pt-2 border-t border-gold/10">
              <span>{t('اللغة', 'Language')}: {article.language === 'ar' ? t('العربية', 'Arabic') : article.language}</span>
            </div>

            {/* Related articles */}
            {relatedArticles.length > 0 && (
              <section className="pt-4 space-y-4">
                <hr className="border-gold/10" />
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {relatedByTicker
                    ? t(`أخبار ذات صلة عن ${ticker}`, `Related news about ${ticker}`)
                    : t(`أخبار ذات صلة من ${article.source_name}`, `Related news from ${article.source_name}`)}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {relatedArticles.map((related) => (
                    <RelatedArticleCard
                      key={related.id}
                      id={related.id}
                      title={related.title}
                      publishedAt={related.published_at || related.created_at}
                      sourceName={related.source_name}
                    />
                  ))}
                </div>
              </section>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
