// ---------------------------------------------------------------------------
// Shared types & constants for Charts page components
// ---------------------------------------------------------------------------

export type TabId = 'stocks' | 'compare' | 'analytics';

export const TABS: { id: TabId; labelAr: string; labelEn: string }[] = [
  { id: 'stocks', labelAr: 'الأسهم', labelEn: 'Stocks' },
  { id: 'compare', labelAr: 'المقارنة', labelEn: 'Compare' },
  { id: 'analytics', labelAr: 'تحليلات السوق', labelEn: 'Market Analytics' },
];

export const POPULAR_STOCKS = [
  { ticker: '2222', name: 'Aramco' },
  { ticker: '1120', name: 'Al Rajhi' },
  { ticker: '2010', name: 'SABIC' },
  { ticker: '7010', name: 'STC' },
  { ticker: '1180', name: 'SNB' },
  { ticker: '2350', name: 'Saudi Kayan' },
  { ticker: '1010', name: 'RIBL' },
  { ticker: '2280', name: 'Almarai' },
  { ticker: '4030', name: 'BAJ' },
  { ticker: '7020', name: 'ETIHAD' },
];

// ---------------------------------------------------------------------------
// Recent searches helpers (localStorage)
// ---------------------------------------------------------------------------

export const RECENT_KEY = 'rad-ai-charts-recent';
export const MAX_RECENT = 5;

// Migrate old key name
if (typeof window !== 'undefined') {
  const oldVal = localStorage.getItem('raid-charts-recent');
  if (oldVal && !localStorage.getItem('rad-ai-charts-recent')) {
    localStorage.setItem('rad-ai-charts-recent', oldVal);
    localStorage.removeItem('raid-charts-recent');
  }
}

export function getRecentSearches(): { ticker: string; name: string }[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(ticker: string, name: string) {
  if (typeof window === 'undefined') return;
  try {
    const prev = getRecentSearches().filter((r) => r.ticker !== ticker);
    const next = [{ ticker, name }, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
