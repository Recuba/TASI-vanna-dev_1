'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { getSourceColor, timeAgo, readingTime } from '../utils';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriorityIndicator({ priority }: { priority: number }) {
  if (priority < 4) return null;
  const stars = priority >= 5 ? 2 : 1;
  return (
    <span className="text-gold text-xs" title={`أولوية ${priority}`}>
      {'★'.repeat(stars)}
    </span>
  );
}

function SourceBadge({ name }: { name: string }) {
  const color = getSourceColor(name);

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {name}
    </span>
  );
}

function SentimentBadge({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  let classes = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium';
  if (label === 'إيجابي') {
    classes += ' bg-green-500/20 text-green-400';
  } else if (label === 'سلبي') {
    classes += ' bg-red-500/20 text-red-400';
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
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
        'border border-[#D4A84B]/30 text-[#D4A84B] hover:bg-[#D4A84B]/10',
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
        'p-1 rounded transition-colors',
        bookmarked
          ? 'text-gold hover:text-gold-light'
          : 'text-[var(--text-muted)] hover:text-gold/60',
      )}
      title={bookmarked ? t('إزالة من المحفوظات', 'Remove from saved') : t('حفظ المقال', 'Save article')}
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
}

export function ArticleCard({
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
}: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { t, language } = useLanguage();
  const sourceColor = getSourceColor(sourceName);
  const readTime = readingTime(body, t);

  return (
    <article
      className={cn(
        'rounded-md overflow-hidden',
        'bg-[var(--bg-card)] border border-[#2A2A2A]',
        'hover:border-[#D4A84B]/30 hover:shadow-lg hover:shadow-[#D4A84B]/5',
        'hover:scale-[1.005]',
        'transition-all duration-200',
        'group',
      )}
      style={{
        borderInlineEndWidth: '4px',
        borderInlineEndColor: sourceColor,
      }}
    >
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

          {/* Title -- clickable link to detail page */}
          <div className="mb-2">
            <Link
              href={`/news/${id}`}
              className="block group/title"
            >
              <h3 className={cn(
                'text-base font-bold text-[var(--text-primary)] leading-tight',
                'group-hover/title:text-gold transition-colors',
              )}>
                {title}
              </h3>
            </Link>
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
                  {body}
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
                  className="text-xs text-gold hover:text-gold-light mt-1 transition-colors"
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
            <Link
              href={`/news/${id}`}
              className="text-xs text-gold hover:text-gold-light ms-auto transition-colors"
            >
              {t('عرض التفاصيل', 'View Details')}
            </Link>
          </div>
        </div>

        {/* Source icon on the left side (appears on right in RTL) */}
        <SourceIcon name={sourceName} />
      </div>
    </article>
  );
}
