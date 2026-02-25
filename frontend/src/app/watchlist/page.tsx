'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  getWatchlists,
  createWatchlist,
  updateWatchlist as apiUpdateWatchlist,
  deleteWatchlist as apiDeleteWatchlist,
  getEntityDetail,
  getBatchQuotes,
  ApiError,
  type WatchlistItem,
} from '@/lib/api-client';
import { useAuth } from '@/lib/hooks/use-auth';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { useLanguage } from '@/providers/LanguageProvider';
import { translateSector } from '@/lib/stock-translations';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { loadLocalWatchlists, saveLocalWatchlists, type LocalWatchlist } from '@/lib/hooks/useWatchlist';
import { formatPrice, formatChangePercent } from '@/lib/formatters';

// ---------------------------------------------------------------------------
// LocalStorage fallback (when API is not available)
// ---------------------------------------------------------------------------

/** Unified quote data that works with both BatchQuote and CompanyDetail. */
interface QuoteData {
  ticker: string;
  short_name: string | null;
  sector: string | null;
  current_price: number | null;
  previous_close: number | null;
  change_pct: number | null;
  volume: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WatchlistPage() {
  const { t, language } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const [watchlists, setWatchlists] = useState<LocalWatchlist[]>([]);
  const [activeList, setActiveList] = useState<string>('default');
  const [newListName, setNewListName] = useState('');
  const [addTicker, setAddTicker] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [useApi, setUseApi] = useState(false);
  const quoteFetchRef = useRef(0);

  // Load watchlists: try API if authenticated, fall back to localStorage
  useEffect(() => {
    if (authLoading) return;

    setLoading(true);

    if (!user) {
      // Not authenticated - use localStorage only
      const local = loadLocalWatchlists();
      setWatchlists(local);
      if (local.length > 0) setActiveList(local[0].id);
      setLoading(false);
      return;
    }

    getWatchlists()
      .then((apiWatchlists: WatchlistItem[]) => {
        if (apiWatchlists.length > 0) {
          setWatchlists(apiWatchlists.map((w) => ({ id: w.id, name: w.name, tickers: w.tickers })));
          setActiveList(apiWatchlists[0].id);
          setUseApi(true);
        } else {
          // API available but no watchlists, use local
          const local = loadLocalWatchlists();
          setWatchlists(local);
          if (local.length > 0) setActiveList(local[0].id);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          // Token expired or invalid - use local fallback
        }
        const local = loadLocalWatchlists();
        setWatchlists(local);
        if (local.length > 0) setActiveList(local[0].id);
      })
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  // Save to localStorage whenever watchlists change (for local mode)
  useEffect(() => {
    if (!useApi && watchlists.length > 0) {
      saveLocalWatchlists(watchlists);
    }
  }, [watchlists, useApi]);

  // Fetch quotes for tickers in the active watchlist
  // Uses batch quotes first (single request), falls back to individual entity
  // detail calls if batch endpoint is unavailable.
  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) {
      setQuotes(new Map());
      setQuotesError(null);
      return;
    }

    const fetchId = ++quoteFetchRef.current;
    setQuotesLoading(true);
    setQuotesError(null);

    const newQuotes = new Map<string, QuoteData>();

    try {
      // Strategy 1: Try batch quotes endpoint (single request, most efficient)
      const batchResults = await getBatchQuotes(tickers);
      if (fetchId !== quoteFetchRef.current) return; // stale request

      for (const bq of batchResults) {
        newQuotes.set(bq.ticker, {
          ticker: bq.ticker,
          short_name: bq.name ?? bq.short_name ?? null,
          sector: null, // batch quotes don't include sector
          current_price: bq.current_price,
          previous_close: bq.previous_close,
          change_pct: bq.change_pct,
          volume: bq.volume,
        });
      }

      // If batch returned results but is missing sector info, try to fill
      // from individual entity detail for the found tickers
      if (newQuotes.size > 0) {
        // Fire-and-forget sector enrichment (don't block rendering)
        const tickersNeedingSector = tickers.filter((tk) => newQuotes.has(tk));
        if (tickersNeedingSector.length > 0) {
          Promise.allSettled(
            tickersNeedingSector.map((tk) =>
              getEntityDetail(tk).then((detail) => {
                if (fetchId !== quoteFetchRef.current) return;
                const existing = newQuotes.get(tk);
                if (existing && detail) {
                  newQuotes.set(tk, {
                    ...existing,
                    sector: detail.sector ?? existing.sector,
                    short_name: detail.short_name ?? existing.short_name,
                  });
                }
              })
            )
          ).then(() => {
            if (fetchId === quoteFetchRef.current) {
              setQuotes(new Map(newQuotes));
            }
          });
        }

        setQuotes(new Map(newQuotes));
        setQuotesLoading(false);
        return;
      }
    } catch {
      // Batch endpoint failed -- fall through to individual fetches
    }

    // Strategy 2: Fallback to individual getEntityDetail calls
    try {
      const results = await Promise.allSettled(
        tickers.map((ticker) => getEntityDetail(ticker))
      );
      if (fetchId !== quoteFetchRef.current) return; // stale request

      let anySuccess = false;
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value) {
          const detail = result.value;
          const changePct =
            detail.current_price != null &&
            detail.previous_close != null &&
            detail.previous_close > 0
              ? ((detail.current_price - detail.previous_close) / detail.previous_close) * 100
              : null;
          newQuotes.set(tickers[i], {
            ticker: detail.ticker ?? tickers[i],
            short_name: detail.short_name ?? null,
            sector: detail.sector ?? null,
            current_price: detail.current_price ?? null,
            previous_close: detail.previous_close ?? null,
            change_pct: changePct != null ? Math.round(changePct * 100) / 100 : null,
            volume: detail.volume ?? null,
          });
          anySuccess = true;
        }
      });

