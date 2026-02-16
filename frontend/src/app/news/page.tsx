'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { useNewsFeed, useNewsSources } from '@/lib/hooks/use-api';
import { searchNewsFeed, getNewsFeedByIds, type NewsFeedItem } from '@/lib/api-client';
import { useLanguage } from '@/providers/LanguageProvider';
import { PAGE_SIZE, POLLING_FALLBACK_INTERVAL, getBookmarks, saveBookmarks } from './utils';
import { useNewsFilters } from './hooks/useNewsFilters';
import { ArticleCard, FilterBar, NewArticlesBanner, SkeletonCard } from './components';
import { ConnectionStatusBadge } from '@/components/common/ConnectionStatusBadge';

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NewsPage() {
  const { t, language } = useLanguage();
  const [allArticles, setAllArticles] = useState<NewsFeedItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchResults, setSearchResults] = useState<NewsFeedItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const [savedArticles, setSavedArticles] = useState<NewsFeedItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [columnCount, setColumnCount] = useState(1);
  const [sseStatus, setSseStatus] = useState<'live' | 'reconnecting' | 'offline'>('offline');
  const [retrying, setRetrying] = useState(false);
  const [bookmarkToast, setBookmarkToast] = useState<{ message: string; visible: boolean } | null>(null);

  const stickyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastKnownIdsRef = useRef<Set<string>>(new Set());
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const bookmarkToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filters hook
  const setAllArticlesUpdater = useCallback(
    (fn: (prev: NewsFeedItem[]) => NewsFeedItem[]) => setAllArticles(fn),
    [],
  );
  const filters = useNewsFilters(setAllArticlesUpdater);

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    setBookmarks(getBookmarks());
  }, []);

  // Cleanup bookmark toast timer on unmount
  useEffect(() => {
    return () => {
      if (bookmarkToastTimer.current) clearTimeout(bookmarkToastTimer.current);
    };
  }, []);

  // Scroll restoration: save position before navigating away
  useEffect(() => {
    const saveScroll = () => {
      sessionStorage.setItem('news-scroll-y', String(window.scrollY));
    };
    window.addEventListener('beforeunload', saveScroll);
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(saveScroll, 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('beforeunload', saveScroll);
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, []);

  // Scroll restoration: restore on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('news-scroll-y');
    if (saved) {
      requestAnimationFrame(() => {
        window.scrollTo(0, parseInt(saved, 10));
        sessionStorage.removeItem('news-scroll-y');
      });
    }
  }, []);

  // Fetch saved articles from backend when showSaved is active
  useEffect(() => {
    if (!filters.showSaved || bookmarks.size === 0) {
      setSavedArticles([]);
      return;
    }
    setSavedLoading(true);
    const ids = Array.from(bookmarks);
    getNewsFeedByIds(ids)
      .then((res) => {
        setSavedArticles(res.items);
      })
      .catch(() => {
        setSavedArticles([]);
      })
      .finally(() => {
        setSavedLoading(false);
      });
  }, [filters.showSaved, bookmarks]);

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

  // Track container width to determine column count for virtual rows
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      // Match Tailwind breakpoints: xl(1280)=3cols, md(768)=2cols, else 1col
      setColumnCount(w >= 1024 ? 3 : w >= 640 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-refresh: SSE stream with polling fallback
  useEffect(() => {
    if (filters.searchQuery.trim() || filters.showSaved) {
      setSseStatus('offline');
      return;
    }

    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const startPollingFallback = () => {
      setSseStatus('offline');
      if (!fallbackTimer) {
        fallbackTimer = setInterval(async () => {
          if (document.hidden) return;
          try {
            const res = await import('@/lib/api-client').then((m) =>
              m.getNewsFeed({ limit: PAGE_SIZE, offset: 0, source: filters.activeSource ?? undefined })
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
            // Silently ignore polling errors
          }
        }, POLLING_FALLBACK_INTERVAL);
      }
    };

    // Try SSE first
    const sseUrl = `/api/v1/news/stream${filters.activeSource ? `?source=${encodeURIComponent(filters.activeSource)}` : ''}`;
    let es: EventSource | null = null;

    try {
      es = new EventSource(sseUrl);
      setSseStatus('reconnecting');

      es.onopen = () => {
        setSseStatus('live');
      };

      es.onmessage = (event) => {
        setSseStatus('live');
        try {
          const data = JSON.parse(event.data);
          if (data.count > 0) {
            setNewArticleCount(data.count);
          }
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        // SSE failed -- close and fall back to polling
        es?.close();
        es = null;
        startPollingFallback();
      };
    } catch {
      // EventSource constructor failed (e.g. SSR) -- fall back to polling
      startPollingFallback();
    }

    return () => {
      es?.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [filters.activeSource, filters.searchQuery, filters.showSaved]);

  // Track known IDs for auto-refresh detection
  useEffect(() => {
    if (allArticles.length > 0) {
      lastKnownIdsRef.current = new Set(allArticles.map((a) => a.id));
    }
  }, [allArticles]);

  const offset = (filters.page - 1) * PAGE_SIZE;

  const { data, loading, error, refetch } = useNewsFeed({
    limit: PAGE_SIZE,
    offset,
    source: filters.activeSource ?? undefined,
    sentiment: filters.activeSentiment ?? undefined,
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
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
      if (filters.page === 1) {
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
  }, [data, filters.page]);

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
          filters.setPage((p) => p + 1);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, filters]);

  // Search handling with debounce
  useEffect(() => {
    if (!filters.searchQuery.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const controller = new AbortController();
    searchNewsFeed({
      q: filters.searchQuery,
      limit: 50,
      source: filters.activeSource ?? undefined,
      sentiment: filters.activeSentiment ?? undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
    }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setSearchResults(res.items);
          setSearchLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          // Don't treat abort errors as search failures
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setSearchResults([]);
          setSearchLoading(false);
        }
      });
    return () => controller.abort();
  }, [filters.searchQuery, filters.activeSource, filters.activeSentiment, filters.dateFrom, filters.dateTo]);

  const handleToggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      const wasBookmarked = next.has(id);
      if (wasBookmarked) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveBookmarks(next);

      // Show toast
      const msg = wasBookmarked
        ? t('تمت إزالة المقال من المحفوظات', 'Article removed from saved')
        : t('تم حفظ المقال', 'Article saved');
      setBookmarkToast({ message: msg, visible: true });
      if (bookmarkToastTimer.current) clearTimeout(bookmarkToastTimer.current);
      bookmarkToastTimer.current = setTimeout(() => {
        setBookmarkToast(prev => prev ? { ...prev, visible: false } : null);
        setTimeout(() => setBookmarkToast(null), 200);
      }, 2000);

      return next;
    });
  }, [t]);

  const handleDismissNewArticles = useCallback(() => {
    setNewArticleCount(0);
    filters.setPage(1);
    setAllArticles([]);
    refetch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [refetch, filters]);

  const handleShowSaved = useCallback(() => {
    filters.setShowSaved(true);
    filters.setSearchQuery('');
    filters.handleSourceChange(null);
  }, [filters]);

  // Determine which articles to display
  const displayArticles = useMemo(() => {
    if (filters.searchQuery.trim() && searchResults !== null) {
      return searchResults;
    }
    if (filters.showSaved) {
      return savedArticles;
    }
    return allArticles;
  }, [filters.searchQuery, searchResults, filters.showSaved, savedArticles, allArticles]);

  const isSearching = !!filters.searchQuery.trim();
  const showInfiniteScroll = !isSearching && !filters.showSaved && hasMore;

  // Group articles into rows based on column count for virtualization
  const virtualRows = useMemo(() => {
    const rows: NewsFeedItem[][] = [];
    for (let i = 0; i < displayArticles.length; i += columnCount) {
      rows.push(displayArticles.slice(i, i + columnCount));
    }
    return rows;
  }, [displayArticles, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => gridContainerRef.current?.closest('.overflow-y-auto') as HTMLElement | null,
    // Approximate height of one ArticleCard row (card ~180px + 12px gap + padding).
    // measureElement is used via ref={rowVirtualizer.measureElement} on each
    // virtual row div below, so actual measurements replace this estimate
    // after initial render.
    estimateSize: () => 220,
    overscan: 5,
  });

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-5">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              {t('أخبار السوق', 'Market News')}
            </h1>
            <ConnectionStatusBadge status={sseStatus} lang={language} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-[var(--text-muted)]">
              {t('آخر أخبار سوق تداول السعودي', 'Latest Saudi Tadawul market news')}
            </p>
            {total > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gold/10 text-gold border border-gold/20">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
                {t(`${total} خبر`, `${total} articles`)}
              </span>
            )}
          </div>
        </div>

        {/* Sentinel for sticky detection */}
        <div ref={stickyRef} className="h-0" />

        {/* Sticky search + filters */}
        <FilterBar
          searchQuery={filters.searchQuery}
          onSearchChange={filters.setSearchQuery}
          activeSource={filters.activeSource}
          showSaved={filters.showSaved}
          isSearching={isSearching}
          bookmarkCount={bookmarks.size}
          sourceCounts={sourceCounts}
          showAdvancedFilters={filters.showAdvancedFilters}
          advancedFilterCount={filters.advancedFilterCount}
          activeSentiment={filters.activeSentiment}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          isSticky={isSticky}
          onSourceChange={filters.handleSourceChange}
          onShowSaved={handleShowSaved}
          onToggleAdvancedFilters={() => filters.setShowAdvancedFilters((v) => !v)}
          onSentimentChange={filters.handleSentimentChange}
          onDateFromChange={filters.handleDateFromChange}
          onDateToChange={filters.handleDateToChange}
          onClearAdvancedFilters={filters.handleClearAdvancedFilters}
        />

        {/* New articles banner */}
        {!isSearching && !filters.showSaved && (
          <NewArticlesBanner count={newArticleCount} onDismiss={handleDismissNewArticles} />
        )}

        {/* Content area */}
        {(loading && filters.page === 1) || searchLoading || savedLoading ? (
          /* Loading skeletons */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} index={i} />
            ))}
          </div>
        ) : error ? (
          /* Error state */
          <div className="text-center py-16">
            <div className="relative inline-flex items-center justify-center mb-5">
              <div className="absolute inset-0 rounded-full bg-accent-red/10 blur-xl" />
              <div
                className="relative w-16 h-16 rounded-full bg-accent-red/10 border border-accent-red/20 flex items-center justify-center"
                style={{ animation: 'float 3s ease-in-out infinite' }}
              >
                <svg className="w-8 h-8 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
              {t('حدث خطأ في تحميل الأخبار', 'Failed to load news')}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-1">
              {error.includes('50') ? t('خطأ في الخادم', 'Server error') : error.includes('40') ? t('خطأ في الطلب', 'Request error') : t('خطأ في الاتصال', 'Connection error')}
            </p>
            <p className="text-xs text-[var(--text-muted)] opacity-60 mb-5 font-mono">{error.slice(0, 120)}</p>
            <div className="w-12 h-0.5 mx-auto mb-5 rounded-full bg-gold-gradient opacity-40" />
            <button
              onClick={() => {
                setRetrying(true);
                refetch();
                setTimeout(() => setRetrying(false), 2000);
              }}
              disabled={retrying}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium',
                'bg-gold/10 text-gold border border-gold/20',
                'hover:bg-gold/20 transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <svg className={cn('w-4 h-4', retrying && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              {retrying ? t('جاري المحاولة...', 'Retrying...') : t('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        ) : displayArticles.length === 0 ? (
          /* Empty states */
          <div className="text-center py-16">
            {isSearching ? (
              /* Search empty state */
              <>
                <div
                  className="relative inline-flex items-center justify-center mb-5"
                  style={{ animation: 'float 3s ease-in-out infinite' }}
                >
                  <svg className="w-16 h-16 text-[var(--text-muted)] opacity-40" fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth={1.2}>
                    {/* Magnifying glass */}
                    <circle cx="20" cy="20" r="12" />
                    <path strokeLinecap="round" d="M29 29l10 10" strokeWidth={2.5} />
                    {/* Document inside the lens */}
                    <rect x="14" y="13" width="12" height="14" rx="1.5" strokeWidth={1} />
                    <path d="M17 18h6M17 21h4M17 24h5" strokeWidth={0.8} />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                  {t(`لا توجد نتائج لـ "${filters.searchQuery}"`, `No results for "${filters.searchQuery}"`)}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  {t('حاول تغيير كلمات البحث أو مسح الفلاتر', 'Try different keywords or clear filters')}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => filters.setSearchQuery('')}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium',
                      'bg-gold/10 text-gold border border-gold/20',
                      'hover:bg-gold/20 transition-colors',
                    )}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {t('مسح البحث', 'Clear search')}
                  </button>
                  {filters.activeSource && (
                    <button
                      onClick={() => filters.handleSourceChange(null)}
                      className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors underline underline-offset-2"
                    >
                      {t('مسح فلتر المصدر', 'Clear source filter')}
                    </button>
                  )}
                </div>
              </>
            ) : filters.showSaved ? (
              /* Saved empty state */
              <>
                <div
                  className="relative inline-flex items-center justify-center mb-5"
                  style={{ animation: 'float 3s ease-in-out infinite' }}
                >
                  <svg className="w-16 h-16 text-[var(--text-muted)] opacity-40" fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth={1.2}>
                    {/* Bookmark shape */}
                    <path d="M12 8a3 3 0 013-3h18a3 3 0 013 3v34l-12-6-12 6V8z" />
                    {/* Plus sign inside bookmark */}
                    <path d="M24 17v10M19 22h10" strokeWidth={1.5} strokeLinecap="round" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                  {t('لا توجد مقالات محفوظة', 'No saved articles')}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mb-2">
                  {t(
                    'اضغط على أيقونة الحفظ في أي مقال لحفظه هنا',
                    'Tap the bookmark icon on any article to save it here',
                  )}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)] opacity-60">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <span>{t('ابحث عن هذه الأيقونة', 'Look for this icon')}</span>
                </div>
              </>
            ) : (
              /* No news empty state */
              <>
                <div
                  className="relative inline-flex items-center justify-center mb-5"
                  style={{ animation: 'float 3s ease-in-out infinite' }}
                >
                  {/* Gold gradient circle behind icon */}
                  <div className="absolute w-20 h-20 rounded-full bg-gradient-to-br from-gold/15 to-gold/5 blur-sm" />
                  <svg className="relative w-16 h-16 text-gold/50" fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth={1.2}>
                    {/* Newspaper / RSS icon */}
                    <rect x="6" y="8" width="36" height="32" rx="3" />
                    <path d="M12 16h16v8H12z" strokeWidth={1} />
                    <path d="M12 28h24M12 33h18" strokeWidth={1} strokeLinecap="round" />
                    <path d="M34 16v8" strokeWidth={1} strokeLinecap="round" />
                    {/* RSS dot */}
                    <circle cx="38" cy="12" r="2.5" fill="currentColor" stroke="none" opacity={0.6} />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                  {t('لا توجد أخبار حالياً', 'No news available')}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mb-1">
                  {t('يتم تحديث الأخبار تلقائياً كل ٣٠ دقيقة', 'News updates automatically every 30 minutes')}
                </p>
                <p className="text-xs text-[var(--text-muted)] opacity-50 mb-4">
                  {t('آخر محاولة تحديث الآن', 'Last refresh attempt just now')}
                </p>
                <button
                  onClick={() => { refetch(); }}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium',
                    'bg-gold/10 text-gold border border-gold/20',
                    'hover:bg-gold/20 transition-colors',
                  )}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  {t('تحديث الآن', 'Refresh now')}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Search results count */}
            {isSearching && searchResults && (
              <p className="text-xs text-[var(--text-muted)]" aria-live="polite" role="status">
                {t(`${searchResults.length} نتيجة للبحث`, `${searchResults.length} results found`)}
              </p>
            )}

            {/* Virtualized Articles */}
            <div ref={gridContainerRef}>
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const rowArticles = virtualRows[virtualRow.index];
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className="grid gap-3 pb-3"
                        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
                      >
                        {rowArticles.map((article) => (
                          <ArticleCard
                            key={article.id}
                            id={article.id}
                            title={article.title}
                            body={article.body}
                            sourceName={article.source_name}
                            publishedAt={article.published_at || article.created_at}
                            priority={article.priority}
                            bookmarked={bookmarks.has(article.id)}
                            onToggleBookmark={handleToggleBookmark}
                            sentimentLabel={article.sentiment_label}
                            ticker={article.ticker}
                            highlightQuery={isSearching ? filters.searchQuery : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Article count */}
            {!isSearching && !filters.showSaved && total > 0 && (
              <p className="text-xs text-center text-[var(--text-muted)]">
                {t(`عرض ${allArticles.length} من ${total}`, `Showing ${allArticles.length} of ${total}`)}
              </p>
            )}
            {filters.showSaved && (
              <p className="text-xs text-center text-[var(--text-muted)]">
                {t(`${displayArticles.length} مقال محفوظ`, `${displayArticles.length} saved article${displayArticles.length !== 1 ? 's' : ''}`)}
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

            {/* Infinite scroll sentinel + keyboard-accessible Load More */}
            {showInfiniteScroll && (
              <>
                <div className="flex justify-center py-2">
                  <button
                    onClick={() => { setLoadingMore(true); filters.setPage(p => p + 1); }}
                    className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-md text-sm font-medium bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none transition-colors duration-200 disabled:opacity-50"
                    disabled={loadingMore}
                  >
                    {loadingMore && (
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {loadingMore ? t('جاري التحميل...', 'Loading...') : t('تحميل المزيد', 'Load More')}
                  </button>
                </div>
                <div ref={sentinelRef} className="h-1" aria-hidden="true" />
              </>
            )}
          </>
        )}
      </div>

      {/* Bookmark toast */}
      {bookmarkToast && (
        <div
          className={cn(
            'fixed bottom-6 start-1/2 -translate-x-1/2 z-50',
            'px-4 py-2.5 rounded-lg text-sm font-medium',
            'bg-[#1A1A1A] border border-gold/20 text-gold',
            'shadow-lg shadow-black/30',
            'transition-all duration-200',
            bookmarkToast.visible
              ? 'translate-y-0 opacity-100'
              : 'translate-y-2 opacity-0',
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {bookmarkToast.message}
          </div>
        </div>
      )}
    </div>
  );
}
