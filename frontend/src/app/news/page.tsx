'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useNewsFeed, useNewsSources } from '@/lib/hooks/use-api';
import { searchNewsFeed, type NewsFeedItem } from '@/lib/api-client';
import { useLanguage } from '@/providers/LanguageProvider';

// ---------------------------------------------------------------------------
// Extended article type (API returns these but NewsFeedItem type is narrower)
// ---------------------------------------------------------------------------

type ArticleWithExtras = NewsFeedItem & {
  sentiment_score?: number | null;
  sentiment_label?: string | null;
  ticker?: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const AUTO_REFRESH_INTERVAL = 60_000; // 60 seconds

const SOURCE_FILTERS = [
  { key: null, label: 'الكل', color: '#D4A84B' },
  { key: 'العربية', label: 'العربية', color: '#C4302B' },
  { key: 'الشرق', label: 'الشرق', color: '#1A73E8' },
  { key: 'أرقام', label: 'أرقام', color: '#00A650' },
  { key: 'معال', label: 'معال', color: '#FF6B00' },
  { key: 'مباشر', label: 'مباشر', color: '#6B21A8' },
] as const;

/** Map source names to their brand colors (includes alternate names) */
const SOURCE_COLORS: Record<string, string> = {
  'العربية': '#C4302B',
  'الشرق': '#1A73E8',
  'الشرق بلومبرغ': '#1A73E8',
  'أرقام': '#00A650',
  'معال': '#FF6B00',
  'مباشر': '#6B21A8',
};

const BOOKMARKS_KEY = 'rad-ai-bookmarks';

function getSourceColor(name: string): string {
  return SOURCE_COLORS[name] ?? '#D4A84B';
}

// ---------------------------------------------------------------------------
// Arabic "time ago" formatter (improved)
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';

  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  const weeks = Math.floor(days / 7);

  if (minutes < 1) return 'الآن';
  if (minutes === 1) return 'منذ دقيقة';
  if (minutes === 2) return 'منذ دقيقتين';
  if (minutes < 11) return `منذ ${minutes} دقائق`;
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours === 1) return 'منذ ساعة';
  if (hours === 2) return 'منذ ساعتين';
  if (hours < 11) return `منذ ${hours} ساعات`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days === 1) return 'منذ يوم';
  if (days === 2) return 'منذ يومين';
  if (days < 7) return `منذ ${days} أيام`;
  if (weeks === 1) return 'منذ أسبوع';
  if (weeks === 2) return 'منذ أسبوعين';
  if (weeks < 5) return `منذ ${weeks} أسابيع`;
  return new Date(dateStr).toLocaleDateString('ar-SA');
}

// ---------------------------------------------------------------------------
// Reading time estimate
// ---------------------------------------------------------------------------

function readingTimeArabic(body: string | null): string | null {
  if (!body || body.length < 100) return null;
  const words = body.split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return `قراءة ${mins} دقائق`;
}

// ---------------------------------------------------------------------------
// Bookmarks helpers
// ---------------------------------------------------------------------------

function getBookmarks(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveBookmarks(ids: Set<string>) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(ids)));
}

// ---------------------------------------------------------------------------
// Skeleton card for loading state
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="p-5 rounded-md bg-[var(--bg-card)] border border-[#2A2A2A] animate-pulse flex gap-4">
      <div className="flex-1 space-y-3">
        <div className="h-5 bg-[var(--bg-input)] rounded w-3/4" />
        <div className="space-y-2">
          <div className="h-3 bg-[var(--bg-input)] rounded w-full" />
          <div className="h-3 bg-[var(--bg-input)] rounded w-5/6" />
          <div className="h-3 bg-[var(--bg-input)] rounded w-2/3" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-5 bg-[var(--bg-input)] rounded-full w-16" />
          <div className="h-3 bg-[var(--bg-input)] rounded w-20" />
        </div>
      </div>
      <div className="w-10 h-10 bg-[var(--bg-input)] rounded-full shrink-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority stars
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

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sentiment badge
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Stock ticker badge
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Source icon (first-letter colored circle)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Bookmark button
// ---------------------------------------------------------------------------