      if (!anySuccess && tickers.length > 0) {
        setQuotesError(
          t(
            'تعذر تحميل بيانات الأسهم. تأكد من تشغيل الخادم.',
            'Could not load stock data. Make sure the backend server is running.'
          )
        );
      }

      setQuotes(new Map(newQuotes));
    } catch {
      setQuotesError(
        t(
          'تعذر الاتصال بالخادم لتحميل بيانات الأسهم.',
          'Could not connect to the server to load stock data.'
        )
      );
    } finally {
      if (fetchId === quoteFetchRef.current) {
        setQuotesLoading(false);
      }
    }
  }, [t]);

  // Trigger quote fetching when the active list changes
  useEffect(() => {
    const active = watchlists.find((w) => w.id === activeList);
    if (!active || active.tickers.length === 0) {
      setQuotes(new Map());
      setQuotesError(null);
      return;
    }

    fetchQuotes(active.tickers);
  }, [watchlists, activeList, fetchQuotes]);

  const currentList = watchlists.find((w) => w.id === activeList);

  const handleCreateList = useCallback(async () => {
    if (!newListName.trim()) return;
    if (useApi) {
      try {
        const created = await createWatchlist({ name: newListName.trim(), tickers: [] });
        const local = { id: created.id, name: created.name, tickers: created.tickers };
        setWatchlists((prev) => [...prev, local]);
        setActiveList(local.id);
      } catch {
        // Fallback to local
        const local: LocalWatchlist = { id: `list-${Date.now()}`, name: newListName.trim(), tickers: [] };
        setWatchlists((prev) => [...prev, local]);
        setActiveList(local.id);
      }
    } else {
      const local: LocalWatchlist = { id: `list-${Date.now()}`, name: newListName.trim(), tickers: [] };
      setWatchlists((prev) => [...prev, local]);
      setActiveList(local.id);
    }
    setNewListName('');
    setShowCreateForm(false);
  }, [newListName, useApi]);

  const handleDeleteList = useCallback(
    async (id: string) => {
      if (!window.confirm(t('\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0647 \u0627\u0644\u0642\u0627\u0626\u0645\u0629\u061F', 'Are you sure you want to delete this list?'))) return;
      if (useApi) {
        try {
          await apiDeleteWatchlist(id);
        } catch {
          // continue with local delete
        }
      }
      setWatchlists((prev) => {
        const updated = prev.filter((w) => w.id !== id);
        if (activeList === id && updated.length > 0) {
          setActiveList(updated[0].id);
        }
        return updated;
      });
    },
    [activeList, useApi, t]
  );

  const handleAddTicker = useCallback(async () => {
    if (!addTicker.trim() || !currentList) return;
    let ticker = addTicker.trim().toUpperCase();
    // Auto-append .SR if user enters just a number (e.g. "2222" -> "2222.SR")
    if (/^\d{4}$/.test(ticker)) {
      ticker = `${ticker}.SR`;
    }
    if (currentList.tickers.includes(ticker)) {
      setAddTicker('');
      return;
    }
    const newTickers = [...currentList.tickers, ticker];
    if (useApi) {
      try {
        await apiUpdateWatchlist(currentList.id, { tickers: newTickers });
      } catch {
        // continue with local update
      }
    }
    setWatchlists((prev) =>
      prev.map((w) => (w.id === activeList ? { ...w, tickers: newTickers } : w))
    );
    setAddTicker('');
  }, [addTicker, activeList, currentList, useApi]);

  const handleRemoveTicker = useCallback(
    async (ticker: string) => {
      if (!currentList) return;
      const newTickers = currentList.tickers.filter((t) => t !== ticker);
      if (useApi) {
        try {
          await apiUpdateWatchlist(currentList.id, { tickers: newTickers });
        } catch {
          // continue with local update
        }
      }
      setWatchlists((prev) =>
        prev.map((w) => (w.id === activeList ? { ...w, tickers: newTickers } : w))
      );
    },
    [activeList, currentList, useApi]
  );

  if (authLoading || loading) {
    return (
      <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
        <LoadingSpinner message={t('\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629...', 'Loading watchlists...')} />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: t('\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629', 'Watchlist') }]} />

        {/* Sync banner for anonymous users */}
        {!user && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gold/5 border border-gold/20 rounded-md">
            <p className="text-xs text-[var(--text-muted)]">
              {t('\u0633\u062C\u0644 \u062F\u062E\u0648\u0644\u0643 \u0644\u0645\u0632\u0627\u0645\u0646\u0629 \u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629 \u0639\u0628\u0631 \u0627\u0644\u0623\u062C\u0647\u0632\u0629', 'Sign in to sync watchlists across devices')}
            </p>
            <Link
              href="/login?redirect=/watchlist"
              className="shrink-0 px-3 py-1 rounded-md text-xs font-medium bg-gold/20 text-gold hover:bg-gold/30 transition-colors"
            >
              {t('\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644', 'Sign In')}
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629', 'Watchlists')}</h1>
            <p className="text-sm text-[var(--text-muted)]">{t('\u062A\u0627\u0628\u0639 \u0623\u0633\u0647\u0645\u0643 \u0627\u0644\u0645\u0641\u0636\u0644\u0629 \u0641\u064A \u062A\u062F\u0627\u0648\u0644', 'Track your favorite Tadawul stocks')}</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium',
              'bg-gold text-dark-bg',
              'hover:bg-gold-light transition-colors'
            )}
          >
            + {t('\u0642\u0627\u0626\u0645\u0629 \u062C\u062F\u064A\u062F\u0629', 'New List')}
          </button>
        </div>

        {/* Create list form */}
        {showCreateForm && (
          <div className="flex gap-2 p-3 bg-[var(--bg-card)] border gold-border rounded-md">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
              placeholder={t('\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629...', 'List name...')}
              className="flex-1 bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-md px-3 py-1.5 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold"
            />
            <button
              onClick={handleCreateList}
              disabled={!newListName.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-gold text-dark-bg hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('\u0625\u0646\u0634\u0627\u0621', 'Create')}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setNewListName(''); }}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {t('\u0625\u0644\u063A\u0627\u0621', 'Cancel')}
            </button>
          </div>
        )}

        {/* Watchlist Tabs */}
        <div className="flex gap-2 flex-wrap">
          {watchlists.map((wl) => (
            <button
              key={wl.id}
              onClick={() => setActiveList(wl.id)}
              className={cn(
                'px-3 py-1.5 rounded-pill text-xs font-medium transition-all duration-200 flex items-center gap-1.5',
                activeList === wl.id
                  ? 'bg-gold/20 text-gold border border-gold/40'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border gold-border hover:text-[var(--text-primary)]'
              )}
            >
              {wl.name}
              <span className="text-[13.5px] opacity-60">({wl.tickers.length})</span>
            </button>
          ))}
        </div>

        {/* Active List Content */}
        {currentList && (
          <>
            {/* Add ticker */}
            <div className="flex gap-2">
              <input
                type="text"
                value={addTicker}
                onChange={(e) => setAddTicker(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTicker()}
                placeholder={t('\u0623\u0636\u0641 \u0631\u0645\u0632 \u0627\u0644\u0633\u0647\u0645 (\u0645\u062B\u0627\u0644: 2222.SR)...', 'Add ticker (e.g. 2222.SR)...')}
                className="flex-1 bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-md px-3 py-1.5 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold"
              />
              <button
                onClick={handleAddTicker}
                disabled={!addTicker.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-gold/20 text-gold hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('\u0625\u0636\u0627\u0641\u0629', 'Add')}
              </button>
              {currentList.id !== 'default' && (
                <button
                  onClick={() => handleDeleteList(currentList.id)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-accent-red/60 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                >
                  {t('\u062D\u0630\u0641 \u0627\u0644\u0642\u0627\u0626\u0645\u0629', 'Delete List')}
                </button>
              )}
            </div>

            {/* Error banner */}
            {quotesError && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-accent-red/5 border border-accent-red/20 rounded-md">
                <p className="text-xs text-accent-red">{quotesError}</p>
                <button
                  onClick={() => {
                    const active = watchlists.find((w) => w.id === activeList);
                    if (active) fetchQuotes(active.tickers);
                  }}
                  className="shrink-0 px-3 py-1 rounded-md text-xs font-medium bg-accent-red/10 text-accent-red hover:bg-accent-red/20 transition-colors"
                >
                  {t('\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629', 'Retry')}
                </button>
              </div>
            )}

            {/* Ticker List */}
            {currentList.tickers.length === 0 ? (
              <div className="text-center py-12 bg-[var(--bg-card)] border gold-border rounded-md">
                <p className="text-sm text-[var(--text-muted)]">{t('\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0647\u0645 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0642\u0627\u0626\u0645\u0629. \u0623\u0636\u0641 \u0633\u0647\u0645 \u0623\u0639\u0644\u0627\u0647.', 'No stocks in this list. Add a ticker above.')}</p>
              </div>
            ) : (
              <div className="bg-[var(--bg-card)] border gold-border rounded-md overflow-hidden">
                {quotesLoading && (
                  <div className="px-3 py-2 bg-gold/5 border-b border-gold/10 flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
                    <span className="text-xs text-[var(--text-muted)]">
                      {t('\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u0633\u0647\u0645...', 'Loading stock data...')}
                    </span>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-input)]">
                      <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-gold uppercase tracking-wider">{t('\u0627\u0644\u0631\u0645\u0632', 'Ticker')}</th>
                      <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-gold uppercase tracking-wider hidden sm:table-cell">{t('\u0627\u0644\u0627\u0633\u0645', 'Name')}</th>
                      <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-gold uppercase tracking-wider hidden sm:table-cell">{t('\u0627\u0644\u0642\u0637\u0627\u0639', 'Sector')}</th>
                      <th scope="col" className="px-3 py-2 text-end text-xs font-medium text-gold uppercase tracking-wider">{t('\u0627\u0644\u0633\u0639\u0631', 'Price')}</th>
                      <th scope="col" className="px-3 py-2 text-end text-xs font-medium text-gold uppercase tracking-wider">{t('\u0627\u0644\u062A\u063A\u064A\u064A\u0631', 'Change')}</th>
                      <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gold uppercase tracking-wider w-10">{t('\u0625\u062C\u0631\u0627\u0621\u0627\u062A', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentList.tickers.map((ticker) => {
                      const quote = quotes.get(ticker);
                      const change = quote?.change_pct ?? (
                        quote?.current_price != null && quote?.previous_close != null && quote.previous_close > 0
                          ? Math.round(((quote.current_price - quote.previous_close) / quote.previous_close) * 10000) / 100
                          : null
                      );
                      const isUp = change !== null && change >= 0;

                      return (
                        <tr key={ticker} className="border-t border-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] transition-colors">
                          <td className="px-3 py-2">
                            <Link
                              href={`/stock/${encodeURIComponent(ticker)}`}
                              className="text-sm font-medium text-gold hover:text-gold-light transition-colors"
                            >
                              {ticker}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-[var(--text-secondary)] hidden sm:table-cell">
                            {quotesLoading && !quote ? (
                              <span className="inline-block w-20 h-4 bg-[var(--bg-input)] rounded animate-pulse" />
                            ) : (
                              quote?.short_name || '-'
                            )}
                          </td>
                          <td className="px-3 py-2 text-[var(--text-muted)] text-xs hidden sm:table-cell">
                            {quotesLoading && !quote ? (
                              <span className="inline-block w-16 h-4 bg-[var(--bg-input)] rounded animate-pulse" />
                            ) : (
                              quote?.sector ? translateSector(quote.sector, language) : '-'
                            )}
                          </td>
                          <td className="px-3 py-2 text-end text-[var(--text-primary)] font-medium">
                            {quotesLoading && !quote ? (
                              <span className="inline-block w-12 h-4 bg-[var(--bg-input)] rounded animate-pulse" />
                            ) : (
                              formatPrice(quote?.current_price)
                            )}
                          </td>
                          <td className={cn('px-3 py-2 text-end font-medium', isUp ? 'text-accent-green' : 'text-accent-red')}>
                            {quotesLoading && !quote ? (
                              <span className="inline-block w-12 h-4 bg-[var(--bg-input)] rounded animate-pulse" />
                            ) : (
                              change !== null ? formatChangePercent(change) : '-'
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => handleRemoveTicker(ticker)}
                              className="text-[var(--text-muted)] hover:text-accent-red transition-colors"
                              aria-label={t(`\u062D\u0630\u0641 ${ticker}`, `Remove ${ticker}`)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
