// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PAGE_SIZE = 20;
export const POLLING_FALLBACK_INTERVAL = 60_000; // 60 seconds polling fallback

export const SOURCE_FILTERS = [
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

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function getSourceColor(name: string): string {
  return SOURCE_COLORS[name] ?? '#D4A84B';
}

export function timeAgo(dateStr: string | null, t: (ar: string, en: string) => string, language: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';

  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  const weeks = Math.floor(days / 7);

  if (minutes < 1) return t('الآن', 'just now');
  if (minutes === 1) return t('منذ دقيقة', '1 minute ago');
  if (minutes === 2) return t('منذ دقيقتين', '2 minutes ago');
  if (minutes < 11) return t(`منذ ${minutes} دقائق`, `${minutes} minutes ago`);
  if (minutes < 60) return t(`منذ ${minutes} دقيقة`, `${minutes} minutes ago`);
  if (hours === 1) return t('منذ ساعة', '1 hour ago');
  if (hours === 2) return t('منذ ساعتين', '2 hours ago');
  if (hours < 11) return t(`منذ ${hours} ساعات`, `${hours} hours ago`);
  if (hours < 24) return t(`منذ ${hours} ساعة`, `${hours} hours ago`);
  if (days === 1) return t('منذ يوم', 'yesterday');
  if (days === 2) return t('منذ يومين', '2 days ago');
  if (days < 7) return t(`منذ ${days} أيام`, `${days} days ago`);
  if (weeks === 1) return t('منذ أسبوع', '1 week ago');
  if (weeks === 2) return t('منذ أسبوعين', '2 weeks ago');
  if (weeks < 5) return t(`منذ ${weeks} أسابيع`, `${weeks} weeks ago`);
  return new Date(dateStr).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US');
}

export function readingTime(body: string | null, t: (ar: string, en: string) => string): string | null {
  if (!body || body.length < 50) return null;
  const words = body.split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  if (mins === 1) return t('قراءة دقيقة واحدة', '1 min read');
  if (mins === 2) return t('قراءة دقيقتين', '2 min read');
  return t(`قراءة ${mins} دقائق`, `${mins} min read`);
}

export function getBookmarks(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveBookmarks(ids: Set<string>) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(ids)));
}
