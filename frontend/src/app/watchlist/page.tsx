'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  getWatchlists,
  createWatchlist,
  updateWatchlist as apiUpdateWatchlist,
  deleteWatchlist as apiDeleteWatchlist,
  getEntityDetail,
  type WatchlistItem,
  type CompanyDetail,
} from '@/lib/api-client';
import { LoadingSpinner } from '@/components/common/loading-spinner';

// ---------------------------------------------------------------------------
// LocalStorage fallback (when API is not available)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'rad-ai-watchlists';

interface LocalWatchlist {
  id: string;
  name: string;
  tickers: string[];
}

function loadLocalWatchlists(): LocalWatchlist[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : getDefaultWatchlists();
  } catch {
    return getDefaultWatchlists();
  }
}

function saveLocalWatchlists(lists: LocalWatchlist[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

function getDefaultWatchlists(): LocalWatchlist[] {
  return [
    { id: 'default', name: 'My Watchlist', tickers: ['2222.SR', '1180.SR', '2010.SR', '1010.SR', '7010.SR'] },
    { id: 'banks', name: 'Banking Sector', tickers: ['1180.SR', '1010.SR', '1020.SR', '1050.SR'] },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<LocalWatchlist[]>([]);
  const [activeList, setActiveList] = useState<string>('default');
  const [newListName, setNewListName] = useState('');
  const [addTicker, setAddTicker] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [quotes, setQuotes] = useState<Map<string, CompanyDetail>>(new Map());
  const [loading, setLoading] = useState(true);
  const [useApi, setUseApi] = useState(false);

  // Load watchlists: try API first, fall back to localStorage
  useEffect(() => {
    setLoading(true);
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
      .catch(() => {
        // API not available, use localStorage
        const local = loadLocalWatchlists();
        setWatchlists(local);
        if (local.length > 0) setActiveList(local[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  // Save to localStorage whenever watchlists change (for local mode)
  useEffect(() => {
    if (!useApi && watchlists.length > 0) {
      saveLocalWatchlists(watchlists);
    }
  }, [watchlists, useApi]);

  // Fetch quotes for tickers in the active watchlist
  useEffect(() => {
    const active = watchlists.find((w) => w.id === activeList);
    if (!active || active.tickers.length === 0) return;

    Promise.all(
      active.tickers.map((ticker) =>
        getEntityDetail(ticker).catch(() => null)
      )
    ).then((results) => {
      const newQuotes = new Map<string, CompanyDetail>();
      results.forEach((q, i) => {
        if (q) newQuotes.set(active.tickers[i], q);
      });
      setQuotes(newQuotes);
    });
  }, [watchlists, activeList]);

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
    [activeList, useApi]
  );

  const handleAddTicker = useCallback(async () => {
    if (!addTicker.trim() || !currentList) return;
    const ticker = addTicker.trim().toUpperCase();
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

  if (loading) {
    return (
      <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
        <LoadingSpinner message="Loading watchlists..." />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Watchlists</h1>
            <p className="text-sm text-[var(--text-muted)]">Track your favorite TASI stocks</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium',
              'bg-gold text-dark-bg',
              'hover:bg-gold-light transition-colors'
            )}
          >
            + New List
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
              placeholder="List name..."
              className="flex-1 bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-md px-3 py-1.5 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold"
            />
            <button
              onClick={handleCreateList}
              disabled={!newListName.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-gold text-dark-bg hover:bg-gold-light disabled:opacity-30 transition-colors"
            >
              Create
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
              <span className="text-[10px] opacity-60">({wl.tickers.length})</span>
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
                placeholder="Add ticker (e.g., 2222.SR)..."
                className="flex-1 bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-md px-3 py-1.5 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold"
              />
              <button
                onClick={handleAddTicker}
                disabled={!addTicker.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-gold/20 text-gold hover:bg-gold/30 disabled:opacity-30 transition-colors"
              >
                Add
              </button>
              {currentList.id !== 'default' && (
                <button
                  onClick={() => handleDeleteList(currentList.id)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-accent-red/60 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                >
                  Delete List
                </button>
              )}
            </div>

            {/* Ticker List */}
            {currentList.tickers.length === 0 ? (
              <div className="text-center py-12 bg-[var(--bg-card)] border gold-border rounded-md">
                <p className="text-sm text-[var(--text-muted)]">No tickers in this watchlist. Add one above.</p>
              </div>
            ) : (
              <div className="bg-[var(--bg-card)] border gold-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-input)]">
                      <th className="px-3 py-2 text-start text-xs font-medium text-gold uppercase tracking-wider">Ticker</th>
                      <th className="px-3 py-2 text-start text-xs font-medium text-gold uppercase tracking-wider hidden sm:table-cell">Name</th>
                      <th className="px-3 py-2 text-start text-xs font-medium text-gold uppercase tracking-wider hidden sm:table-cell">Sector</th>
                      <th className="px-3 py-2 text-end text-xs font-medium text-gold uppercase tracking-wider">Price</th>
                      <th className="px-3 py-2 text-end text-xs font-medium text-gold uppercase tracking-wider">Change</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gold uppercase tracking-wider w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentList.tickers.map((ticker) => {
                      const quote = quotes.get(ticker);
                      const change = quote?.current_price != null && quote?.previous_close != null && quote.previous_close > 0
                        ? ((quote.current_price - quote.previous_close) / quote.previous_close) * 100
                        : null;
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
                            {quote?.short_name || '-'}
                          </td>
                          <td className="px-3 py-2 text-[var(--text-muted)] text-xs hidden sm:table-cell">
                            {quote?.sector || '-'}
                          </td>
                          <td className="px-3 py-2 text-end text-[var(--text-primary)] font-medium">
                            {quote?.current_price?.toFixed(2) || '-'}
                          </td>
                          <td className={cn('px-3 py-2 text-end font-medium', isUp ? 'text-accent-green' : 'text-accent-red')}>
                            {change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => handleRemoveTicker(ticker)}
                              className="text-[var(--text-muted)] hover:text-accent-red transition-colors"
                              aria-label={`Remove ${ticker}`}
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
