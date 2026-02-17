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
import { useLanguage } from '@/providers/LanguageProvider';
import { translateSector, matchesSearch } from '@/lib/stock-translations';
import { getMarketHeatmap, getEntities } from '@/lib/api-client';

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

const RECENT_KEY = 'rad-ai-palette-recent';
const STOCK_CACHE_KEY = 'rad-ai-palette-stocks';
const MAX_RECENT = 5;

// Migrate old key names
if (typeof window !== 'undefined') {
  const oldRecent = localStorage.getItem('rad-palette-recent');
  if (oldRecent && !localStorage.getItem('rad-ai-palette-recent')) {
    localStorage.setItem('rad-ai-palette-recent', oldRecent);
    localStorage.removeItem('rad-palette-recent');
  }
  const oldStocks = localStorage.getItem('rad-palette-stocks');
  if (oldStocks && !localStorage.getItem('rad-ai-palette-stocks')) {
    localStorage.setItem('rad-ai-palette-stocks', oldStocks);
    localStorage.removeItem('rad-palette-stocks');
  }
}

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
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [stocks, setStocks] = useState<CachedStock[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Bilingual labels for page items
  const PAGE_ITEMS: PaletteItem[] = useMemo(() => [
    { id: 'page-home', label: t('الرئيسية', 'Home'), sublabel: t('Home', 'الرئيسية'), section: t('الصفحات', 'Pages'), href: '/' },
    { id: 'page-market', label: t('السوق', 'Market'), sublabel: t('Market', 'السوق'), section: t('الصفحات', 'Pages'), href: '/market' },
    { id: 'page-charts', label: t('الرسوم البيانية', 'Charts'), sublabel: t('Charts', 'الرسوم البيانية'), section: t('الصفحات', 'Pages'), href: '/charts' },
    { id: 'page-news', label: t('الأخبار', 'News'), sublabel: t('News', 'الأخبار'), section: t('الصفحات', 'Pages'), href: '/news' },
    { id: 'page-chat', label: t('رعد - المحادثة', 'Ra\'d - AI Chat'), sublabel: t('AI Chat', 'رعد - المحادثة'), section: t('الصفحات', 'Pages'), href: '/chat' },
    { id: 'page-reports', label: t('التقارير', 'Reports'), sublabel: t('Reports', 'التقارير'), section: t('الصفحات', 'Pages'), href: '/reports' },
    { id: 'page-watchlist', label: t('المفضلة', 'Watchlist'), sublabel: t('Watchlist', 'المفضلة'), section: t('الصفحات', 'Pages'), href: '/watchlist' },
    { id: 'page-announcements', label: t('الإعلانات', 'Announcements'), sublabel: t('Announcements', 'الإعلانات'), section: t('الصفحات', 'Pages'), href: '/announcements' },
  ], [t]);

  const ACTION_ITEMS: PaletteItem[] = useMemo(() => [
    { id: 'act-charts', label: t('عرض الرسوم البيانية', 'View Charts'), section: t('إجراءات', 'Actions'), href: '/charts' },
    { id: 'act-ask', label: t('اسأل رعد عن...', 'Ask Ra\'d about...'), section: t('إجراءات', 'Actions'), href: '/chat' },
    { id: 'act-movers', label: t('عرض أكثر الأسهم تحركاً', 'View top movers'), section: t('إجراءات', 'Actions'), href: '/market' },
  ], [t]);

  const STOCKS_SECTION = t('الأسهم', 'Stocks');

  // Load stocks on first open
  useEffect(() => {
    if (!open) return;
    setRecentSearches(getRecentSearches());

    const cached = getCachedStocks();
    if (cached.length > 0) {
      setStocks(cached);
      return;
    }

    const controller = new AbortController();

    getMarketHeatmap(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
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
        if (controller.signal.aborted) return;
        getEntities({ limit: 600 }, controller.signal)
          .then((res) => {
            if (controller.signal.aborted) return;
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

    return () => {
      controller.abort();
    };
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

  const ASK_RAID_SECTION = t('اسأل رعد', 'Ask Ra\'d');

  // Detect if a query looks like a natural language question for the AI
  const looksLikeQuestion = useCallback((q: string): boolean => {
    if (!q || q.length < 3) return false;
    // Contains question mark
    if (q.includes('?')) return true;
    // Arabic question particles
    const arabicParticles = ['هل', 'ما', 'كم', 'أي', 'كيف', 'لماذا', 'أين', 'متى', 'من', 'ماذا', 'أيهما', 'كيفية'];
    const words = q.split(/\s+/);
    if (arabicParticles.some((p) => words[0] === p || q.startsWith(p + ' '))) return true;
    // English question words
    const enParticles = ['what', 'how', 'which', 'why', 'where', 'when', 'who', 'show', 'list', 'compare', 'plot'];
    const firstWord = words[0]?.toLowerCase();
    if (enParticles.includes(firstWord)) return true;
    // More than 5 words and doesn't look like a ticker search
    if (words.length > 5 && !/^\d{4}(\.SR)?$/i.test(q.trim())) return true;
    return false;
  }, []);

  // Build filtered results
  const results = useMemo((): PaletteItem[] => {
    const q = query.trim();
    if (!q) {
      // Show pages + actions when no query
      return [...PAGE_ITEMS, ...ACTION_ITEMS];
    }

    const items: PaletteItem[] = [];

    // Smart query routing: if it looks like a question, add "Ask Ra'd" at the top
    if (looksLikeQuestion(q)) {
      items.push({
        id: 'ask-raid',
        label: `${t('اسأل رعد:', 'Ask Ra\'d:')} ${q}`,
        sublabel: t('محادثة ذكية', 'AI Chat'),
        section: ASK_RAID_SECTION,
        href: `/chat?q=${encodeURIComponent(q)}`,
      });
    }

    // Filter stocks (with alias matching for common names like "Aramco")
    const matchedStocks = stocks
      .filter(
        (s) =>
          fuzzyMatch(s.ticker, q) ||
          fuzzyMatch(s.name, q) ||
          matchesSearch({ ticker: s.ticker, short_name: s.name }, q),
      )
      .slice(0, 8);

    for (const s of matchedStocks) {
      items.push({
        id: `stock-${s.ticker}`,
        label: `${s.ticker} - ${s.name}`,
        sublabel: translateSector(s.sector, language),
        section: STOCKS_SECTION,
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
  }, [query, stocks, language, t, PAGE_ITEMS, ACTION_ITEMS, STOCKS_SECTION, ASK_RAID_SECTION, looksLikeQuestion]);

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
        aria-label={t('بحث سريع', 'Quick search')}
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
            placeholder={t('ابحث عن سهم أو صفحة...', 'Search for a stock or page...')}
            className={cn(
              'flex-1 bg-transparent text-sm',
              'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
              'focus:outline-none',
            )}
            dir="auto"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="command-palette-listbox"
            aria-activedescendant={results[selectedIndex] ? `palette-option-${results[selectedIndex].id}` : undefined}
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] bg-[#2A2A2A] rounded">
            ESC
          </kbd>
        </div>

        {/* Recent searches */}
        {!query.trim() && recentSearches.length > 0 && (
          <div className="px-4 py-2 border-b border-[#2A2A2A]">
            <p className="text-[10px] text-[var(--text-muted)] mb-1.5">{t('البحث الأخير', 'Recent searches')}</p>
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
        <div ref={listRef} id="command-palette-listbox" role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--text-muted)]">{t('لا توجد نتائج', 'No results')}</p>
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
                    id={`palette-option-${item.id}`}
                    role="option"
                    aria-selected={globalIndex === selectedIndex}
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
                    dir="auto"
                  >
                    {/* Icon based on section */}
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {item.section === ASK_RAID_SECTION ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      ) : item.section === STOCKS_SECTION ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                      ) : item.section === t('إجراءات', 'Actions') ? (
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
            {t('للتنقل', 'to navigate')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[#2A2A2A] rounded font-mono">Enter</kbd>
            {t('للفتح', 'to open')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[#2A2A2A] rounded font-mono">Esc</kbd>
            {t('للإغلاق', 'to close')}
          </span>
        </div>
      </div>
    </div>
  );
}
