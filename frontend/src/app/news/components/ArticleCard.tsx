'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getNewsArticle } from '@/lib/api-client';
import { useLanguage } from '@/providers/LanguageProvider';
import { getSourceColor, timeAgo, readingTime } from '../utils';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-gold/25 text-inherit rounded-sm px-0.5">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function PriorityIndicator({ priority }: { priority: number }) {
  if (priority < 4) return null;
  if (priority >= 5) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[13.5px] font-bold bg-accent-red/15 text-accent-red">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" />
        عاجل
      </span>
    );
  }
  return (
    <span className="text-gold text-xs" title={`أولوية ${priority}`}>★</span>
  );
}

function SourceBadge({ name }: { name: string }) {
  const color = getSourceColor(name);

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[14.5px] font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {name}
    </span>
  );
}

function SentimentBadge({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  let classes = 'inline-flex items-center px-2 py-0.5 rounded-full text-[13.5px] font-medium';
  if (label === 'إيجابي') {
    classes += ' bg-accent-green/20 text-accent-green';
  } else if (label === 'سلبي') {
    classes += ' bg-accent-red/20 text-accent-red';
  } else {
    classes += ' bg-gray-500/20 text-gray-400';
  }
  return <span className={classes}>{label}</span>;
}

function StockBadge({ ticker }: { ticker: string | null | undefined }) {
  if (!ticker) return null;
  return (
    <Link
      href={`/stock/${ticker}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13.5px] font-medium',
        'border border-[#D4A84B]/30 text-[#D4A84B] hover:bg-[#D4A84B]/10',
        'focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none',
        'transition-colors',
      )}
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
      {ticker}
    </Link>
  );
}

function SourceIcon({ name }: { name: string }) {
  const color = getSourceColor(name);
  const letter = name.charAt(0);
  return (
    <span
      className="inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-sm font-bold shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

function BookmarkButton({
  id,
  bookmarked,
  onToggle,
}: {
  id: string;
  bookmarked: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(id);
      }}
      className={cn(
        'p-2 rounded transition-colors',
        'min-w-[44px] min-h-[44px] flex items-center justify-center',
        'focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none',
        bookmarked
          ? 'text-gold hover:text-gold-light'
          : 'text-[var(--text-muted)] hover:text-gold/60',
      )}
      title={bookmarked ? t('إزالة من المحفوظات', 'Remove from saved') : t('حفظ المقال', 'Save article')}
      aria-label={bookmarked ? t('إزالة من المحفوظات', 'Remove from saved') : t('حفظ المقال', 'Save article')}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ArticleCard
// ---------------------------------------------------------------------------

export interface ArticleCardProps {
  id: string;
  title: string;
  body: string | null;
  sourceName: string;
  publishedAt: string | null;
  priority: number;
  bookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  sentimentLabel?: string | null;
  ticker?: string | null;
  highlightQuery?: string;
}

export const ArticleCard = React.memo(function ArticleCard({
  id,
  title,
  body,
  sourceName,
  publishedAt,
  priority,
  bookmarked,
  onToggleBookmark,
  sentimentLabel,
  ticker,
  highlightQuery,
}: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { t, language } = useLanguage();
  const router = useRouter();
  const sourceColor = getSourceColor(sourceName);
  const readTime = readingTime(body, t);

  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    prefetchTimer.current = setTimeout(() => {
      getNewsArticle(id).catch(() => {});
    }, 200);
  }, [id]);

  const handleMouseLeave = useCallback(() => {
    if (prefetchTimer.current) {
      clearTimeout(prefetchTimer.current);
      prefetchTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (prefetchTimer.current) {
        clearTimeout(prefetchTimer.current);
      }
    };
  }, []);

  const handleCardClick = () => {
    router.push(`/news/${id}`);
  };

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className={cn(
        'rounded-md overflow-hidden cursor-pointer border-e-4',
        'bg-[var(--bg-card)] border border-[#2A2A2A]',
        'hover:border-[#D4A84B]/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#D4A84B]/8',
        'focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none',
        'transition-all duration-200',
        'animate-fade-in-up',
        'group',
        priority >= 5 && 'ring-1 ring-accent-red/20',
      )}
      style={{ borderInlineEndColor: sourceColor }}
    >
      {priority >= 5 && (
        <div className="h-0.5 w-full bg-gradient-to-r from-accent-red/60 via-accent-red to-accent-red/60" />
      )}
      <div className="p-5 flex gap-4">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Sentiment badge + bookmark row */}
          <div className="flex items-center justify-between mb-1">
            <SentimentBadge label={sentimentLabel} />
            <BookmarkButton
              id={id}
              bookmarked={bookmarked}
              onToggle={onToggleBookmark}
            />
          </div>

          {/* Title */}
          <div className="mb-2">
            <h3 className={cn(
              'text-base font-bold text-[var(--text-primary)] leading-tight',
              'group-hover:text-gold transition-colors',
            )}>
              <HighlightText text={title} query={highlightQuery} />
            </h3>
          </div>

          {/* Body */}
          {body && (
            <div className="mb-3">
              <div id={`body-${id}`}>
                <p
                  className={cn(
                    'text-sm text-[var(--text-secondary)] leading-relaxed',
                    !expanded && 'line-clamp-3',
                  )}
                >
                  <HighlightText text={body} query={highlightQuery} />
                </p>
              </div>
              {body.length > 150 && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setExpanded((v) => !v);
                  }}
                  aria-expanded={expanded}
                  aria-controls={`body-${id}`}
                  className="text-xs text-gold hover:text-gold-light hover:underline mt-1 py-2 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none rounded"
                >
                  {expanded ? t('إغلاق', 'Close') : t('اقرأ المزيد', 'Read More')}
                </button>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 flex-wrap">
            <SourceBadge name={sourceName} />
            <StockBadge ticker={ticker} />
            {publishedAt && (
              <time dateTime={publishedAt} className="text-xs text-[var(--text-muted)]">
                {timeAgo(publishedAt, t, language)}
              </time>
            )}
            <PriorityIndicator priority={priority} />
            {readTime && (
              <span className="text-xs text-[var(--text-muted)]">
                {readTime}
              </span>
            )}
            {/* Chevron hint — the whole card is clickable */}
            <span className="ms-auto text-[var(--text-muted)] group-hover:text-gold transition-colors" aria-hidden="true">
              <svg className="w-4 h-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>

        {/* Source icon on the left side (appears on right in RTL) */}
        <SourceIcon name={sourceName} />
      </div>
    </article>
  );
});