function BookmarkButton({
  id,
  bookmarked,
  onToggle,
}: {
  id: string;
  bookmarked: boolean;
  onToggle: (id: string) => void;
}) {
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
      title={bookmarked ? 'Remove from saved' : 'Save article'}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Article card
// ---------------------------------------------------------------------------

function ArticleCard({
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
}: {
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
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();
  const sourceColor = getSourceColor(sourceName);
  const readTime = readingTimeArabic(body);

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
        borderRightWidth: '4px',
        borderRightColor: sourceColor,
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
              <p
                className={cn(
                  'text-sm text-[var(--text-secondary)] leading-relaxed',
                  !expanded && 'line-clamp-3',
                )}
              >
                {body}
              </p>
              {body.length > 150 && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setExpanded((v) => !v);
                  }}
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
              <span className="text-xs text-[var(--text-muted)]">
                {timeAgo(publishedAt)}
              </span>
            )}
            <PriorityIndicator priority={priority} />
            {readTime && (
              <span className="text-xs text-[var(--text-muted)]">
                {readTime}
              </span>
            )}
            <Link
              href={`/news/${id}`}
              className="text-xs text-gold hover:text-gold-light mr-auto transition-colors"
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

// ---------------------------------------------------------------------------
// Search input with debounce
// ---------------------------------------------------------------------------

