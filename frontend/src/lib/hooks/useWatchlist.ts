import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'rad-ai-watchlists';

export interface LocalWatchlist {
  id: string;
  name: string;
  tickers: string[];
}

export function getDefaultWatchlists(): LocalWatchlist[] {
  return [
    { id: 'default', name: 'قائمتي', tickers: ['2222.SR', '1180.SR', '2010.SR', '1010.SR', '7010.SR'] },
    { id: 'banks', name: 'قطاع البنوك', tickers: ['1180.SR', '1010.SR', '1020.SR', '1050.SR'] },
  ];
}

export function loadLocalWatchlists(): LocalWatchlist[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : getDefaultWatchlists();
  } catch {
    return getDefaultWatchlists();
  }
}

export function saveLocalWatchlists(lists: LocalWatchlist[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function useWatchlist() {
  const [watchlists, setWatchlists] = useState<LocalWatchlist[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setWatchlists(loadLocalWatchlists());
    setLoaded(true);
  }, []);

  // Persist to localStorage on change (after initial load)
  useEffect(() => {
    if (loaded && watchlists.length > 0) {
      saveLocalWatchlists(watchlists);
    }
  }, [watchlists, loaded]);

  const addTicker = useCallback((ticker: string, listId: string = 'default') => {
    setWatchlists(prev =>
      prev.map(w =>
        w.id === listId && !w.tickers.includes(ticker)
          ? { ...w, tickers: [...w.tickers, ticker] }
          : w
      )
    );
  }, []);

  const removeTicker = useCallback((ticker: string, listId: string) => {
    setWatchlists(prev =>
      prev.map(w =>
        w.id === listId ? { ...w, tickers: w.tickers.filter(t => t !== ticker) } : w
      )
    );
  }, []);

  const isWatched = useCallback((ticker: string, listId?: string) => {
    if (listId) {
      return watchlists.find(w => w.id === listId)?.tickers.includes(ticker) ?? false;
    }
    return watchlists.some(w => w.tickers.includes(ticker));
  }, [watchlists]);

  return { watchlists, setWatchlists, addTicker, removeTicker, isWatched, loaded };
}
