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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NewsPage() {
  const { t } = useLanguage();
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

  const stickyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastKnownIdsRef = useRef<Set<string>>(new Set());
  const gridContainerRef = useRef<HTMLDivElement>(null);

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
    if (filters.searchQuery.trim() || filters.showSaved) return;

    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    // Try SSE first
    const sseUrl = `/api/v1/news/stream${filters.activeSource ? `?source=${encodeURIComponent(filters.activeSource)}` : ''}`;
    let es: EventSource | null = null;

    try {
      es = new EventSource(sseUrl);

      es.onmessage = (event) => {
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
    } catch {
      // EventSource constructor failed (e.g. SSR) -- fall back to polling
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
    estimateSize: () => 220, // estimated row height in px
    overscan: 5,
  });

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
            {isSearching ? (
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            ) : filters.showSaved ? (
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            ) : (
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            )}
            <p className="text-sm text-[var(--text-muted)]">
              {isSearching
                ? t(`لا توجد نتائج للبحث "${filters.searchQuery}"`, `No results found for "${filters.searchQuery}"`)
                : filters.showSaved
                  ? t('لا توجد مقالات محفوظة - اضغط على أيقونة الحفظ لحفظ المقالات', 'No saved articles - tap the bookmark icon to save articles')
                  : t('لا توجد أخبار حالياً - يتم تحديث الأخبار تلقائياً', 'No news available - news updates automatically')}
            </p>
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
                    className="px-4 py-2 rounded-md text-sm font-medium bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-colors"
                    disabled={loadingMore}
                  >
                    {loadingMore ? t('جاري التحميل...', 'Loading...') : t('تحميل المزيد', 'Load More')}
                  </button>
                </div>
                <div ref={sentinelRef} className="h-1" aria-hidden="true" />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