function SearchInput({
  value,
  onChange,
  placeholder = 'ابحث في الأخبار...',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 300);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="relative">
      {/* Search icon */}
      <svg
        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full pr-10 pl-10 py-2.5 rounded-lg text-sm',
          'bg-[var(--bg-input)] border border-[#2A2A2A]',
          'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
          'focus:outline-none focus:border-[#D4A84B]/50 focus:ring-1 focus:ring-[#D4A84B]/20',
          'transition-colors',
        )}
        dir="rtl"
      />
      {/* Clear button */}
      {local && (
        <button
          onClick={() => {
            setLocal('');
            onChange('');
          }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NewsPage() {
  const { t } = useLanguage();
  const [allArticles, setAllArticles] = useState<NewsFeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchResults, setSearchResults] = useState<NewsFeedItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const stickyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastKnownIdsRef = useRef<Set<string>>(new Set());

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    setBookmarks(getBookmarks());
  }, []);

  // Sticky observer
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSticky(!entry.isIntersecting);
      },
      { threshold: 1, rootMargin: '-1px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-refresh: poll for new articles
  useEffect(() => {
    if (searchQuery.trim() || showSaved) return;

    const interval = setInterval(async () => {
      try {
        const res = await import('@/lib/api-client').then((m) =>
          m.getNewsFeed({ limit: PAGE_SIZE, offset: 0, source: activeSource ?? undefined })
        );
        if (res?.items) {
          const currentIds = lastKnownIdsRef.current;
          if (currentIds.size > 0) {
            const newIds = res.items.filter((a) => !currentIds.has(a.id));
            if (newIds.length > 0) {
              setNewArticleCount(newIds.length);
            }
          }
        }
      } catch {
        // Silently ignore refresh errors
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [activeSource, searchQuery, showSaved]);

  // Track known IDs for auto-refresh detection
  useEffect(() => {
    if (allArticles.length > 0) {
      lastKnownIdsRef.current = new Set(allArticles.map((a) => a.id));
    }
  }, [allArticles]);

  const offset = (page - 1) * PAGE_SIZE;

  const { data, loading, error, refetch } = useNewsFeed({
    limit: PAGE_SIZE,
    offset,
    source: activeSource ?? undefined,
  });

  // Source counts
  const { data: sourcesData } = useNewsSources();
  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {};
    if (sourcesData?.sources) {
      for (const s of sourcesData.sources) {
        map[s.source_name] = s.count;
      }
    }
    return map;
  }, [sourcesData]);

  // Accumulate articles for "load more"
  useEffect(() => {
    if (data?.items) {
      if (page === 1) {
        setAllArticles(data.items);
      } else {
        setAllArticles((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const newItems = data.items.filter((a) => !existingIds.has(a.id));
          return [...prev, ...newItems];
        });
      }
      setLoadingMore(false);
    }
  }, [data, page]);

  const total = data?.total ?? 0;
  const hasMore = allArticles.length < total;

  // Infinite scroll: observe sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          setLoadingMore(true);
          setPage((p) => p + 1);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading]);

  // Search handling with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const controller = new AbortController();
    searchNewsFeed({ q: searchQuery, limit: 50 })
      .then((res) => {
        if (!controller.signal.aborted) {
          setSearchResults(res.items);
          setSearchLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setSearchLoading(false);
        }
      });
    return () => controller.abort();
  }, [searchQuery]);

  const handleSourceChange = useCallback((source: string | null) => {
    setActiveSource(source);
    setPage(1);
    setAllArticles([]);
    setShowSaved(false);
  }, []);

  const handleToggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveBookmarks(next);
      return next;
    });
  }, []);

  const handleDismissNewArticles = useCallback(() => {
    setNewArticleCount(0);
    setPage(1);
    setAllArticles([]);
    refetch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [refetch]);

  // Determine which articles to display
  const displayArticles = useMemo(() => {
    if (searchQuery.trim() && searchResults !== null) {
      return searchResults;
    }
    if (showSaved) {
      return allArticles.filter((a) => bookmarks.has(a.id));
    }
    return allArticles;
  }, [searchQuery, searchResults, showSaved, allArticles, bookmarks]);

  const isSearching = !!searchQuery.trim();
  const showInfiniteScroll = !isSearching && !showSaved && hasMore;

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {t('أخبار السوق', 'Market News')}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {t('آخر أخبار سوق تداول السعودي', 'Latest Saudi Tadawul market news')}
          </p>
        </div>

        {/* Sentinel for sticky detection */}
        <div ref={stickyRef} className="h-0" />

        {/* Sticky search + filters */}
        <div
          className={cn(
            'sticky top-0 z-20 space-y-3 pb-3 -mx-4 sm:-mx-6 px-4 sm:px-6 transition-shadow duration-200',
            isSticky && 'bg-[#0E0E0E]/95 backdrop-blur-sm shadow-md shadow-black/30',
          )}
        >
          {/* Search input */}
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t('ابحث في الأخبار...', 'Search news...')} />

          {/* Source filter chips + saved tab */}
          <div className="flex flex-wrap gap-2">
            {SOURCE_FILTERS.map((source) => {
              const isActive = !showSaved && !isSearching && activeSource === source.key;
              const count = source.key ? sourceCounts[source.key] : undefined;
              return (
                <button
                  key={source.label}
                  onClick={() => {
                    setShowSaved(false);
                    setSearchQuery('');
                    handleSourceChange(source.key);
                  }}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs font-medium',
                    'border transition-all duration-200',
                  )}
                  style={
                    isActive
                      ? {
                          backgroundColor: `${source.color}20`,
                          borderColor: source.color,
                          color: source.color,
                        }
                      : {
                          backgroundColor: 'var(--bg-input)',
                          borderColor: 'var(--bg-input)',
                          color: 'var(--text-secondary)',
                        }
                  }
                >
                  {source.label}
                  {count !== undefined && (
                    <span className="mr-1 opacity-60">({count})</span>
                  )}
                </button>
              );
            })}

            {/* Saved articles tab */}
            <button
              onClick={() => {
                setShowSaved(true);
                setSearchQuery('');
                setActiveSource(null);
              }}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium',
                'border transition-all duration-200',
              )}
              style={
                showSaved
                  ? {
                      backgroundColor: '#D4A84B20',
                      borderColor: '#D4A84B',
                      color: '#D4A84B',
                    }
                  : {
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--bg-input)',
                      color: 'var(--text-secondary)',
                    }
              }
            >
              <svg className="w-3 h-3 inline-block ml-1" viewBox="0 0 24 24" fill={showSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              {t('المحفوظات', 'Saved')}
              {bookmarks.size > 0 && (
                <span className="mr-1 opacity-60">({bookmarks.size})</span>
              )}
            </button>
          </div>
        </div>

        {/* New articles banner */}
        {newArticleCount > 0 && !isSearching && !showSaved && (
          <button
            onClick={handleDismissNewArticles}
            className={cn(
              'w-full sticky top-[88px] z-10 py-2.5 px-4 rounded-lg text-sm font-medium',
              'bg-[#D4A84B]/15 text-[#D4A84B] border border-[#D4A84B]/30',
              'hover:bg-[#D4A84B]/25 transition-colors',
              'animate-pulse',
            )}
          >
            {t(`${newArticleCount} أخبار جديدة - اضغط للتحديث`, `${newArticleCount} new articles - tap to refresh`)}
          </button>
        )}

        {/* Content area */}
        {(loading && page === 1) || searchLoading ? (
          /* Loading skeletons */
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          /* Error state */
          <div className="text-center py-12">
            <p className="text-sm text-accent-red mb-3">{error}</p>
            <button
              onClick={refetch}
              className={cn(
                'px-4 py-1.5 rounded-md text-xs font-medium',
                'bg-gold/10 text-gold border border-gold/20',
                'hover:bg-gold/20 transition-colors',
              )}
            >
              {t('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        ) : displayArticles.length === 0 ? (
          /* Empty state */
          <div className="text-center py-16">
            <div className="text-4xl mb-3 opacity-30">
              {isSearching ? (
                <svg className="w-12 h-12 mx-auto text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              ) : showSaved ? (
                <svg className="w-12 h-12 mx-auto text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              ) : (
                <svg className="w-12 h-12 mx-auto text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              )}
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {isSearching
                ? t(`لا توجد نتائج للبحث "${searchQuery}"`, `No results found for "${searchQuery}"`)
                : showSaved
                  ? t('لا توجد مقالات محفوظة - اضغط على أيقونة الحفظ لحفظ المقالات', 'No saved articles - tap the bookmark icon to save articles')
                  : t('لا توجد أخبار حالياً - يتم تحديث الأخبار تلقائياً', 'No news available - news updates automatically')}
            </p>
          </div>
        ) : (
          <>
            {/* Search results count */}
            {isSearching && searchResults && (
              <p className="text-xs text-[var(--text-muted)]">
                {t(`${searchResults.length} نتيجة للبحث`, `${searchResults.length} results found`)}
              </p>
            )}

            {/* Articles */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {displayArticles.map((article) => {
                const ext = article as ArticleWithExtras;
                return (
                  <ArticleCard
                    key={article.id}
                    id={article.id}
                    title={article.title}
                    body={article.body}
                    sourceName={article.source_name}
                    publishedAt={article.published_at}
                    priority={article.priority}
                    bookmarked={bookmarks.has(article.id)}
                    onToggleBookmark={handleToggleBookmark}
                    sentimentLabel={ext.sentiment_label}
                    ticker={ext.ticker}
                  />
                );
              })}
            </div>

            {/* Article count */}
            {!isSearching && total > 0 && (
              <p className="text-xs text-center text-[var(--text-muted)]">
                {t(`عرض ${allArticles.length} من ${total}`, `Showing ${allArticles.length} of ${total}`)}
              </p>
            )}

            {/* Infinite scroll: loading spinner */}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <svg className="w-6 h-6 animate-spin text-[#D4A84B]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {showInfiniteScroll && <div ref={sentinelRef} className="h-1" />}
          </>
        )}
      </div>
    </div>
  );
}
