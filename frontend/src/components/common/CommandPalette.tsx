'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  section: string;
  href: string;
}

interface CachedStock {
  ticker: string;
  name: string;
  sector: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_KEY = 'rad-palette-recent';
const STOCK_CACHE_KEY = 'rad-palette-stocks';
const MAX_RECENT = 5;

const PAGE_ITEMS: PaletteItem[] = [
  { id: 'page-home', label: '\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629', sublabel: 'Home', section: '\u0627\u0644\u0635\u0641\u062D\u0627\u062A', href: '/' },
  { id: 'page-market', label: '\u0627\u0644\u0633\u0648\u0642', sublabel: 'Market', section: '\u0627\u0644\u0635\u0641\u062D\u0627\u062A', href: '/market' },
  { id: 'page-charts', label: '\u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A\u0629', sublabel: 'Charts', section: '\u0627\u0644\u0635\u0641\u062D\u0627\u062A', href: '/charts' },
  { id: 'page-news', label: '\u0627\u0644\u0623\u062E\u0628\u0627\u0631', sublabel: 'News', section: '\u0627\u0644\u0635\u0641\u062D\u0627\u062A', href: '/news' },
  { id: 'page-chat', label: '\u0631\u0627\u0626\u062F - \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629', sublabel: 'AI Chat', section: '\u0627\u0644\u0635\u0641\u062D\u0627\u062A', href: '/chat' },
  { id: 'page-reports', label: '\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631', sublabel: 'Reports', section: '\u0627\u0644\u0635\u0641\u062D\u0627\u062A', href: '/reports' },
  { id: 'page-watchlist', label: '\u0627\u0644\u0645\u0641\u0636\u0644\u0629', sublabel: 'Watchlist', section: '\u0627\u0644\u0635\u0641\u062D\u0627\u062A', href: '/watchlist' },
  { id: 'page-announcements', label: '\u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A', sublabel: 'Announcements', section: '\u0627\u0644\u0635\u0641\u062D\u0627\u062A', href: '/announcements' },
];

const ACTION_ITEMS: PaletteItem[] = [
  { id: 'act-charts', label: '\u0639\u0631\u0636 \u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A\u0629', section: '\u0625\u062C\u0631\u0627\u0621\u0627\u062A', href: '/charts' },
  { id: 'act-ask', label: '\u0627\u0633\u0623\u0644 \u0631\u0627\u0626\u062F \u0639\u0646...', section: '\u0625\u062C\u0631\u0627\u0621\u0627\u062A', href: '/chat' },
  { id: 'act-movers', label: '\u0639\u0631\u0636 \u0623\u0643\u062B\u0631 \u0627\u0644\u0623\u0633\u0647\u0645 \u062A\u062D\u0631\u0643\u0627\u064B', section: '\u0625\u062C\u0631\u0627\u0621\u0627\u062A', href: '/market' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const recent = getRecentSearches().filter((r) => r !== query);
  recent.unshift(query);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function getCachedStocks(): CachedStock[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STOCK_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.ts && Date.now() - parsed.ts < 3600000) {
        return parsed.data;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function setCachedStocks(data: CachedStock[]) {
  localStorage.setItem(
    STOCK_CACHE_KEY,
    JSON.stringify({ ts: Date.now(), data }),
  );
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  return lower.includes(q);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [stocks, setStocks] = useState<CachedStock[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load stocks on first open
  useEffect(() => {
    if (!open) return;
    setRecentSearches(getRecentSearches());

    const cached = getCachedStocks();
    if (cached.length > 0) {
      setStocks(cached);
      return;
    }

    // Fetch stock list from heatmap endpoint
    fetch('/api/market/heatmap')
      .then((r) => r.json())
      .then((data: Array<{ ticker: string; name: string; sector: string }>) => {
        if (Array.isArray(data)) {
          const mapped = data.map((d) => ({
            ticker: d.ticker,
            name: d.name,
            sector: d.sector,
          }));
          setStocks(mapped);
          setCachedStocks(mapped);
        }
      })
      .catch(() => {
        // Also try /api/entities as fallback
        fetch('/api/entities?limit=600')
          .then((r) => r.json())
          .then((res: { items: Array<{ ticker: string; short_name: string | null; sector: string | null }> }) => {
            if (res.items) {
              const mapped = res.items.map((d) => ({
                ticker: d.ticker,
                name: d.short_name ?? d.ticker,
                sector: d.sector ?? '',
              }));
              setStocks(mapped);
              setCachedStocks(mapped);
            }
          })
          .catch(() => {});
      });
  }, [open]);

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Build filtered results
  const results = useMemo((): PaletteItem[] => {
    const q = query.trim();
    if (!q) {
      // Show pages + actions when no query
      return [...PAGE_ITEMS, ...ACTION_ITEMS];
    }

    const items: PaletteItem[] = [];

    // Filter stocks
    const matchedStocks = stocks
      .filter(
        (s) =>
          fuzzyMatch(s.ticker, q) ||
          fuzzyMatch(s.name, q),
      )
      .slice(0, 8);

    for (const s of matchedStocks) {
      items.push({
        id: `stock-${s.ticker}`,
        label: `${s.ticker} - ${s.name}`,
        sublabel: s.sector,
        section: '\u0627\u0644\u0623\u0633\u0647\u0645',
        href: `/stock/${s.ticker}`,
      });
    }

    // Filter pages
    for (const p of PAGE_ITEMS) {
      if (
        fuzzyMatch(p.label, q) ||
        (p.sublabel && fuzzyMatch(p.sublabel, q))
      ) {
        items.push(p);
      }
    }

    // Filter actions
    for (const a of ACTION_ITEMS) {
      if (fuzzyMatch(a.label, q)) {
        items.push(a);
      }
    }

    return items;
  }, [query, stocks]);

  // Reset index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Navigate to selected item
  const handleSelect = useCallback(
    (item: PaletteItem) => {
      if (query.trim()) {
        saveRecentSearch(query.trim());
      }
      setOpen(false);
      router.push(item.href);
    },
    [query, router],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [results, selectedIndex, handleSelect],
  );

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Group results by section for display
  const grouped = useMemo(() => {
    const map = new Map<string, { item: PaletteItem; globalIndex: number }[]>();
    results.forEach((item, index) => {
      const existing = map.get(item.section) ?? [];
      existing.push({ item, globalIndex: index });
      map.set(item.section, existing);
    });
    return map;
  }, [results]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

      {/* Palette modal */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg mx-4',
          'bg-[#1A1A1A] border border-[#2A2A2A]',
          'rounded-xl shadow-2xl shadow-black/50',
          'overflow-hidden',
          'animate-slide-down',
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="\u0628\u062D\u062B \u0633\u0631\u064A\u0639"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2A2A2A]">
          <svg
            className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="\u0627\u0628\u062D\u062B \u0639\u0646 \u0633\u0647\u0645 \u0623\u0648 \u0635\u0641\u062D\u0629..."
            className={cn(
              'flex-1 bg-transparent text-sm',
              'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
              'focus:outline-none',
            )}
            dir="rtl"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] bg-[#2A2A2A] rounded">
            ESC
          </kbd>
        </div>

        {/* Recent searches */}
        {!query.trim() && recentSearches.length > 0 && (
          <div className="px-4 py-2 border-b border-[#2A2A2A]">
            <p className="text-[10px] text-[var(--text-muted)] mb-1.5">\u0627\u0644\u0628\u062D\u062B \u0627\u0644\u0623\u062E\u064A\u0631</p>
            <div className="flex flex-wrap gap-1.5">
              {recentSearches.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="px-2 py-0.5 text-xs text-[var(--text-secondary)] bg-[#2A2A2A] rounded hover:text-gold transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results list */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--text-muted)]">\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C</p>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([section, entries]) => (
              <div key={section}>
                <p className="px-4 py-1.5 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                  {section}
                </p>
                {entries.map(({ item, globalIndex }) => (
                  <button
                    key={item.id}
                    data-selected={globalIndex === selectedIndex}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm',
                      'transition-colors duration-100',
                      globalIndex === selectedIndex
                        ? 'bg-[#D4A84B]/10 text-gold'
                        : 'text-[var(--text-secondary)] hover:bg-[#252525]',
                    )}
                    dir="rtl"
                  >
                    {/* Icon based on section */}
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {item.section === '\u0627\u0644\u0623\u0633\u0647\u0645' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                      ) : item.section === '\u0625\u062C\u0631\u0627\u0621\u0627\u062A' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polygon points="10 8 16 12 10 16 10 8" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                          <polyline points="13 2 13 9 20 9" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-start truncate">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                        {item.sublabel}
                      </span>
                    )}
                    {globalIndex === selectedIndex && (
                      <svg className="w-4 h-4 text-gold flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 10 4 15 9 20" />
                        <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-[#2A2A2A] flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[#2A2A2A] rounded font-mono">&uarr;&darr;</kbd>
            \u0644\u0644\u062A\u0646\u0642\u0644
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[#2A2A2A] rounded font-mono">Enter</kbd>
            \u0644\u0644\u0641\u062A\u062D
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[#2A2A2A] rounded font-mono">Esc</kbd>
            \u0644\u0644\u0625\u063A\u0644\u0627\u0642
          </span>
        </div>
      </div>
    </div>
  );
}
