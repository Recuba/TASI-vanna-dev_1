'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types (matches AnnouncementItem in api-client.ts)
// ---------------------------------------------------------------------------

interface Announcement {
  id: string;
  ticker: string | null;
  title_ar: string | null;
  title_en: string | null;
  body_ar: string | null;
  body_en: string | null;
  source: string | null;
  announcement_date: string | null;
  category: string | null;
  classification: string | null;
  is_material: boolean;
  source_url: string | null;
  created_at: string | null;
}

interface PaginatedResponse {
  items: Announcement[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const FILTER_TABS = [
  { key: null, label: '\u0627\u0644\u0643\u0644' },
  { key: 'material', label: '\u062C\u0648\u0647\u0631\u064A' },
  { key: 'general', label: '\u0639\u0627\u0645' },
] as const;

// ---------------------------------------------------------------------------
// Date formatter
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="p-5 rounded-md bg-[var(--bg-card)] border border-[#2A2A2A] animate-pulse space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-5 bg-[var(--bg-input)] rounded w-16" />
        <div className="h-5 bg-[var(--bg-input)] rounded w-12" />
      </div>
      <div className="h-5 bg-[var(--bg-input)] rounded w-3/4" />
      <div className="space-y-2">
        <div className="h-3 bg-[var(--bg-input)] rounded w-full" />
        <div className="h-3 bg-[var(--bg-input)] rounded w-5/6" />
      </div>
      <div className="h-3 bg-[var(--bg-input)] rounded w-24" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Announcement card
// ---------------------------------------------------------------------------

function AnnouncementCard({ item }: { item: Announcement }) {
  const [expanded, setExpanded] = useState(false);
  const title = item.title_ar || item.title_en || '\u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646';
  const body = item.body_ar || item.body_en || '';

  return (
    <article
      className={cn(
        'rounded-md overflow-hidden',
        'bg-[var(--bg-card)] border border-[#2A2A2A]',
        'hover:border-[#D4A84B]/30 hover:shadow-lg hover:shadow-[#D4A84B]/5',
        'transition-all duration-200',
      )}
    >
      <div className="p-5 space-y-3">
        {/* Badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.is_material && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FF6B6B]/10 text-[#FF6B6B] border border-[#FF6B6B]/20">
              \u062C\u0648\u0647\u0631\u064A
            </span>
          )}
          {!item.is_material && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#4A9FFF]/10 text-[#4A9FFF] border border-[#4A9FFF]/20">
              \u0639\u0627\u0645
            </span>
          )}
          {item.ticker && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#D4A84B]/10 text-[#D4A84B] border border-[#D4A84B]/20">
              {item.ticker}
            </span>
          )}
          {item.category && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {item.category}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight">
          {title}
        </h3>

        {/* Body */}
        {body && (
          <div>
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
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-gold hover:text-gold-light mt-1 transition-colors"
              >
                {expanded ? '\u0625\u063A\u0644\u0627\u0642' : '\u0627\u0642\u0631\u0623 \u0627\u0644\u0645\u0632\u064A\u062F'}
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--text-muted)]">
          {item.announcement_date && (
            <span>{formatDate(item.announcement_date)}</span>
          )}
          {item.source && <span>{item.source}</span>}
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:text-gold-light transition-colors"
            >
              \u0627\u0644\u0645\u0635\u062F\u0631
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pgRequired, setPgRequired] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPgRequired(false);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(PAGE_SIZE));
      if (filter === 'material') {
        params.set('category', 'material');
      } else if (filter === 'general') {
        params.set('category', 'general');
      }

      const res = await fetch(`/api/announcements?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(typeof window !== 'undefined' && localStorage.getItem('rad-ai-token')
            ? { Authorization: `Bearer ${localStorage.getItem('rad-ai-token')}` }
            : {}),
        },
      });

      if (res.status === 503 || res.status === 501) {
        setPgRequired(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const data: PaginatedResponse = await res.json();
      setAnnouncements(data.items);
      setTotal(data.total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '\u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639';
      // Check if it's a connection error that likely means no PG
      if (msg.includes('503') || msg.includes('Failed to fetch')) {
        setPgRequired(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handleFilterChange = (key: string | null) => {
    setFilter(key);
    setPage(1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            \u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0647\u064A\u0626\u0629 \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0648\u062A\u062F\u0627\u0648\u0644
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {FILTER_TABS.map((tab) => {
            const isActive = filter === tab.key;
            return (
              <button
                key={tab.label}
                onClick={() => handleFilterChange(tab.key)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-medium',
                  'border transition-all duration-200',
                  isActive
                    ? 'bg-[#D4A84B]/10 border-[#D4A84B] text-[#D4A84B]'
                    : 'bg-[var(--bg-input)] border-[var(--bg-input)] text-[var(--text-secondary)] hover:border-[#2A2A2A]',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : pgRequired ? (
          /* PostgreSQL required message */
          <div className="text-center py-16">
            <svg
              className="w-16 h-16 mx-auto text-[var(--text-muted)] mb-4 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-base font-medium text-[var(--text-secondary)] mb-2">
              \u0647\u0630\u0647 \u0627\u0644\u062E\u062F\u0645\u0629 \u062A\u062A\u0637\u0644\u0628 \u0642\u0627\u0639\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A PostgreSQL
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0644\u062A\u0641\u0639\u064A\u0644 \u0647\u0630\u0647 \u0627\u0644\u0645\u064A\u0632\u0629
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-[#FF6B6B] mb-3">{error}</p>
            <button
              onClick={fetchAnnouncements}
              className={cn(
                'px-4 py-1.5 rounded-md text-xs font-medium',
                'bg-gold/10 text-gold border border-gold/20',
                'hover:bg-gold/20 transition-colors',
              )}
            >
              \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629
            </button>
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-16">
            <svg
              className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-3 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm text-[var(--text-muted)]">
              \u0644\u0627 \u062A\u0648\u062C\u062F \u0625\u0639\u0644\u0627\u0646\u0627\u062A \u062D\u0627\u0644\u064A\u0627\u064B
            </p>
          </div>
        ) : (
          <>
            {/* Cards */}
            <div className="space-y-3">
              {announcements.map((item) => (
                <AnnouncementCard key={item.id} item={item} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2 pb-4">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm border transition-colors',
                    page <= 1
                      ? 'border-[#2A2A2A] text-[var(--text-muted)] cursor-not-allowed'
                      : 'border-[#D4A84B]/30 text-[#D4A84B] hover:bg-[#D4A84B]/10',
                  )}
                >
                  \u0627\u0644\u0633\u0627\u0628\u0642
                </button>
                <span className="text-sm text-[var(--text-secondary)]">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm border transition-colors',
                    page >= totalPages
                      ? 'border-[#2A2A2A] text-[var(--text-muted)] cursor-not-allowed'
                      : 'border-[#D4A84B]/30 text-[#D4A84B] hover:bg-[#D4A84B]/10',
                  )}
                >
                  \u0627\u0644\u062A\u0627\u0644\u064A
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
